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
  FirestoreError
} from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from './firebase';
import { Product, Customer, Transaction, ShopSettings, Expense } from '../types';
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

  deleteAllTransactions: async () => {
    // 1. Clear local transactions
    setLocal(LOCAL_KEYS.TRANSACTIONS, []);

    const userId = auth.currentUser?.uid;
    if (!userId) return;

    // 2. Delete transactions from Firestore for user
    try {
      const q = query(
        collection(db, 'transactions'), 
        where('ownerId', '==', userId)
      );
      const snapshot = await getDocs(q);
      
      // Delete documents
      for (const docSnapshot of snapshot.docs) {
        await deleteDoc(docSnapshot.ref);
      }
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `transactions/all`);
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
  }
};

