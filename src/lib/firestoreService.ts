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
  onSnapshot,
  FirestoreError
} from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from './firebase';
import { Product, Customer, Transaction, ShopSettings } from '../types';

// Mock storage keys
const LOCAL_KEYS = {
  PRODUCTS: 'dukan_products',
  CUSTOMERS: 'dukan_customers',
  TRANSACTIONS: 'dukan_transactions',
  SETTINGS: 'dukan_settings'
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
      const localProducts = getLocal<Product[]>(LOCAL_KEYS.PRODUCTS, []);
      const localCustomers = getLocal<Customer[]>(LOCAL_KEYS.CUSTOMERS, []);
      const localTransactions = getLocal<Transaction[]>(LOCAL_KEYS.TRANSACTIONS, []);
      const localSettings = getLocal<ShopSettings | null>(LOCAL_KEYS.SETTINGS, null);

      // Upload local to cloud
      for (const p of localProducts) {
        await setDoc(doc(db, 'products', p.id), { ...p, ownerId: userId });
      }
      for (const c of localCustomers) {
        await setDoc(doc(db, 'customers', c.id), { ...c, ownerId: userId });
      }
      for (const tx of localTransactions) {
        await setDoc(doc(db, 'transactions', tx.id), { ...tx, ownerId: userId });
      }
      if (localSettings) {
        await setDoc(doc(db, 'settings', userId), { ...localSettings, ownerId: userId });
      }

      // Download cloud to local (Sync back)
      const cloudP = await getDocs(query(collection(db, 'products'), where('ownerId', '==', userId)));
      const cloudC = await getDocs(query(collection(db, 'customers'), where('ownerId', '==', userId)));
      const cloudT = await getDocs(query(collection(db, 'transactions'), where('ownerId', '==', userId), orderBy('createdAt', 'desc')));
      const cloudS = await getDoc(doc(db, 'settings', userId));

      if (cloudP.docs.length > 0) setLocal(LOCAL_KEYS.PRODUCTS, cloudP.docs.map(d => d.data()));
      if (cloudC.docs.length > 0) setLocal(LOCAL_KEYS.CUSTOMERS, cloudC.docs.map(d => d.data()));
      if (cloudT.docs.length > 0) setLocal(LOCAL_KEYS.TRANSACTIONS, cloudT.docs.map(d => d.data()));
      if (cloudS.exists()) setLocal(LOCAL_KEYS.SETTINGS, cloudS.data());

      window.dispatchEvent(new Event('dukan_storage_update'));
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
    const userId = auth.currentUser?.uid;
    if (!userId) {
      const products = getLocal<Product[]>(LOCAL_KEYS.PRODUCTS, []);
      const index = products.findIndex(p => p.id === product.id);
      if (index > -1) products[index] = product;
      else products.push(product);
      setLocal(LOCAL_KEYS.PRODUCTS, products);
      return;
    }
    try {
      await setDoc(doc(db, 'products', product.id), { ...product, ownerId: userId });
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `products/${product.id}`);
    }
  },

  deleteProduct: async (id: string) => {
    const userId = auth.currentUser?.uid;
    if (!userId) {
      const products = getLocal<Product[]>(LOCAL_KEYS.PRODUCTS, []);
      setLocal(LOCAL_KEYS.PRODUCTS, products.filter(p => p.id !== id));
      return;
    }
    try {
      await deleteDoc(doc(db, 'products', id));
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `products/${id}`);
    }
  },

  updateProduct: async (id: string, updates: Partial<Product>) => {
    const userId = auth.currentUser?.uid;
    if (!userId) {
      const products = getLocal<Product[]>(LOCAL_KEYS.PRODUCTS, []);
      const index = products.findIndex(p => p.id === id);
      if (index > -1) {
        products[index] = { ...products[index], ...updates };
        setLocal(LOCAL_KEYS.PRODUCTS, products);
      }
      return;
    }
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
    const userId = auth.currentUser?.uid;
    if (!userId) {
      const customers = getLocal<Customer[]>(LOCAL_KEYS.CUSTOMERS, []);
      const index = customers.findIndex(c => c.id === customer.id);
      if (index > -1) customers[index] = customer;
      else customers.push(customer);
      setLocal(LOCAL_KEYS.CUSTOMERS, customers);
      return;
    }
    try {
      await setDoc(doc(db, 'customers', customer.id), { ...customer, ownerId: userId });
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `customers/${customer.id}`);
    }
  },

  deleteCustomer: async (id: string) => {
    const userId = auth.currentUser?.uid;
    if (!userId) {
      const customers = getLocal<Customer[]>(LOCAL_KEYS.CUSTOMERS, []);
      setLocal(LOCAL_KEYS.CUSTOMERS, customers.filter(c => c.id !== id));
      return;
    }
    try {
      await deleteDoc(doc(db, 'customers', id));
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `customers/${id}`);
    }
  },

  updateCustomer: async (id: string, updates: Partial<Customer>) => {
    const userId = auth.currentUser?.uid;
    if (!userId) {
      const customers = getLocal<Customer[]>(LOCAL_KEYS.CUSTOMERS, []);
      const index = customers.findIndex(c => c.id === id);
      if (index > -1) {
        customers[index] = { ...customers[index], ...updates };
        setLocal(LOCAL_KEYS.CUSTOMERS, customers);
      }
      return;
    }
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
    const userId = auth.currentUser?.uid;
    if (!userId) {
      const transactions = getLocal<Transaction[]>(LOCAL_KEYS.TRANSACTIONS, []);
      transactions.unshift(tx);
      setLocal(LOCAL_KEYS.TRANSACTIONS, transactions);
      return;
    }
    try {
      await setDoc(doc(db, 'transactions', tx.id), { ...tx, ownerId: userId });
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `transactions/${tx.id}`);
    }
  },

  deleteTransaction: async (id: string) => {
    const userId = auth.currentUser?.uid;
    if (!userId) {
      const transactions = getLocal<Transaction[]>(LOCAL_KEYS.TRANSACTIONS, []);
      setLocal(LOCAL_KEYS.TRANSACTIONS, transactions.filter(t => t.id !== id));
      return;
    }
    try {
      await deleteDoc(doc(db, 'transactions', id));
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `transactions/${id}`);
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
      const handler = () => FirestoreService.getProducts().then(callback);
      window.addEventListener('dukan_storage_update', handler);
      handler();
      return () => window.removeEventListener('dukan_storage_update', handler);
    }
    return onSnapshot(
      query(collection(db, 'products'), where('ownerId', '==', userId), orderBy('name')),
      (snapshot) => callback(snapshot.docs.map(doc => doc.data() as Product)),
      (e) => handleFirestoreError(e, OperationType.LIST, 'products')
    );
  },

  subscribeToCustomers: (callback: (customers: Customer[]) => void) => {
    const userId = auth.currentUser?.uid;
    if (!userId) {
      const handler = () => FirestoreService.getCustomers().then(callback);
      window.addEventListener('dukan_storage_update', handler);
      handler();
      return () => window.removeEventListener('dukan_storage_update', handler);
    }
    return onSnapshot(
      query(collection(db, 'customers'), where('ownerId', '==', userId), orderBy('name')),
      (snapshot) => callback(snapshot.docs.map(doc => doc.data() as Customer)),
      (e) => handleFirestoreError(e, OperationType.LIST, 'customers')
    );
  },

  subscribeToTransactions: (callback: (txs: Transaction[]) => void) => {
    const userId = auth.currentUser?.uid;
    if (!userId) {
      const handler = () => FirestoreService.getTransactions().then(callback);
      window.addEventListener('dukan_storage_update', handler);
      handler();
      return () => window.removeEventListener('dukan_storage_update', handler);
    }
    return onSnapshot(
      query(collection(db, 'transactions'), where('ownerId', '==', userId), orderBy('createdAt', 'desc')),
      (snapshot) => callback(snapshot.docs.map(doc => doc.data() as Transaction)),
      (e) => handleFirestoreError(e, OperationType.LIST, 'transactions')
    );
  },

  subscribeToSettings: (callback: (settings: ShopSettings) => void) => {
    const userId = auth.currentUser?.uid;
    if (!userId) {
      const handler = () => FirestoreService.getSettings().then(s => s && callback(s));
      window.addEventListener('dukan_storage_update', handler);
      handler();
      return () => window.removeEventListener('dukan_storage_update', handler);
    }
    return onSnapshot(
      doc(db, 'settings', userId),
      (snapshot) => snapshot.exists() && callback(snapshot.data() as ShopSettings),
      (e) => handleFirestoreError(e, OperationType.GET, `settings/${userId}`)
    );
  }
};

