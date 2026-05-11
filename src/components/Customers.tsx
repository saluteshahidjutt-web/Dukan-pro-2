import React, { useState } from 'react';
import { 
  Search, 
  Plus, 
  Phone, 
  MessageCircle, 
  ArrowRightLeft, 
  UserPlus, 
  Share2, 
  Users, 
  Contact, 
  ArrowLeft, 
  FileText, 
  MoreVertical,
  Check,
  ChevronRight,
  TrendingDown,
  TrendingUp,
  Clock,
  Settings as SettingsIcon,
  Trash2,
  Calendar,
  Image as ImageIcon,
  Camera,
  Upload
} from 'lucide-react';
import { ConfirmModal } from './ConfirmModal';
import { Customer, Transaction, ShopSettings } from '../types';
import { formatCurrency, generateId, cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { FirestoreService } from '../lib/firestoreService';

import { translations, Language } from '../lib/translations';

interface CustomersProps {
  customers: Customer[];
  setCustomers: React.Dispatch<React.SetStateAction<Customer[]>>;
  transactions: Transaction[];
  setTransactions: React.Dispatch<React.SetStateAction<Transaction[]>>;
  settings: ShopSettings;
}

export function Customers({ customers, setCustomers, transactions, setTransactions, settings }: CustomersProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddingCustomer, setIsAddingCustomer] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [newCustomer, setNewCustomer] = useState({ name: '', phone: '', balance: '0' });
  const [activeEntryType, setActiveEntryType] = useState<'received' | 'given' | null>(null);
  const [entryAmount, setEntryAmount] = useState('');
  const [entryDescription, setEntryDescription] = useState('');
  const [entryDueDate, setEntryDueDate] = useState('');
  const [entryProof, setEntryProof] = useState<string | null>(null);
  const [viewingProof, setViewingProof] = useState<string | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState<{ type: 'transaction' | 'customer', id: string, extra?: any } | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const t = translations[settings.language as Language || 'en'];

  const selectedCustomer = customers.find(c => c.id === selectedCustomerId);
  const customerTransactions = transactions
    .filter(t => t.customerId === selectedCustomerId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const filteredCustomers = customers.filter(c => 
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    c.phone.includes(searchQuery)
  );

  const confirmDelete = async () => {
    if (!deleteConfirmation) return;

    setIsProcessing(true);
    try {
      if (deleteConfirmation.type === 'transaction') {
        const transaction = deleteConfirmation.extra as Transaction;
        if (!selectedCustomer) return;
        
        let revertAmount = 0;
        if (transaction.type === 'payment_received' || transaction.type === 'payment') {
          revertAmount = transaction.amount;
        } else if (transaction.type === 'credit_given' || transaction.type === 'sale' || transaction.type === 'credit') {
          revertAmount = -transaction.amount;
        }
        
        await FirestoreService.deleteTransaction(transaction.id);
        await FirestoreService.updateCustomer(selectedCustomer.id, {
          balance: selectedCustomer.balance + revertAmount,
          lastTransactionAt: new Date().toISOString()
        });
      } else if (deleteConfirmation.type === 'customer') {
        await FirestoreService.deleteCustomer(deleteConfirmation.id);
        setSelectedCustomerId(null);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setIsProcessing(false);
      setDeleteConfirmation(null);
    }
  };

  const handleDeleteTransaction = (transaction: Transaction) => {
    setDeleteConfirmation({ type: 'transaction', id: transaction.id, extra: transaction });
  };

  const handleDeleteCustomer = (id: string) => {
    setDeleteConfirmation({ type: 'customer', id });
  };

  const handleAddCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustomer.name || !newCustomer.phone) return;
    
    setIsProcessing(true);
    try {
      const customerId = generateId();
      const balanceNum = parseFloat(newCustomer.balance) || 0;
      
      const customer: Customer = {
        id: customerId,
        name: newCustomer.name,
        phone: newCustomer.phone,
        balance: balanceNum,
        lastTransactionAt: new Date().toISOString()
      };

      await FirestoreService.saveCustomer(customer);
      
      if (balanceNum !== 0) {
        const transaction: Transaction = {
          id: generateId(),
          type: balanceNum > 0 ? 'credit_given' : 'payment_received',
          amount: Math.abs(balanceNum),
          description: `Opening Balance / Shuruati Bakaya`,
          customerId: customerId,
          createdAt: new Date().toISOString()
        };
        await FirestoreService.saveTransaction(transaction);
      }

      setNewCustomer({ name: '', phone: '', balance: '0' });
      setIsAddingCustomer(false);
    } catch (error) {
      console.error(error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCreateEntry = async () => {
    if (!selectedCustomer || !entryAmount || isProcessing) return;
    
    const amount = parseFloat(entryAmount);
    if (isNaN(amount) || amount <= 0) return;

    setIsProcessing(true);
    try {
      const type = activeEntryType === 'received' ? 'payment_received' : 'credit_given';
      const balanceChange = activeEntryType === 'received' ? -amount : amount;
      
      const transaction: any = {
        id: generateId(),
        type: type,
        amount: amount,
        description: entryDescription || (activeEntryType === 'received' ? 'Maine liye' : 'Maine diye'),
        createdAt: new Date().toISOString()
      };

      if (selectedCustomer.id) {
        transaction.customerId = selectedCustomer.id;
      }

      if (entryDueDate) transaction.dueDate = entryDueDate;
      if (entryProof) transaction.proofImage = entryProof;

      await FirestoreService.saveTransaction(transaction as Transaction);
      await FirestoreService.updateCustomer(selectedCustomer.id, {
        balance: selectedCustomer.balance + balanceChange,
        lastTransactionAt: new Date().toISOString()
      });

      setEntryAmount('');
      setEntryDescription('');
      setEntryDueDate('');
      setEntryProof(null);
      setActiveEntryType(null);
    } catch (error) {
      console.error(error);
    } finally {
      setIsProcessing(false);
    }
  };

  const deleteCustomer = async (id: string) => {
    handleDeleteCustomer(id);
  };

  const importFromContacts = async () => {
    try {
      // Check if in iframe - Contacts API is restricted to top-level browsing contexts
      const isInIframe = window.self !== window.top;

      // @ts-ignore
      const supported = 'contacts' in navigator && 'select' in navigator.contacts;
      
      if (isInIframe) {
        alert('Contact Picker cannot be used inside a frame. Please open the app in a new tab (standalone) to use this feature.');
        return;
      }

      if (!supported) {
        alert('Contact Picker is not supported on this device/browser.');
        return;
      }
      
      const opts = { multiple: false };
      // @ts-ignore
      const contacts = await navigator.contacts.select(['name', 'tel'], opts);
      
      if (contacts && contacts.length > 0) {
        const contact = contacts[0];
        const name = contact.name?.[0] || '';
        const rawPhone = contact.tel?.[0] || '';
        let clean = rawPhone.replace(/\D/g, '');
        if (clean.startsWith('92') && clean.length > 10) clean = clean.substring(2);
        clean = clean.replace(/^0+/, '');
        if (clean.length > 10) clean = clean.slice(-10);

        setNewCustomer(prev => ({
          ...prev,
          name: name || prev.name,
          phone: clean || prev.phone
        }));
      }
    } catch (err: any) {
      console.error(err);
    }
  };

  const sendWhatsAppReminder = (customer: Customer) => {
    const amount = Math.abs(customer.balance);
    const action = customer.balance > 0 ? `ko Rs. ${amount} dene hain` : `se Rs. ${amount} lene hain`;
    const text = `Assalam o Alaikum ${customer.name},\n\nAapne ${settings.name} ${action}. Barae meherbani isay settle kar lain. Shukriya!\n\nDukaan: ${settings.name}\nPhone: ${settings.phone}`;
    const url = `https://wa.me/92${customer.phone}?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 500000) {
      alert("Image is too large. Please select a smaller one (less than 500KB).");
      return;
    }

    const reader = new window.FileReader();
    reader.onloadend = () => {
      setEntryProof(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const renderEntryScreen = () => {
    if (!activeEntryType || !selectedCustomer) return null;

    return (
      <motion.div 
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        className="fixed inset-0 bg-white z-[80] flex flex-col"
      >
        <div className="p-4 flex items-center border-b border-slate-100">
          <button onClick={() => setActiveEntryType(null)} className="p-2 -ml-2 text-slate-500">
            <ArrowLeft size={24} />
          </button>
          <div className="ml-2">
            <h3 className="font-bold text-slate-900">
              {activeEntryType === 'received' ? 'Maine liye' : 'Maine diye'} - {selectedCustomer.name}
            </h3>
          </div>
        </div>

        <div className="flex-1 p-6 space-y-6">
          <div className="flex items-center gap-2 border-b-2 border-slate-100 focus-within:border-emerald-500 py-4 transition-colors">
            <span className={cn(
              "text-3xl font-black",
              activeEntryType === 'received' ? "text-emerald-600" : "text-rose-600"
            )}>Rs.</span>
            <input 
              type="number" 
              autoFocus
              placeholder="0"
              value={entryAmount}
              onChange={(e) => setEntryAmount(e.target.value)}
              className="text-4xl font-black w-full outline-none bg-transparent"
            />
            <div className="text-right">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                {new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>

          <div className="relative">
            <input 
              type="text" 
              placeholder="Enter remark (e.g. Rice, Sugar, Cash, etc.)"
              value={entryDescription}
              onChange={(e) => setEntryDescription(e.target.value)}
              className="w-full bg-slate-50 p-4 rounded-2xl text-sm font-medium border border-transparent focus:border-slate-200 outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
               <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Due Date (Optional)</label>
               <input 
                 type="date"
                 value={entryDueDate}
                 onChange={(e) => setEntryDueDate(e.target.value)}
                 className="w-full bg-slate-50 p-4 rounded-2xl text-sm font-medium border border-transparent focus:border-slate-200 outline-none"
               />
            </div>
            <div className="space-y-2">
               <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Proof (Screenshot)</label>
               <label className="w-full h-[54px] bg-slate-50 rounded-2xl flex items-center justify-center border-2 border-dashed border-slate-200 cursor-pointer hover:bg-slate-100 transition-colors">
                 <input 
                   type="file" 
                   accept="image/*"
                   className="hidden" 
                   onChange={handleFileChange}
                 />
                 {entryProof ? (
                    <div className="flex flex-col items-center gap-2">
                      <div className="relative group">
                        <img 
                          src={entryProof} 
                          alt="Preview" 
                          className="h-10 w-10 object-cover rounded-lg border border-emerald-200"
                        />
                        <button 
                          onClick={(e) => { e.stopPropagation(); setEntryProof(null); }}
                          className="absolute -top-2 -right-2 bg-rose-500 text-white rounded-full p-0.5 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <Plus size={10} className="rotate-45" />
                        </button>
                      </div>
                      <span className="text-emerald-600 font-bold text-[8px] uppercase">Attached</span>
                    </div>
                 ) : (
                    <div className="flex items-center gap-2 text-slate-400 font-bold text-xs uppercase tracking-widest">
                      <Upload size={18} />
                      Upload
                    </div>
                 )}
               </label>
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-slate-100 pb-[calc(1.5rem+72px)]">
          <button 
            disabled={!entryAmount || isProcessing}
            onClick={handleCreateEntry}
            className={cn(
               "w-full py-4 rounded-2xl text-white font-black text-lg shadow-xl active:scale-95 transition-all flex items-center justify-center gap-2",
               activeEntryType === 'received' ? "bg-emerald-600 shadow-emerald-200" : "bg-rose-600 shadow-rose-200",
               (!entryAmount || isProcessing) && "opacity-50"
            )}
          >
            {isProcessing ? 'Processing...' : 'DONE'}
            <Check size={24} />
          </button>
        </div>
      </motion.div>
    );
  };

  const renderDetailView = () => {
    if (!selectedCustomer) return null;

    return (
      <motion.div 
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        className="fixed inset-0 bg-slate-50 z-[70] flex flex-col"
      >
        <div className="bg-white p-4 flex items-center justify-between border-b border-slate-100">
          <div className="flex items-center gap-3">
            <button onClick={() => setSelectedCustomerId(null)} className="p-1 -ml-1 text-slate-500">
              <ArrowLeft size={24} />
            </button>
            <div className="h-10 w-10 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center font-black">
              {selectedCustomer.name.charAt(0)}
            </div>
            <div>
              <h2 className="font-black text-slate-900 flex items-center gap-2">
                {selectedCustomer.name}
              </h2>
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">{selectedCustomer.phone}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button className="p-2 bg-slate-100 rounded-xl text-slate-600">
               <FileText size={20} />
            </button>
            <button onClick={() => deleteCustomer(selectedCustomer.id)} className="p-2 bg-rose-50 rounded-xl text-rose-500">
               <Trash2 size={20} />
            </button>
          </div>
        </div>

        <div className="p-4">
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 flex items-center justify-between">
            <div>
              <h3 className={cn(
                "text-3xl font-black",
                selectedCustomer.balance > 0 ? "text-rose-600" : selectedCustomer.balance < 0 ? "text-emerald-600" : "text-slate-300"
              )}>
                {settings.currency} {Math.abs(selectedCustomer.balance)}
              </h3>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">
                {selectedCustomer.balance > 0 ? 'Maine lene hain' : selectedCustomer.balance < 0 ? 'Maine dene hain' : 'Settle'}
              </p>
            </div>
            {selectedCustomer.balance !== 0 && (
              <button 
                onClick={() => sendWhatsAppReminder(selectedCustomer)}
                className="bg-orange-500 text-white px-6 py-3 rounded-2xl font-black text-sm shadow-lg shadow-orange-200 active:scale-95 transition-transform"
              >
                REMIND
              </button>
            )}
          </div>
        </div>

        <div className="px-6 py-2 flex justify-between text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-50 sticky top-0">
          <div className="w-1/3">Date</div>
          <div className="w-1/3 text-center">Maine liye</div>
          <div className="w-1/3 text-right">Maine diye</div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-48">
          {customerTransactions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400">
               <Calendar size={48} strokeWidth={1.5} className="mb-4 opacity-20" />
               <p className="font-bold text-sm">Koi record nahi hai</p>
            </div>
          ) : (
            customerTransactions.map((t) => (
              <div key={t.id} className="border-b border-slate-100 bg-white first:rounded-t-2xl last:rounded-b-2xl last:border-0 overflow-hidden">
                <div className="p-4 flex items-center justify-between">
                  <div className="w-1/3">
                    <p className="text-xs font-bold text-slate-900">
                      {new Date(t.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                    </p>
                    <p className="text-[10px] text-slate-400 font-medium">{new Date(t.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {t.description && <p className="text-[10px] text-emerald-600 bg-emerald-50 inline-block px-1 rounded">{t.description}</p>}
                      {t.dueDate && (
                        <p className={cn(
                          "text-[10px] px-1 rounded font-bold flex items-center gap-0.5",
                          new Date(t.dueDate) < new Date() ? "bg-rose-50 text-rose-500" : "bg-blue-50 text-blue-500"
                        )}>
                          <Clock size={8} /> Due: {new Date(t.dueDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                        </p>
                      )}
                      {t.proofImage && (
                        <button 
                          onClick={() => setViewingProof(t.proofImage!)}
                          className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-lg flex items-center gap-1 hover:bg-emerald-200 transition-colors font-bold shadow-sm"
                        >
                          <ImageIcon size={10} /> Proof
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="w-1/3 text-center flex flex-col items-center justify-center">
                    {t.type === 'payment_received' ? (
                      <span className="text-emerald-600 font-black text-sm">Rs. {t.amount}</span>
                    ) : <div className="w-4 h-0.5 bg-slate-50 opacity-0" />}
                  </div>
                  <div className="w-1/3 flex items-center justify-end gap-3">
                    {t.type === 'credit_given' ? (
                      <span className="text-rose-600 font-black text-sm">Rs. {t.amount}</span>
                    ) : <div className="w-4 h-0.5 bg-slate-50 opacity-0" />}
                    
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteTransaction(t);
                      }}
                      className="p-1.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all"
                      title="Delete Entry"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="fixed bottom-[72px] left-0 right-0 p-4 bg-white/80 backdrop-blur-md grid grid-cols-2 gap-4 border-t border-slate-100 z-[70] shadow-[0_-10px_20px_-5px_rgba(0,0,0,0.05)]">
          <button 
            onClick={() => setActiveEntryType('received')}
            className="bg-white border-2 border-emerald-500 text-emerald-600 flex items-center justify-center gap-2 py-4 rounded-2xl font-black text-sm active:scale-95 transition-all shadow-xl shadow-emerald-50"
          >
            <TrendingDown size={20} />
            MAINE LIYE
          </button>
          <button 
            onClick={() => setActiveEntryType('given')}
            className="bg-white border-2 border-rose-500 text-rose-600 flex items-center justify-center gap-2 py-4 rounded-2xl font-black text-sm active:scale-95 transition-all shadow-xl shadow-rose-50"
          >
            MAINE DIYE
            <TrendingUp size={20} />
          </button>
        </div>

        <AnimatePresence>
          {activeEntryType && renderEntryScreen()}
          {viewingProof && (
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              onClick={() => setViewingProof(null)}
              className="fixed inset-0 bg-slate-900/90 backdrop-blur-lg z-[100] flex items-center justify-center p-4"
            >
              <div className="relative max-w-full max-h-full flex flex-col items-center">
                <button 
                  onClick={() => setViewingProof(null)}
                  className="absolute -top-12 right-0 p-2 text-white bg-white/10 rounded-full hover:bg-white/20 transition-colors"
                >
                  <Plus className="rotate-45" size={24} />
                </button>
                <img 
                  src={viewingProof} 
                  alt="Proof" 
                  className="max-w-full max-h-[80vh] rounded-2xl shadow-2xl object-contain border-4 border-white/10"
                  onClick={(e) => e.stopPropagation()}
                />
                <div className="mt-6 flex gap-4">
                  <a 
                    href={viewingProof} 
                    download="payment-proof.png"
                    onClick={(e) => e.stopPropagation()}
                    className="bg-emerald-600 text-white px-8 py-3 rounded-2xl font-black shadow-lg shadow-emerald-900/40 flex items-center gap-2"
                  >
                    <ImageIcon size={20} /> DOWNLOAD
                  </a>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    );
  };

  return (
    <div className="h-full flex flex-col bg-slate-50 dark:bg-slate-950 transition-colors">
      <div className="p-4 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input 
            type="text" 
            placeholder={t.search_customer} 
            className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl py-3 pl-10 pr-4 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 dark:text-white"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <button 
          onClick={() => setIsAddingCustomer(true)}
          className="bg-emerald-600 text-white px-4 py-3 rounded-xl shadow-lg shadow-emerald-100 dark:shadow-none flex items-center gap-2 font-bold active:scale-95 transition-all overflow-hidden"
        >
          <UserPlus size={20} />
          <span className="hidden sm:inline">{t.grahak_new}</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {filteredCustomers.length === 0 ? (
          <div className="py-20 text-center flex flex-col items-center">
            <div className="bg-white dark:bg-slate-800 p-6 rounded-full shadow-sm mb-4">
              <Users size={48} className="text-slate-200 dark:text-slate-700" />
            </div>
            <h3 className="text-slate-900 dark:text-white font-black">{t.no_customers}</h3>
            <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-2">{t.add_now}</p>
          </div>
        ) : (
          filteredCustomers.map(customer => (
            <motion.div 
              layout
              key={customer.id}
              className="bg-white dark:bg-slate-900 rounded-2xl p-4 flex items-center justify-between border border-slate-100 dark:border-slate-800 hover:shadow-md transition-shadow cursor-pointer active:scale-[0.98]"
            >
              <div className="flex items-center gap-4 flex-1" onClick={() => setSelectedCustomerId(customer.id)}>
                <div className="h-12 w-12 bg-slate-50 dark:bg-slate-800 text-slate-400 dark:text-slate-500 border border-slate-100 dark:border-slate-700 rounded-full flex items-center justify-center font-black text-lg">
                  {customer.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h4 className="font-black text-slate-900 dark:text-white">{customer.name}</h4>
                  <div className="flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-tight">
                    <Clock size={10} />
                    {customer.lastTransactionAt ? new Date(customer.lastTransactionAt).toLocaleDateString() : 'No entries'}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right" onClick={() => setSelectedCustomerId(customer.id)}>
                  <p className={cn(
                    "font-black text-lg",
                    customer.balance > 0 ? "text-rose-600" : customer.balance < 0 ? "text-emerald-600" : "text-slate-300 dark:text-slate-700"
                  )}>
                    {settings.currency} {Math.abs(customer.balance)}
                  </p>
                  <div className="flex items-center justify-end gap-1 text-[8px] font-black uppercase tracking-widest">
                    {customer.balance > 0 ? (
                        <span className="text-rose-400">Maine lene hain</span>
                    ) : customer.balance < 0 ? (
                        <span className="text-emerald-400">Maine dene hain</span>
                    ) : (
                        <span className="text-slate-300 dark:text-slate-700">Settle</span>
                    )}
                  </div>
                </div>
                {customer.balance !== 0 && (
                  <button 
                    onClick={(e) => { e.stopPropagation(); sendWhatsAppReminder(customer); }}
                    className="p-3 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 rounded-xl active:scale-90 transition-transform"
                    title="Send WhatsApp Reminder"
                  >
                    <MessageCircle size={20} />
                  </button>
                )}
                <ChevronRight size={16} className="text-slate-300 dark:text-slate-700" onClick={() => setSelectedCustomerId(customer.id)} />
              </div>
            </motion.div>
          ))
        )}
      </div>

      <AnimatePresence>
        {isAddingCustomer && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[90] flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
              className="bg-white dark:bg-slate-900 w-full max-w-md rounded-[32px] p-8 shadow-2xl"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-2xl font-black text-slate-900 dark:text-white">New Customer</h3>
                <button onClick={() => setIsAddingCustomer(false)} className="p-2 bg-slate-50 dark:bg-slate-800 text-slate-400 rounded-full">
                   <Plus className="rotate-45" />
                </button>
              </div>
              
              <form onSubmit={handleAddCustomer} className="space-y-4">
                <button 
                  type="button"
                  onClick={importFromContacts}
                  className="w-full flex items-center justify-between bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 p-4 rounded-2xl border border-blue-100 dark:border-blue-900/30 font-black active:scale-95 transition-all"
                >
                  <div className="flex items-center gap-3">
                    <Contact size={24} />
                    <span className="text-sm">Import from Contacts</span>
                  </div>
                  <ChevronRight size={20} />
                </button>

                <div className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2 mb-2">Full Name</label>
                    <input 
                      autoFocus required type="text"
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl py-4 px-6 text-sm font-bold dark:text-white focus:bg-white dark:focus:bg-slate-800 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all outline-none"
                      placeholder="e.g. Tanveer"
                      value={newCustomer.name}
                      onChange={(e) => setNewCustomer({...newCustomer, name: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2 mb-2">Phone Number</label>
                    <div className="relative">
                      <Phone className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                      <input 
                        required type="tel"
                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl py-4 pl-14 pr-6 text-sm font-bold dark:text-white focus:bg-white dark:focus:bg-slate-800 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all outline-none"
                        placeholder="300 1234567"
                        value={newCustomer.phone}
                        onChange={(e) => setNewCustomer({...newCustomer, phone: e.target.value})}
                      />
                    </div>
                  </div>
                </div>

                <button 
                  type="submit"
                  disabled={isProcessing}
                  className="w-full bg-emerald-600 text-white font-black py-5 rounded-2xl shadow-xl shadow-emerald-200 dark:shadow-none active:scale-95 transition-all mt-4"
                >
                  {isProcessing ? 'Saving...' : 'ADD CUSTOMER'}
                </button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedCustomerId && renderDetailView()}
      </AnimatePresence>

      <ConfirmModal 
        isOpen={!!deleteConfirmation}
        isLoading={isProcessing}
        title={deleteConfirmation?.type === 'customer' ? 'Delete Customer?' : 'Delete Entry?'}
        message={deleteConfirmation?.type === 'customer' 
          ? 'Are you sure you want to eliminate this customer? all their data / records will be lost forever.'
          : 'Are you sure you want to delete this transaction record?'}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteConfirmation(null)}
      />
    </div>
  );
}
