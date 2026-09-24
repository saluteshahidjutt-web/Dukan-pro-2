import { 
  collection, 
  doc, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  getDoc, 
  getDocs, 
  query, 
  where, 
  orderBy, 
  limit,
  onSnapshot,
  arrayUnion,
  arrayRemove,
  FirestoreError
} from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from './firebase';
import { Product, Customer, Transaction, ShopSettings, Expense, UserProfile, ChatRoom, ChatMessage, CallSession } from '../types';
import { generateId } from './utils';

// Mock storage keys
const LOCAL_KEYS = {
  PRODUCTS: 'dukan_products',
  CUSTOMERS: 'dukan_customers',
  TRANSACTIONS: 'dukan_transactions',
  SETTINGS: 'dukan_settings',
  EXPENSES: 'dukan_expenses'
};

// Helper for local storage
const getLocal = <T>(key: string, defaultValue: T): T => {
  const data = localStorage.getItem(key);
  try {
    return data ? JSON.parse(data) : defaultValue;
  } catch (e) {
    console.error("Storage parse error", e);
    return defaultValue;
  }
};

const setLocal = <T>(key: string, data: T) => {
  localStorage.setItem(key, JSON.stringify(data));
  window.dispatchEvent(new Event('dukan_storage_update'));
};

export const getChatRoomId = (uid1: string, uid2: string): string => {
  const p0 = uid1.replace(/[^a-zA-Z0-9]/g, '_');
  const p1 = uid2.replace(/[^a-zA-Z0-9]/g, '_');
  const sortedClean = [p0, p1].sort();
  return `room_${sortedClean[0]}_${sortedClean[1]}`;
};

export const FirestoreService = {
  // --- Sync Logic ---
  syncLocalToCloud: async (userId: string) => {
    try {
      // Check if user already has data in the cloud
      const cloudP = await getDocs(query(collection(db, 'products'), where('ownerId', '==', userId), limit(1)));
      const cloudC = await getDocs(query(collection(db, 'customers'), where('ownerId', '==', userId), limit(1)));
      
      // If cloud has data, skip migration to avoid overwriting with stale local guest data
      if (!cloudP.empty || !cloudC.empty) {
        console.log("Cloud data exists. Skipping migration.");
        localStorage.setItem('dukan_has_migrated', 'true');
        return;
      }

      const localProducts = getLocal<Product[]>(LOCAL_KEYS.PRODUCTS, []);
      const localCustomers = getLocal<Customer[]>(LOCAL_KEYS.CUSTOMERS, []);
      const localTransactions = getLocal<Transaction[]>(LOCAL_KEYS.TRANSACTIONS, []);
      const localExpenses = getLocal<Expense[]>(LOCAL_KEYS.EXPENSES, []);
      const localSettings = getLocal<ShopSettings | null>(LOCAL_KEYS.SETTINGS, null);

      if (localProducts.length === 0 && localCustomers.length === 0 && localTransactions.length === 0 && localExpenses.length === 0 && !localSettings) {
        localStorage.setItem('dukan_has_migrated', 'true');
        return;
      }

      console.log("Empty cloud account. Migrating guest data...");

      for (const p of localProducts) {
        await setDoc(doc(db, 'products', p.id), { ...p, ownerId: userId });
      }
      for (const c of localCustomers) {
        await setDoc(doc(db, 'customers', c.id), { ...c, ownerId: userId });
      }
      for (const tx of localTransactions) {
        await setDoc(doc(db, 'transactions', tx.id), { ...tx, ownerId: userId });
      }
      for (const exp of localExpenses) {
        await setDoc(doc(db, 'expenses', exp.id), { ...exp, ownerId: userId });
      }
      if (localSettings) {
        await setDoc(doc(db, 'settings', userId), { ...localSettings, ownerId: userId });
      }

      localStorage.setItem('dukan_has_migrated', 'true');
      console.log("Migration complete.");
    } catch (e) {
      console.error("Sync failed", e);
    }
  },

  // --- Products ---
  getProducts: async () => {
    const userId = auth.currentUser?.uid;
    if (!userId) return getLocal<Product[]>(LOCAL_KEYS.PRODUCTS, []);
    try {
      const q = query(
        collection(db, 'products'), 
        where('ownerId', '==', userId),
        orderBy('name')
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => doc.data() as Product);
    } catch (e) {
      handleFirestoreError(e, OperationType.GET, 'products');
      return getLocal<Product[]>(LOCAL_KEYS.PRODUCTS, []);
    }
  },
  
  saveProduct: async (product: Product) => {
    const products = getLocal<Product[]>(LOCAL_KEYS.PRODUCTS, []);
    const index = products.findIndex(p => p.id === product.id);
    if (index > -1) products[index] = product;
    else products.push(product);
    setLocal(LOCAL_KEYS.PRODUCTS, products);

    const userId = auth.currentUser?.uid;
    if (!userId) return;

    try {
      await setDoc(doc(db, 'products', product.id), { ...product, ownerId: userId });
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `products/${product.id}`);
    }
  },

  deleteProduct: async (id: string) => {
    const products = getLocal<Product[]>(LOCAL_KEYS.PRODUCTS, []);
    setLocal(LOCAL_KEYS.PRODUCTS, products.filter(p => p.id !== id));

    const userId = auth.currentUser?.uid;
    if (!userId) return;

    try {
      await deleteDoc(doc(db, 'products', id));
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `products/${id}`);
    }
  },

  updateProduct: async (id: string, updates: Partial<Product>) => {
    const products = getLocal<Product[]>(LOCAL_KEYS.PRODUCTS, []);
    const index = products.findIndex(p => p.id === id);
    if (index > -1) {
      products[index] = { ...products[index], ...updates };
      setLocal(LOCAL_KEYS.PRODUCTS, products);
    }

    const userId = auth.currentUser?.uid;
    if (!userId) return;

    try {
      await updateDoc(doc(db, 'products', id), updates);
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `products/${id}`);
    }
  },

  // --- Customers ---
  getCustomers: async () => {
    const userId = auth.currentUser?.uid;
    if (!userId) return getLocal<Customer[]>(LOCAL_KEYS.CUSTOMERS, []);
    try {
      const q = query(
        collection(db, 'customers'), 
        where('ownerId', '==', userId),
        orderBy('name')
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => doc.data() as Customer);
    } catch (e) {
      handleFirestoreError(e, OperationType.GET, 'customers');
      return getLocal<Customer[]>(LOCAL_KEYS.CUSTOMERS, []);
    }
  },

  saveCustomer: async (customer: Customer) => {
    const customers = getLocal<Customer[]>(LOCAL_KEYS.CUSTOMERS, []);
    const index = customers.findIndex(c => c.id === customer.id);
    if (index > -1) customers[index] = customer;
    else customers.push(customer);
    setLocal(LOCAL_KEYS.CUSTOMERS, customers);

    const userId = auth.currentUser?.uid;
    if (!userId) return;

    try {
      await setDoc(doc(db, 'customers', customer.id), { ...customer, ownerId: userId });
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `customers/${customer.id}`);
    }
  },

  deleteCustomer: async (id: string) => {
    const customers = getLocal<Customer[]>(LOCAL_KEYS.CUSTOMERS, []);
    setLocal(LOCAL_KEYS.CUSTOMERS, customers.filter(c => c.id !== id));

    const userId = auth.currentUser?.uid;
    if (!userId) return;

    try {
      await deleteDoc(doc(db, 'customers', id));
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `customers/${id}`);
    }
  },

  updateCustomer: async (id: string, updates: Partial<Customer>) => {
    const customers = getLocal<Customer[]>(LOCAL_KEYS.CUSTOMERS, []);
    const index = customers.findIndex(c => c.id === id);
    if (index > -1) {
      customers[index] = { ...customers[index], ...updates };
      setLocal(LOCAL_KEYS.CUSTOMERS, customers);
    }

    const userId = auth.currentUser?.uid;
    if (!userId) return;

    try {
      await updateDoc(doc(db, 'customers', id), updates);
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `customers/${id}`);
    }
  },

  // --- Transactions ---
  getTransactions: async () => {
    const userId = auth.currentUser?.uid;
    if (!userId) return getLocal<Transaction[]>(LOCAL_KEYS.TRANSACTIONS, []);
    try {
      const q = query(
        collection(db, 'transactions'), 
        where('ownerId', '==', userId),
        orderBy('createdAt', 'desc')
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => doc.data() as Transaction);
    } catch (e) {
      handleFirestoreError(e, OperationType.GET, 'transactions');
      return getLocal<Transaction[]>(LOCAL_KEYS.TRANSACTIONS, []);
    }
  },

  saveTransaction: async (tx: Transaction) => {
    const transactions = getLocal<Transaction[]>(LOCAL_KEYS.TRANSACTIONS, []);
    const index = transactions.findIndex(t => t.id === tx.id);
    if (index > -1) transactions[index] = tx;
    else transactions.unshift(tx);
    setLocal(LOCAL_KEYS.TRANSACTIONS, transactions);

    const userId = auth.currentUser?.uid;
    if (!userId) return;

    try {
      await setDoc(doc(db, 'transactions', tx.id), { ...tx, ownerId: userId });
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `transactions/${tx.id}`);
    }
  },

  deleteTransaction: async (id: string) => {
    const transactions = getLocal<Transaction[]>(LOCAL_KEYS.TRANSACTIONS, []);
    const updatedTransactions = transactions.map(t => 
      t.id === id ? { ...t, isDeleted: true, deletedAt: new Date().toISOString() } : t
    );
    setLocal(LOCAL_KEYS.TRANSACTIONS, updatedTransactions);

    const userId = auth.currentUser?.uid;
    if (!userId) return;

    try {
      await updateDoc(doc(db, 'transactions', id), { 
        isDeleted: true, 
        deletedAt: new Date().toISOString() 
      });
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `transactions/${id}`);
    }
  },

  clearSingleTransactionFromLog: async (id: string) => {
    // Update local immediately
    const transactions = getLocal<Transaction[]>(LOCAL_KEYS.TRANSACTIONS, []);
    const updatedTransactions = transactions.map(t => 
      t.id === id ? { ...t, isClearedFromLog: true } : t
    );
    setLocal(LOCAL_KEYS.TRANSACTIONS, updatedTransactions);

    const userId = auth.currentUser?.uid;
    if (!userId) return;

    try {
      await updateDoc(doc(db, 'transactions', id), { 
        isClearedFromLog: true 
      });
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `transactions/${id}`);
    }
  },

  deleteAllTransactions: async () => {
    // 1. Update local transactions
    const transactions = getLocal<Transaction[]>(LOCAL_KEYS.TRANSACTIONS, []);
    const updatedTransactions = transactions.map(t => ({ ...t, isClearedFromLog: true }));
    setLocal(LOCAL_KEYS.TRANSACTIONS, updatedTransactions);

    const userId = auth.currentUser?.uid;
    if (!userId) return;

    // 2. Mark transactions as cleared from log in Firestore
    try {
      const q = query(
        collection(db, 'transactions'), 
        where('ownerId', '==', userId)
      );
      const snapshot = await getDocs(q);
      
      // Update documents
      for (const docSnapshot of snapshot.docs) {
        await updateDoc(docSnapshot.ref, {
          isClearedFromLog: true
        });
      }
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `transactions/all`);
    }
  },

  processReturn: async (originalTx: Transaction) => {
    // 1. Mark original as deleted
    const transactions = getLocal<Transaction[]>(LOCAL_KEYS.TRANSACTIONS, []);
    const updatedTransactions = transactions.map(t => 
      t.id === originalTx.id ? { ...t, isDeleted: true, deletedAt: new Date().toISOString() } : t
    );
    
    // 2. Add return transaction
    const returnTx: Transaction = {
      ...originalTx,
      id: generateId(),
      type: 'return',
      amount: originalTx.amount, // Or negative? Let's keep it positive for now
      description: `Return: ${originalTx.description}`,
      createdAt: new Date().toISOString(),
      isDeleted: false
    };
    
    updatedTransactions.unshift(returnTx);
    setLocal(LOCAL_KEYS.TRANSACTIONS, updatedTransactions);

    const userId = auth.currentUser?.uid;
    if (!userId) return;

    try {
      await updateDoc(doc(db, 'transactions', originalTx.id), { 
        isDeleted: true, 
        deletedAt: new Date().toISOString() 
      });
      await setDoc(doc(db, 'transactions', returnTx.id), { ...returnTx, ownerId: userId });
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `transactions/${originalTx.id}`);
    }
  },

  // --- Settings ---
  getSettings: async () => {
    const userId = auth.currentUser?.uid;
    if (!userId) return getLocal<ShopSettings | null>(LOCAL_KEYS.SETTINGS, null);
    try {
      const d = await getDoc(doc(db, 'settings', userId));
      return d.exists() ? d.data() as ShopSettings : getLocal<ShopSettings | null>(LOCAL_KEYS.SETTINGS, null);
    } catch (e) {
      handleFirestoreError(e, OperationType.GET, `settings/${auth.currentUser?.uid}`);
      return getLocal<ShopSettings | null>(LOCAL_KEYS.SETTINGS, null);
    }
  },

  saveSettings: async (settings: ShopSettings) => {
    setLocal(LOCAL_KEYS.SETTINGS, settings);
    const userId = auth.currentUser?.uid;
    if (!userId) return;
    try {
      await setDoc(doc(db, 'settings', userId), { ...settings, ownerId: userId });
      if (settings.phone) {
        await FirestoreService.syncUserProfile({
          name: settings.name || auth.currentUser?.displayName || 'User',
          phone: settings.phone,
          photoURL: settings.logoUrl || settings.photoURL || auth.currentUser?.photoURL || ''
        });
      }
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `settings/${auth.currentUser?.uid}`);
    }
  },

  checkIfNewUser: async () => {
    const settings = await FirestoreService.getSettings();
    return !settings;
  },

  // --- Listeners ---
  subscribeToProducts: (callback: (products: Product[]) => void) => {
    const userId = auth.currentUser?.uid;
    if (!userId) {
      const handler = () => FirestoreService.getProducts().then(callback).catch(() => {});
      window.addEventListener('dukan_storage_update', handler);
      handler();
      return () => window.removeEventListener('dukan_storage_update', handler);
    }
    return onSnapshot(
      query(collection(db, 'products'), where('ownerId', '==', userId), orderBy('name')),
      (snapshot) => {
        const products = snapshot.docs.map(doc => doc.data() as Product);
        // Sync to localStorage so offline support works even if app was closed
        setLocal(LOCAL_KEYS.PRODUCTS, products);
        callback(products);
      },
      (e) => {
        try {
          handleFirestoreError(e, OperationType.LIST, 'products');
        } catch (err) {
          console.error("Snapshot error handled", err);
        }
      }
    );
  },

  subscribeToCustomers: (callback: (customers: Customer[]) => void) => {
    const userId = auth.currentUser?.uid;
    if (!userId) {
      const handler = () => FirestoreService.getCustomers().then(callback).catch(() => {});
      window.addEventListener('dukan_storage_update', handler);
      handler();
      return () => window.removeEventListener('dukan_storage_update', handler);
    }
    return onSnapshot(
      query(collection(db, 'customers'), where('ownerId', '==', userId), orderBy('name')),
      (snapshot) => {
        const customers = snapshot.docs.map(doc => doc.data() as Customer);
        setLocal(LOCAL_KEYS.CUSTOMERS, customers);
        callback(customers);
      },
      (e) => {
        try {
          handleFirestoreError(e, OperationType.LIST, 'customers');
        } catch (err) {
          console.error("Snapshot error handled", err);
        }
      }
    );
  },

  subscribeToTransactions: (callback: (txs: Transaction[]) => void) => {
    const userId = auth.currentUser?.uid;
    if (!userId) {
      const handler = () => FirestoreService.getTransactions().then(callback).catch(() => {});
      window.addEventListener('dukan_storage_update', handler);
      handler();
      return () => window.removeEventListener('dukan_storage_update', handler);
    }
    return onSnapshot(
      query(collection(db, 'transactions'), where('ownerId', '==', userId), orderBy('createdAt', 'desc')),
      (snapshot) => {
        const txs = snapshot.docs.map(doc => doc.data() as Transaction);
        setLocal(LOCAL_KEYS.TRANSACTIONS, txs);
        callback(txs);
      },
      (e) => {
        try {
          handleFirestoreError(e, OperationType.LIST, 'transactions');
        } catch (err) {
          console.error("Snapshot error handled", err);
        }
      }
    );
  },

  subscribeToSettings: (callback: (settings: ShopSettings | null) => void) => {
    const userId = auth.currentUser?.uid;
    if (!userId) {
      const handler = () => FirestoreService.getSettings().then(callback).catch(() => {});
      window.addEventListener('dukan_storage_update', handler);
      handler();
      return () => window.removeEventListener('dukan_storage_update', handler);
    }
    return onSnapshot(
      doc(db, 'settings', userId),
      (snapshot) => {
        const settings = snapshot.exists() ? snapshot.data() as ShopSettings : null;
        if (settings) setLocal(LOCAL_KEYS.SETTINGS, settings);
        callback(settings);
      },
      (e) => {
        try {
          handleFirestoreError(e, OperationType.GET, `settings/${userId}`);
        } catch (err) {
          console.error("Snapshot error handled", err);
        }
      }
    );
  },

  // --- Remote Scanner Sessions (Phone Scanner Bridge) ---
  listenToScannerSession: (shopId: string, callback: (barcode: string) => void) => {
    // Listens for incoming barcodes from the Mobile App
    const sessionRef = doc(db, 'scanner_sessions', shopId);
    return onSnapshot(sessionRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        if (data.current_barcode && data.current_barcode.trim() !== '') {
          callback(data.current_barcode);
        }
      }
    }, (err) => {
      console.warn("Scanner session subscription notice:", err);
    });
  },

  resetScannerSession: async (shopId: string) => {
    // Clears the barcode after processing so the next item can be scanned
    try {
      const sessionRef = doc(db, 'scanner_sessions', shopId);
      await setDoc(sessionRef, { current_barcode: '' }, { merge: true });
    } catch (e) {
      console.error('Failed to reset scanner session', e);
    }
  },

  setPCActiveState: async (shopId: string, isActive: boolean) => {
    try {
      const sessionRef = doc(db, 'scanner_sessions', shopId);
      await setDoc(sessionRef, { 
        pc_status: isActive ? 'active' : 'idle',
        last_pc_action: Date.now()
      }, { merge: true });
    } catch (e) {
      console.error('Failed to update PC active state', e);
    }
  },

  updateMobileBarcode: async (shopId: string, barcode: string) => {
    try {
      const sessionRef = doc(db, 'scanner_sessions', shopId);
      await setDoc(sessionRef, { 
        current_barcode: barcode,
        last_scanned_at: Date.now()
      }, { merge: true });
    } catch (e) {
      console.error('Failed to update scanned barcode from mobile', e);
    }
  },

  requestMobileScan: async (shopId: string) => {
    try {
      const sessionRef = doc(db, 'scanner_sessions', shopId);
      await setDoc(sessionRef, { 
        pc_request_scan: true,
        pc_request_scan_time: Date.now()
      }, { merge: true });
    } catch (e) {
      console.error('Failed to request mobile scan', e);
    }
  },

  resetMobileScanRequest: async (shopId: string) => {
    try {
      const sessionRef = doc(db, 'scanner_sessions', shopId);
      await setDoc(sessionRef, { 
        pc_request_scan: false,
        pc_request_scan_time: null
      }, { merge: true });
    } catch (e) {
      console.error('Failed to reset mobile scan request', e);
    }
  },

  // --- Expenses ---
  getExpenses: async () => {
    const userId = auth.currentUser?.uid;
    if (!userId) return getLocal<Expense[]>(LOCAL_KEYS.EXPENSES, []);
    try {
      const q = query(
        collection(db, 'expenses'), 
        where('ownerId', '==', userId),
        orderBy('createdAt', 'desc')
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => doc.data() as Expense);
    } catch (e) {
      handleFirestoreError(e, OperationType.GET, 'expenses');
      return getLocal<Expense[]>(LOCAL_KEYS.EXPENSES, []);
    }
  },

  saveExpense: async (expense: Expense) => {
    const expenses = getLocal<Expense[]>(LOCAL_KEYS.EXPENSES, []);
    const index = expenses.findIndex(e => e.id === expense.id);
    if (index > -1) {
      expenses[index] = expense;
    } else {
      expenses.unshift(expense);
    }
    setLocal(LOCAL_KEYS.EXPENSES, expenses);

    const userId = auth.currentUser?.uid;
    if (!userId) return;

    try {
      await setDoc(doc(db, 'expenses', expense.id), { ...expense, ownerId: userId });
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `expenses/${expense.id}`);
    }
  },

  deleteExpense: async (id: string) => {
    const expenses = getLocal<Expense[]>(LOCAL_KEYS.EXPENSES, []);
    setLocal(LOCAL_KEYS.EXPENSES, expenses.filter(e => e.id !== id));

    const userId = auth.currentUser?.uid;
    if (!userId) return;

    try {
      await deleteDoc(doc(db, 'expenses', id));
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `expenses/${id}`);
    }
  },

  subscribeToExpenses: (callback: (expenses: Expense[]) => void) => {
    const userId = auth.currentUser?.uid;
    if (!userId) {
      const handler = () => FirestoreService.getExpenses().then(callback).catch(() => {});
      window.addEventListener('dukan_storage_update', handler);
      handler();
      return () => window.removeEventListener('dukan_storage_update', handler);
    }
    return onSnapshot(
      query(collection(db, 'expenses'), where('ownerId', '==', userId), orderBy('createdAt', 'desc')),
      (snapshot) => {
        const expenses = snapshot.docs.map(doc => doc.data() as Expense);
        setLocal(LOCAL_KEYS.EXPENSES, expenses);
        callback(expenses);
      },
      (e) => {
        try {
          handleFirestoreError(e, OperationType.LIST, 'expenses');
        } catch (err) {
          console.error("Snapshot error handled", err);
        }
      }
    );
  },

  // --- User Profiles for Chat Search ---
  syncUserProfile: async (profile: { name: string; phone: string; photoURL?: string }) => {
    const user = auth.currentUser;
    if (!user) return;
    try {
      const cleanedPhone = profile.phone.replace(/[\s\-\+]/g, '');
      const userDoc: UserProfile = {
        id: user.uid,
        uid: user.uid,
        name: profile.name,
        phone: cleanedPhone,
        photoURL: profile.photoURL || user.photoURL || '',
        status: 'Hey there! I am using Dukaan Pro Chat',
        updatedAt: new Date().toISOString()
      };
      await setDoc(doc(db, 'users', user.uid), userDoc, { merge: true });
    } catch (e) {
      console.warn("UserProfile sync skipped or offline:", e);
    }
  },

  updateUserProfilePhone: async (phone: string, name?: string) => {
    const user = auth.currentUser;
    if (!user) return false;
    const cleanPhone = phone.trim().replace(/[\s\-\+]/g, '');
    try {
      // 1. Check if another user profile previously held this phone number
      try {
        const usersRef = collection(db, 'users');
        const existingQuery = query(usersRef, where('phone', '==', cleanPhone), limit(5));
        const snap = await getDocs(existingQuery);
        for (const docSnap of snap.docs) {
          if (docSnap.id !== user.uid) {
            // Detach duplicate phone from previous account so incoming calls/search map strictly to current active user
            await setDoc(doc(db, 'users', docSnap.id), {
              phone: '',
              phoneTransferredTo: user.uid,
              updatedAt: new Date().toISOString()
            }, { merge: true }).catch(() => {});
          }
        }
      } catch (e) {
        console.warn("Phone duplicate check skipped or offline:", e);
      }

      // 2. Set phone on current user's profile
      await setDoc(doc(db, 'users', user.uid), {
        id: user.uid,
        uid: user.uid,
        phone: cleanPhone,
        ...(name ? { name } : {}),
        updatedAt: new Date().toISOString()
      }, { merge: true });

      const settingsRef = doc(db, 'settings', user.uid);
      await updateDoc(settingsRef, {
        phone: cleanPhone,
        ...(name ? { name } : {}),
        updatedAt: new Date().toISOString()
      }).catch(() => {});

      const localSettings = getLocal<ShopSettings | null>(LOCAL_KEYS.SETTINGS, null);
      if (localSettings) {
        setLocal(LOCAL_KEYS.SETTINGS, {
          ...localSettings,
          phone: cleanPhone,
          ...(name ? { name } : {})
        });
      }
      return true;
    } catch (e) {
      console.warn("Update user profile phone err:", e);
      return false;
    }
  },

  updateParticipantPhone: async (roomId: string, targetUid: string, phone: string, name?: string) => {
    const cleanPhone = phone.trim().replace(/[\s\-\+]/g, '');
    try {
      const roomRef = doc(db, 'chat_rooms', roomId);
      const updates: any = {
        [`participantDetails.${targetUid}.phone`]: cleanPhone,
        updatedAt: new Date().toISOString()
      };
      if (name) {
        updates[`participantDetails.${targetUid}.name`] = name;
      }
      await updateDoc(roomRef, updates);

      const userRef = doc(db, 'users', targetUid);
      await setDoc(userRef, {
        id: targetUid,
        uid: targetUid,
        phone: cleanPhone,
        ...(name ? { name } : {}),
        updatedAt: new Date().toISOString()
      }, { merge: true });

      return true;
    } catch (e) {
      console.warn("Update participant phone error:", e);
      return false;
    }
  },

  searchUserByPhone: async (phoneInput: string): Promise<UserProfile[]> => {
    if (!phoneInput || phoneInput.trim().length < 2) return [];
    const clean = phoneInput.replace(/[\s\-\+]/g, '');
    try {
      const usersRef = collection(db, 'users');
      // Search with prefix
      const q = query(usersRef, where('phone', '>=', clean), where('phone', '<=', clean + '\uf8ff'), limit(15));
      const snap = await getDocs(q);
      const results: UserProfile[] = [];
      snap.forEach(docSnap => {
        const u = docSnap.data() as UserProfile;
        if (u.uid !== auth.currentUser?.uid) {
          results.push(u);
        }
      });

      // If user typed e.g. "0321..." but database stored without leading 0 (e.g. "321...")
      if (clean.startsWith('0') && results.length === 0) {
        const withoutZero = clean.substring(1);
        const q2 = query(usersRef, where('phone', '>=', withoutZero), where('phone', '<=', withoutZero + '\uf8ff'), limit(15));
        const snap2 = await getDocs(q2);
        snap2.forEach(docSnap => {
          const u = docSnap.data() as UserProfile;
          if (u.uid !== auth.currentUser?.uid && !results.some(r => r.uid === u.uid)) {
            results.push(u);
          }
        });
      }

      // If clean starts with "92" (Pakistan country code) and database has "03..."
      if (clean.startsWith('92') && results.length === 0) {
        const withZero = '0' + clean.substring(2);
        const q3 = query(usersRef, where('phone', '>=', withZero), where('phone', '<=', withZero + '\uf8ff'), limit(15));
        const snap3 = await getDocs(q3);
        snap3.forEach(docSnap => {
          const u = docSnap.data() as UserProfile;
          if (u.uid !== auth.currentUser?.uid && !results.some(r => r.uid === u.uid)) {
            results.push(u);
          }
        });
      }

      // If clean doesn't start with 0 or 92 (e.g. "321..."), also check "0321..."
      if (!clean.startsWith('0') && !clean.startsWith('92') && results.length === 0) {
        const withZero = '0' + clean;
        const q4 = query(usersRef, where('phone', '>=', withZero), where('phone', '<=', withZero + '\uf8ff'), limit(15));
        const snap4 = await getDocs(q4);
        snap4.forEach(docSnap => {
          const u = docSnap.data() as UserProfile;
          if (u.uid !== auth.currentUser?.uid && !results.some(r => r.uid === u.uid)) {
            results.push(u);
          }
        });
      }

      return results;
    } catch (e) {
      console.warn("Search user by phone error:", e);
      return [];
    }
  },

  // --- Chat Rooms ---
  getOrCreateChatRoom: async (otherUser: UserProfile, currentUserProfile?: { name: string; phone: string; photoURL?: string }): Promise<ChatRoom> => {
    const currentUid = auth.currentUser?.uid;
    if (!currentUid) throw new Error("Must be logged in to chat");

    const p0 = currentUid.replace(/[^a-zA-Z0-9]/g, '_');
    const p1 = otherUser.uid.replace(/[^a-zA-Z0-9]/g, '_');
    const sortedParticipants = [currentUid, otherUser.uid].sort();
    const sortedClean = [p0, p1].sort();
    const roomId = `room_${sortedClean[0]}_${sortedClean[1]}`;
    const roomRef = doc(db, 'chat_rooms', roomId);

    const currentName = currentUserProfile?.name || auth.currentUser?.displayName || 'User';
    const currentPhone = currentUserProfile?.phone || '';
    const currentPhoto = currentUserProfile?.photoURL || auth.currentUser?.photoURL || '';

    try {
      const roomSnap = await getDoc(roomRef);
      if (roomSnap.exists()) {
        const existingData = roomSnap.data() as ChatRoom;
        // Make sure participant details are up-to-date
        return {
          ...existingData,
          participantDetails: {
            ...existingData.participantDetails,
            [currentUid]: {
              name: currentName,
              phone: currentPhone,
              photoURL: currentPhoto
            },
            [otherUser.uid]: {
              name: otherUser.name,
              phone: otherUser.phone,
              photoURL: otherUser.photoURL || ''
            }
          }
        };
      }
    } catch (e) {
      console.warn("Notice: room check, creating fresh room:", e);
    }

    const newRoom: ChatRoom = {
      id: roomId,
      participants: sortedParticipants,
      participantDetails: {
        [currentUid]: {
          name: currentName,
          phone: currentPhone,
          photoURL: currentPhoto
        },
        [otherUser.uid]: {
          name: otherUser.name,
          phone: otherUser.phone,
          photoURL: otherUser.photoURL || ''
        }
      },
      lastMessageText: 'Chat started',
      lastMessageType: 'text',
      lastMessageSenderId: currentUid,
      updatedAt: new Date().toISOString()
    };

    try {
      await setDoc(roomRef, newRoom, { merge: true });
      return newRoom;
    } catch (e) {
      console.warn("Could not setDoc on chat_rooms:", e);
      return newRoom;
    }
  },

  subscribeToChatRooms: (callback: (rooms: ChatRoom[]) => void) => {
    const currentUid = auth.currentUser?.uid;
    if (!currentUid) {
      callback([]);
      return () => {};
    }

    const q = query(
      collection(db, 'chat_rooms'),
      where('participants', 'array-contains', currentUid)
    );

    return onSnapshot(
      q,
      (snapshot) => {
        const rawRooms = snapshot.docs.map(d => ({ ...(d.data() as ChatRoom), id: d.id }));
        
        // Robust deduplication by UID, Phone number, or Participant Name
        const roomsMap = new Map<string, ChatRoom>();
        for (const room of rawRooms) {
          const otherUid = room.participants?.find(p => p !== currentUid);
          const otherDetails = otherUid && room.participantDetails ? room.participantDetails[otherUid] : undefined;
          
          // Generate a unified deduplication key
          const dedupKey = otherUid 
            ? `uid_${otherUid}` 
            : (otherDetails?.phone 
                ? `phone_${otherDetails.phone.replace(/[^0-9]/g, '')}` 
                : (otherDetails?.name ? `name_${otherDetails.name.trim().toLowerCase()}` : room.id));

          const existing = roomsMap.get(dedupKey);
          if (!existing) {
            roomsMap.set(dedupKey, room);
          } else {
            const existingTime = new Date(existing.updatedAt || 0).getTime();
            const currentTime = new Date(room.updatedAt || 0).getTime();
            // Keep the room with the latest message/update
            if (currentTime >= existingTime) {
              roomsMap.set(dedupKey, room);
            }
          }
        }

        const rooms = Array.from(roomsMap.values());
        rooms.sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime());
        callback(rooms);
      },
      (e) => {
        console.warn("Chat rooms subscription error:", e);
      }
    );
  },

  toggleArchiveChatRoom: async (roomId: string, currentArchived: boolean) => {
    const currentUid = auth.currentUser?.uid;
    if (!currentUid) return;
    const roomRef = doc(db, 'chat_rooms', roomId);
    try {
      if (currentArchived) {
        await updateDoc(roomRef, {
          archivedBy: arrayRemove(currentUid),
          updatedAt: new Date().toISOString()
        });
      } else {
        await updateDoc(roomRef, {
          archivedBy: arrayUnion(currentUid),
          updatedAt: new Date().toISOString()
        });
      }
    } catch (e) {
      console.warn("Toggle archive failed:", e);
    }
  },

  deleteChatRoomForUser: async (roomId: string) => {
    const currentUid = auth.currentUser?.uid;
    if (!currentUid) return;
    const roomRef = doc(db, 'chat_rooms', roomId);
    try {
      await updateDoc(roomRef, {
        deletedFor: arrayUnion(currentUid),
        updatedAt: new Date().toISOString()
      });
    } catch (e) {
      console.warn("Delete chat failed:", e);
    }
  },

  // --- Messages ---
  sendMessage: async (roomId: string, message: { text?: string; audioData?: string; audioDuration?: number; imageData?: string; type: 'text' | 'voice' | 'image' }) => {
    const currentUid = auth.currentUser?.uid;
    if (!currentUid) throw new Error("Must be logged in to send message");

    const msgId = `msg_${generateId()}`;
    const msgRef = doc(db, 'chat_rooms', roomId, 'messages', msgId);
    const roomRef = doc(db, 'chat_rooms', roomId);

    let lastPreview = message.text || '';
    if (message.type === 'voice') lastPreview = '🎙️ Voice note';
    if (message.type === 'image') lastPreview = '📷 Photo';

    const chatMsg: ChatMessage = {
      id: msgId,
      roomId,
      senderId: currentUid,
      senderName: auth.currentUser?.displayName || 'User',
      type: message.type,
      text: message.text || '',
      audioData: message.audioData || '',
      audioDuration: message.audioDuration || 0,
      imageData: message.imageData || '',
      createdAt: new Date().toISOString()
    };

    try {
      await setDoc(msgRef, chatMsg);
      // Update room last message
      await updateDoc(roomRef, {
        lastMessageText: lastPreview,
        lastMessageType: message.type,
        lastMessageSenderId: currentUid,
        updatedAt: new Date().toISOString()
      }).catch(e => {
        console.warn("Could not update room preview:", e);
      });
      return chatMsg;
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, `chat_rooms/${roomId}/messages/${msgId}`);
      throw e;
    }
  },

  // Log Call Events (Missed Calls, Call Completed, Declined) directly in the Chat Room
  sendCallLogMessage: async (
    caller: { uid: string; name: string; phone?: string; photoURL?: string },
    receiver: { uid: string; name: string; phone?: string; photoURL?: string },
    status: 'missed' | 'completed' | 'rejected' | 'busy',
    durationSeconds: number = 0,
    callId?: string
  ) => {
    try {
      const sortedParticipants = [caller.uid, receiver.uid].sort();
      const roomId = getChatRoomId(caller.uid, receiver.uid);
      const roomRef = doc(db, 'chat_rooms', roomId);

      // Ensure room exists
      await setDoc(roomRef, {
        id: roomId,
        participants: sortedParticipants,
        participantDetails: {
          [caller.uid]: {
            name: caller.name,
            phone: caller.phone || '',
            photoURL: caller.photoURL || ''
          },
          [receiver.uid]: {
            name: receiver.name,
            phone: receiver.phone || '',
            photoURL: receiver.photoURL || ''
          }
        },
        updatedAt: new Date().toISOString()
      }, { merge: true });

      const msgId = `call_${generateId()}`;
      const msgRef = doc(db, 'chat_rooms', roomId, 'messages', msgId);

      const mins = Math.floor(durationSeconds / 60);
      const secs = durationSeconds % 60;
      const formattedDuration = mins > 0 
        ? `${mins}m ${secs}s`
        : `${secs}s`;

      let callText = 'Missed voice call';
      let previewText = '📞 Missed voice call';

      if (status === 'completed') {
        callText = `Voice call (${formattedDuration})`;
        previewText = `📞 Voice call (${formattedDuration})`;
      } else if (status === 'rejected') {
        callText = 'Call declined';
        previewText = '📞 Call declined';
      } else if (status === 'busy') {
        callText = 'Line busy';
        previewText = '📞 Line busy';
      }

      const chatMsg: ChatMessage = {
        id: msgId,
        roomId,
        senderId: caller.uid,
        senderName: caller.name,
        type: 'call',
        text: callText,
        callInfo: {
          callId: callId || msgId,
          status,
          duration: durationSeconds,
          callerId: caller.uid,
          receiverId: receiver.uid
        },
        createdAt: new Date().toISOString()
      };

      await setDoc(msgRef, chatMsg);

      await updateDoc(roomRef, {
        lastMessageText: previewText,
        lastMessageType: 'call',
        lastMessageSenderId: caller.uid,
        lastMessageCallStatus: status,
        updatedAt: new Date().toISOString()
      }).catch(e => {
        console.warn("Could not update chat room call preview:", e);
      });

      return chatMsg;
    } catch (e) {
      console.warn("Failed to record call log message:", e);
      return null;
    }
  },

  subscribeToMessages: (roomId: string, callback: (messages: ChatMessage[]) => void) => {
    const q = query(
      collection(db, 'chat_rooms', roomId, 'messages'),
      orderBy('createdAt', 'asc')
    );

    return onSnapshot(
      q,
      (snapshot) => {
        const msgs = snapshot.docs.map(d => d.data() as ChatMessage);
        callback(msgs);
      },
      (e) => {
        console.warn(`Messages subscription error for room ${roomId}:`, e);
      }
    );
  },

  subscribeToCallHistory: (callback: (calls: CallSession[]) => void) => {
    const currentUid = auth.currentUser?.uid;
    if (!currentUid) {
      callback([]);
      return () => {};
    }

    const q1 = query(
      collection(db, 'calls'),
      where('callerId', '==', currentUid)
    );
    const q2 = query(
      collection(db, 'calls'),
      where('receiverId', '==', currentUid)
    );

    let calls1: CallSession[] = [];
    let calls2: CallSession[] = [];

    const update = () => {
      const combinedMap = new Map<string, CallSession>();
      [...calls1, ...calls2].forEach(c => combinedMap.set(c.id, c));
      const list = Array.from(combinedMap.values());
      list.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
      callback(list);
    };

    const unsub1 = onSnapshot(q1, snap => {
      calls1 = snap.docs.map(d => ({ id: d.id, ...d.data() } as CallSession));
      update();
    }, (err) => console.warn("Call history q1 err:", err));

    const unsub2 = onSnapshot(q2, snap => {
      calls2 = snap.docs.map(d => ({ id: d.id, ...d.data() } as CallSession));
      update();
    }, (err) => console.warn("Call history q2 err:", err));

    return () => {
      unsub1();
      unsub2();
    };
  }
};

