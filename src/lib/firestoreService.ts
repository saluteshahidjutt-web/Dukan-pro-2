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

// Helper: Normalize phone numbers across formats (+92, 92, 03xx, 3xx)
export const normalizePhoneNumber = (phone: string): { standard: string; withoutZero: string; withCountry: string; canonical: string } => {
  const rawDigits = phone.replace(/[^0-9]/g, '');
  let standard = rawDigits;
  let withoutZero = rawDigits;
  let withCountry = rawDigits;
  let canonical = rawDigits;

  if (rawDigits.startsWith('92') && rawDigits.length >= 11) {
    withoutZero = rawDigits.slice(2);
    standard = '0' + withoutZero;
    withCountry = rawDigits;
    canonical = withoutZero;
  } else if (rawDigits.startsWith('0') && rawDigits.length >= 10) {
    withoutZero = rawDigits.slice(1);
    standard = rawDigits;
    withCountry = '92' + withoutZero;
    canonical = withoutZero;
  } else if (rawDigits.length === 10) {
    withoutZero = rawDigits;
    standard = '0' + rawDigits;
    withCountry = '92' + rawDigits;
    canonical = rawDigits;
  }

  return { standard, withoutZero, withCountry, canonical };
};

export const FirestoreService = {
  // Check if a phone number is already registered by another account / user email
  checkPhoneAvailability: async (phoneInput: string): Promise<{ available: boolean; existingUser?: { uid: string; email?: string; name?: string; phoneVerified?: boolean } }> => {
    const currentUid = auth.currentUser?.uid;
    const cleanDigits = phoneInput.replace(/[^0-9]/g, '');
    if (!cleanDigits || cleanDigits.length < 9) {
      return { available: true };
    }

    const { standard, withoutZero, withCountry, canonical } = normalizePhoneNumber(phoneInput);
    const variants = Array.from(new Set([standard, withoutZero, withCountry, canonical, cleanDigits])).filter(v => v.length >= 9);

    try {
      const usersRef = collection(db, 'users');
      for (const variant of variants) {
        const q = query(usersRef, where('phone', '==', variant), limit(5));
        const snap = await getDocs(q);
        for (const docSnap of snap.docs) {
          const data = docSnap.data() as UserProfile & { email?: string; phoneVerified?: boolean };
          // If another user (different UID) has this phone number
          if (docSnap.id !== currentUid && data.uid !== currentUid) {
            // CRITICAL: Only mark unavailable if that other user has VERIFIED this number (phoneVerified === true).
            // Ghost syncs or unverified entries from guest mode or drafts should NEVER block another user!
            if (data.phoneVerified === true) {
              return {
                available: false,
                existingUser: {
                  uid: data.uid || docSnap.id,
                  email: data.email,
                  name: data.name,
                  phoneVerified: true
                }
              };
            }
          }
        }
      }
    } catch (e) {
      console.warn("checkPhoneAvailability notice:", e);
    }

    return { available: true };
  },

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
      if (settings.phone && settings.phoneVerified) {
        await FirestoreService.syncUserProfile({
          name: settings.name || auth.currentUser?.displayName || 'User',
          phone: settings.phone,
          phoneVerified: true,
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
  syncUserProfile: async (profile: { name: string; phone?: string; phoneVerified?: boolean; photoURL?: string }) => {
    const user = auth.currentUser;
    if (!user) return;
    try {
      const cleanDigits = (profile.phone || '').replace(/[^0-9]/g, '');
      const isVerified = profile.phoneVerified === true && cleanDigits.length >= 9;
      const { standard } = cleanDigits.length >= 9 ? normalizePhoneNumber(profile.phone || '') : { standard: '' };

      const userDoc: any = {
        id: user.uid,
        uid: user.uid,
        name: profile.name || user.displayName || 'User',
        email: user.email || '',
        photoURL: profile.photoURL || user.photoURL || '',
        status: 'Hey there! I am using Dukaan Pro Chat',
        updatedAt: new Date().toISOString()
      };

      // CRITICAL: Only claim phone in public users collection if verified!
      // If profile explicitly cleared phone, clear it. If unverified, do not publish phone.
      if (isVerified) {
        userDoc.phone = standard;
        userDoc.phoneVerified = true;
      } else if (profile.phone === '') {
        userDoc.phone = '';
        userDoc.phoneVerified = false;
      }

      await setDoc(doc(db, 'users', user.uid), userDoc, { merge: true });
    } catch (e) {
      console.warn("UserProfile sync skipped or offline:", e);
    }
  },

  updateUserProfilePhone: async (phone: string, name?: string, allowTransfer: boolean = false) => {
    const user = auth.currentUser;
    if (!user) return false;
    const { standard } = normalizePhoneNumber(phone);
    if (!standard || standard.length < 9) return false;

    // 1. Strict 1-to-1 account enforcement: Verify this number is NOT claimed by another email / account
    const availability = await FirestoreService.checkPhoneAvailability(standard);
    if (!availability.available && !allowTransfer) {
      const otherInfo = availability.existingUser?.email ? ` (${availability.existingUser.email})` : '';
      throw new Error(`This phone number is already registered with another account${otherInfo}. One number can only be connected to one user account / email.`);
    }

    try {
      // 2. If allowTransfer is enabled (user completed WhatsApp OTP verification), release from any old doc
      if (allowTransfer) {
        try {
          const usersRef = collection(db, 'users');
          const { standard, withoutZero, withCountry, canonical } = normalizePhoneNumber(phone);
          const variants = Array.from(new Set([standard, withoutZero, withCountry, canonical])).filter(v => v.length >= 9);
          for (const variant of variants) {
            const q = query(usersRef, where('phone', '==', variant), limit(5));
            const snap = await getDocs(q);
            for (const docSnap of snap.docs) {
              if (docSnap.id !== user.uid) {
                await setDoc(doc(db, 'users', docSnap.id), {
                  phone: '',
                  phoneVerified: false,
                  updatedAt: new Date().toISOString()
                }, { merge: true }).catch(() => {});
              }
            }
          }
        } catch (cleanErr) {
          console.warn("Transfer clean notice:", cleanErr);
        }
      }

      // 3. Set phone and email on current user's profile with phoneVerified = true
      await setDoc(doc(db, 'users', user.uid), {
        id: user.uid,
        uid: user.uid,
        phone: standard,
        phoneVerified: true,
        email: user.email || '',
        name: name || user.displayName || 'User',
        photoURL: user.photoURL || '',
        status: 'Hey there! I am using Dukaan Pro Chat',
        updatedAt: new Date().toISOString()
      }, { merge: true });

      const settingsRef = doc(db, 'settings', user.uid);
      await updateDoc(settingsRef, {
        phone: standard,
        phoneVerified: true,
        ...(name ? { name } : {}),
        updatedAt: new Date().toISOString()
      }).catch(() => {});

      const localSettings = getLocal<ShopSettings | null>(LOCAL_KEYS.SETTINGS, null);
      if (localSettings) {
        setLocal(LOCAL_KEYS.SETTINGS, {
          ...localSettings,
          phone: standard,
          phoneVerified: true,
          ...(name ? { name } : {})
        });
      }
      window.dispatchEvent(new Event('dukan_storage_update'));
      return true;
    } catch (e) {
      console.warn("Update user profile phone err:", e);
      throw e;
    }
  },

  getUserProfile: async (uid: string): Promise<UserProfile | null> => {
    try {
      const snap = await getDoc(doc(db, 'users', uid));
      if (snap.exists()) {
        return snap.data() as UserProfile;
      }
      return null;
    } catch (e) {
      console.warn("getUserProfile error:", e);
      return null;
    }
  },

  deleteUserProfilePhone: async (): Promise<boolean> => {
    const user = auth.currentUser;
    if (!user) return false;
    try {
      // 1. Clear phone & phoneVerified from public users collection
      await setDoc(doc(db, 'users', user.uid), {
        phone: '',
        phoneVerified: false,
        updatedAt: new Date().toISOString()
      }, { merge: true });

      // 2. Clear phone in settings collection
      const settingsRef = doc(db, 'settings', user.uid);
      await updateDoc(settingsRef, {
        phone: '',
        phoneVerified: false,
        updatedAt: new Date().toISOString()
      }).catch(() => {});

      // 3. Clear phone in localStorage
      const localSettings = getLocal<ShopSettings | null>(LOCAL_KEYS.SETTINGS, null);
      if (localSettings) {
        setLocal(LOCAL_KEYS.SETTINGS, {
          ...localSettings,
          phone: '',
          phoneVerified: false
        });
      }
      window.dispatchEvent(new Event('dukan_storage_update'));
      return true;
    } catch (e) {
      console.warn("Delete user profile phone error:", e);
      throw e;
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
    const currentUid = auth.currentUser?.uid;
    const rawResults: UserProfile[] = [];

    try {
      const usersRef = collection(db, 'users');
      // Search with prefix
      const q = query(usersRef, where('phone', '>=', clean), where('phone', '<=', clean + '\uf8ff'), limit(25));
      const snap = await getDocs(q);
      snap.forEach(docSnap => {
        const u = docSnap.data() as UserProfile;
        if (u.uid !== currentUid && !rawResults.some(r => r.uid === u.uid)) {
          rawResults.push(u);
        }
      });

      // If user typed e.g. "0321..." but database stored without leading 0 (e.g. "321...")
      if (clean.startsWith('0')) {
        const withoutZero = clean.substring(1);
        const q2 = query(usersRef, where('phone', '>=', withoutZero), where('phone', '<=', withoutZero + '\uf8ff'), limit(25));
        const snap2 = await getDocs(q2);
        snap2.forEach(docSnap => {
          const u = docSnap.data() as UserProfile;
          if (u.uid !== currentUid && !rawResults.some(r => r.uid === u.uid)) {
            rawResults.push(u);
          }
        });
      }

      // If clean starts with "92" (Pakistan country code) and database has "03..."
      if (clean.startsWith('92')) {
        const withZero = '0' + clean.substring(2);
        const q3 = query(usersRef, where('phone', '>=', withZero), where('phone', '<=', withZero + '\uf8ff'), limit(25));
        const snap3 = await getDocs(q3);
        snap3.forEach(docSnap => {
          const u = docSnap.data() as UserProfile;
          if (u.uid !== currentUid && !rawResults.some(r => r.uid === u.uid)) {
            rawResults.push(u);
          }
        });
      }

      // If clean doesn't start with 0 or 92 (e.g. "321..."), also check "0321..."
      if (!clean.startsWith('0') && !clean.startsWith('92')) {
        const withZero = '0' + clean;
        const q4 = query(usersRef, where('phone', '>=', withZero), where('phone', '<=', withZero + '\uf8ff'), limit(25));
        const snap4 = await getDocs(q4);
        snap4.forEach(docSnap => {
          const u = docSnap.data() as UserProfile;
          if (u.uid !== currentUid && !rawResults.some(r => r.uid === u.uid)) {
            rawResults.push(u);
          }
        });
      }

      // STRICT 1-TO-1 DEDUPLICATION BY PHONE NUMBER:
      // A single phone number must NEVER produce 2 chats or 2 users in search results!
      // If legacy duplicate accounts share the same phone number, only keep the single
      // most recently active account (by updatedAt).
      const phoneMap = new Map<string, UserProfile>();
      for (const u of rawResults) {
        if (!u.phone) continue;
        const norm = u.phone.replace(/[^0-9]/g, '');
        const canonical = norm.startsWith('92') ? norm.slice(2) : (norm.startsWith('0') ? norm.slice(1) : norm);

        const existing = phoneMap.get(canonical);
        if (!existing) {
          phoneMap.set(canonical, u);
        } else {
          const existingTime = new Date(existing.updatedAt || 0).getTime();
          const currentTime = new Date(u.updatedAt || 0).getTime();
          if (currentTime >= existingTime) {
            phoneMap.set(canonical, u);
          }
        }
      }

      return Array.from(phoneMap.values());
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
    callId?: string,
    callType: 'voice' | 'video' = 'voice'
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

      const isVideo = callType === 'video';
      const icon = isVideo ? '📹' : '📞';
      const label = isVideo ? 'video call' : 'voice call';

      let callText = isVideo ? 'Missed video call' : 'Missed voice call';
      let previewText = `${icon} ${isVideo ? 'Missed video call' : 'Missed voice call'}`;

      if (status === 'completed') {
        callText = `${isVideo ? 'Video call' : 'Voice call'} (${formattedDuration})`;
        previewText = `${icon} ${isVideo ? 'Video call' : 'Voice call'} (${formattedDuration})`;
      } else if (status === 'rejected') {
        callText = isVideo ? 'Video call declined' : 'Call declined';
        previewText = `${icon} ${isVideo ? 'Video call declined' : 'Call declined'}`;
      } else if (status === 'busy') {
        callText = 'Line busy';
        previewText = `${icon} Line busy`;
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
          callType,
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
        lastMessageCallType: callType,
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

