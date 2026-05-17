import React, { useState, useEffect } from 'react';
import { Search, Trash2, Minus, Plus, Users, CreditCard, ShoppingCart, CheckCircle2, MessageCircle, ChevronRight, Wallet, Printer, Send, Download, Share2, ReceiptText, RefreshCcw, Phone, MapPin } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import * as htmlToImage from 'html-to-image';
import { Product, Customer, Transaction, ShopSettings } from '../types';
import { formatCurrency, generateId, cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { FirestoreService } from '../lib/firestoreService';

import { translations, Language } from '../lib/translations';

interface POSProps {
  products: Product[];
  setProducts: React.Dispatch<React.SetStateAction<Product[]>>;
  customers: Customer[];
  setCustomers: React.Dispatch<React.SetStateAction<Customer[]>>;
  setTransactions: React.Dispatch<React.SetStateAction<Transaction[]>>;
  settings: ShopSettings;
  onComplete: () => void;
}

interface CartItem extends Product {
  quantity: number;
}

export function POS({ products, setProducts, customers, setCustomers, setTransactions, settings, onComplete }: POSProps) {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [isAddingNewCustomer, setIsAddingNewCustomer] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ name: '', phone: '' });
  const [tempCustomer, setTempCustomer] = useState<{name: string, phone: string} | null>(null);
  const [paymentType, setPaymentType] = useState<'cash' | 'udhar' | 'jazzcash' | 'easypaisa'>('cash');
  const [isReceiptOpen, setIsReceiptOpen] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const receiptRef = React.useRef<HTMLDivElement>(null);
  const [currentTransaction, setCurrentTransaction] = useState<Transaction | null>(null);

  const t = translations[settings.language as Language || 'en'];

  const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const total = subtotal;

  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    p.barcode.includes(searchQuery)
  );

  const addToCart = (product: Product) => {
    setCart(prev => {
      const existing = prev.find(item => item.id === product.id);
      if (existing) {
        return prev.map(item => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item);
      }
      return [...prev, { ...product, quantity: 1 }];
    });
  };

  const updateQuantity = (id: string, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.id === id) {
        const nextQty = item.quantity + delta;
        return nextQty > 0 ? { ...item, quantity: nextQty } : item;
      }
      return item;
    }));
  };

  const removeFromCart = (id: string) => {
    setCart(prev => prev.filter(item => item.id !== id));
  };

  const handleCheckout = async () => {
    if (cart.length === 0) return;
    
    if (paymentType === 'udhar' && !selectedCustomer) {
      setIsCustomerModalOpen(true);
      return;
    }

    try {
      const transactionId = generateId();
      const transaction: Transaction = {
        id: transactionId,
        type: 'sale',
        amount: total,
        description: `${cart.map(item => item.name).join(', ')} (${paymentType})`,
        items: cart.map(item => ({ productId: item.id, quantity: item.quantity, price: item.price })),
        createdAt: new Date().toISOString(),
        paymentMethod: paymentType
      };

      if (selectedCustomer) {
        transaction.customerId = selectedCustomer.id;
        transaction.customerName = selectedCustomer.name;
      } else if (tempCustomer) {
        transaction.customerName = tempCustomer.name;
        transaction.customerPhone = tempCustomer.phone;
      }

      // 1. Save Transaction
      await FirestoreService.saveTransaction(transaction);

      // 2. Update Product Stocks
      for (const item of cart) {
        const product = products.find(p => p.id === item.id);
        if (product) {
          await FirestoreService.updateProduct(item.id, {
            stock: product.stock - item.quantity
          });
        }
      }

      // 3. Update Customer Balance if Udhar
      if (paymentType === 'udhar' && selectedCustomer) {
        await FirestoreService.updateCustomer(selectedCustomer.id, {
          balance: (parseFloat(selectedCustomer.balance as any) || 0) + total,
          lastTransactionAt: new Date().toISOString()
        });
      }

      // Play Sound
      try {
        const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2013/2013-preview.mp3');
        audio.volume = 0.5;
        audio.play()?.catch(e => console.warn('Audio play failed', e));
      } catch (e) {
        console.warn('Audio internal failure', e);
      }

      setCurrentTransaction(transaction);
      setIsReceiptOpen(true);
    } catch (error) {
      console.error('Checkout error:', error);
      alert('Checkout fail ho gaya. Please check your internet or try again.');
    }
  };

  const captureReceipt = async () => {
    if (!receiptRef.current) return;
    setIsCapturing(true);
    try {
      // Ensure the font and styles are loaded
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const dataUrl = await htmlToImage.toPng(receiptRef.current, {
        backgroundColor: '#ffffff',
        quality: 1.0,
        pixelRatio: 2,
      });

      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `receipt-${currentTransaction?.id || 'bill'}.png`;
      link.click();
    } catch (error) {
      console.error('Error capturing receipt:', error);
    } finally {
      setIsCapturing(false);
    }
  };

  const shareReceiptImage = async () => {
    if (!receiptRef.current) return;
    setIsCapturing(true);
    try {
      // Ensure rendering is complete
      await new Promise(resolve => setTimeout(resolve, 100));

      const dataUrl = await htmlToImage.toPng(receiptRef.current, {
        backgroundColor: '#ffffff',
        quality: 1.0,
        pixelRatio: 2,
      });

      const blob = await (await fetch(dataUrl)).blob();
      const file = new window.File([blob], `receipt-${currentTransaction?.id?.slice(-8) || 'bill'}.png`, { type: 'image/png' });

      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `Receipt from ${settings.name}`,
        });
      } else {
        // Fallback to download if share is not supported
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = `receipt-${currentTransaction?.id?.slice(-8) || 'bill'}.png`;
        link.click();
      }
    } catch (error) {
      console.error('Error sharing receipt:', error);
      alert('Sharing fail ho gaya. Falling back to download.');
      // Final fallback if even the above fails
      captureReceipt();
    } finally {
      setIsCapturing(false);
    }
  };

  const importFromContacts = async () => {
    try {
      const isInIframe = window.self !== window.top;
      // @ts-ignore
      const supported = 'contacts' in navigator && 'select' in navigator.contacts;
      
      if (isInIframe) {
        if (confirm('Contact access is blocked inside the preview window. To use this feature, please click "OK" to open the app in a full screen tab where contacts are allowed.')) {
          window.open(window.location.href, '_blank');
        }
        return;
      }

      if (!supported) {
        alert('Contact Picker is not supported in this browser. Please use Chrome or Edge on Android.');
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
        if (clean.length > 10) clean = clean.slice(-10);
        
        setNewCustomer(prev => ({
          ...prev,
          name: name || prev.name,
          phone: clean || prev.phone
        }));
      }
    } catch (err) {
      console.error('Contact error:', err);
      if (err instanceof Error && err.name === 'SecurityError') {
        alert('Cannot access contacts inside the preview. Please open the app in a NEW TAB (top-right icon) to use contact selection.');
      } else {
        alert('Failed to select contact. Please try again.');
      }
    }
  };

  const handleQuickAddCustomer = async () => {
    if (!newCustomer.name) return;
    
    try {
      const id = generateId();
      const customer: Customer = {
        id,
        name: newCustomer.name,
        phone: newCustomer.phone,
        balance: 0,
        lastTransactionAt: new Date().toISOString()
      };

      await FirestoreService.saveCustomer(customer);
      setSelectedCustomer(customer);
      setIsAddingNewCustomer(false);
      setIsCustomerModalOpen(false);
      setNewCustomer({ name: '', phone: '' });
    } catch (error) {
      console.error('Failed to add customer:', error);
      alert('Grahak save karne mein masla hua. Please check entry and try again.');
    }
  };

  const filteredCustomers = customers.filter(c => 
    c.name.toLowerCase().includes(customerSearchQuery.toLowerCase()) || 
    c.phone.includes(customerSearchQuery)
  );

  return (
    <div className="flex flex-col h-[calc(100vh-160px)]">
      <div className="flex gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input 
            type="text" placeholder={t.search_product} 
            className="w-full bg-white border border-slate-200 rounded-xl py-3 pl-10 pr-4 text-sm shadow-sm"
            value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setIsCustomerModalOpen(true)}
            className={cn("px-4 py-3 rounded-xl border flex items-center gap-2 text-xs font-black uppercase transition-all tracking-widest", selectedCustomer ? "bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-100" : "bg-white text-slate-600 border-slate-200 shadow-sm")}
          >
            <Users size={16} /> {selectedCustomer?.name || t.grahak_select}
          </button>
          {selectedCustomer && (
            <button 
              onClick={() => setSelectedCustomer(null)}
              className="p-3 bg-red-50 text-red-600 rounded-xl border border-red-100 active:scale-95 transition-all"
            >
              <RefreshCcw size={16} />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 flex flex-col md:flex-row gap-4 overflow-hidden">
        <div className="flex-1 overflow-y-auto space-y-2 no-scrollbar">
          {filteredProducts.map(p => (
            <button key={p.id} onClick={() => addToCart(p)} className="w-full bg-white dark:bg-slate-800 p-2.5 rounded-xl border border-slate-100 dark:border-slate-700 flex justify-between items-center shadow-sm active:bg-slate-50 transition-colors">
              <div className="flex items-center gap-3">
                {p.image ? (
                  <img src={p.image} alt={p.name} className="h-10 w-10 object-cover rounded-lg" referrerPolicy="no-referrer" />
                ) : (
                   <div className="h-10 w-10 bg-slate-100 dark:bg-slate-700 rounded-lg flex items-center justify-center">
                      <ShoppingCart size={16} className="text-slate-300" />
                   </div>
                )}
                <div className="text-left">
                  <p className="font-bold text-sm text-slate-900 dark:text-white leading-tight">{p.name}</p>
                  <p className="text-[10px] text-slate-400 font-medium">{p.category} • {t.stock}: {p.stock}</p>
                </div>
              </div>
              <div className="font-black text-emerald-600 dark:text-emerald-400 text-sm">{formatCurrency(p.price)}</div>
            </button>
          ))}
        </div>

        <div className="w-full md:w-80 flex flex-col bg-slate-100 dark:bg-slate-700 rounded-2xl p-4 overflow-hidden shadow-inner">
          <div className="flex-1 overflow-y-auto space-y-2 no-scrollbar">
            {cart.map(item => (
              <div key={item.id} className="bg-white dark:bg-slate-800 p-2 rounded-lg flex justify-between items-center shadow-sm">
                <div className="flex-1 min-w-0 pr-2">
                  <p className="text-xs font-bold truncate text-slate-900 dark:text-white">{item.name}</p>
                  <p className="text-[9px] font-black text-emerald-600">{formatCurrency(item.price)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center bg-slate-50 dark:bg-slate-700 rounded h-7">
                    <button onClick={() => updateQuantity(item.id, -1)} className="px-1.5 text-slate-500"><Minus size={12}/></button>
                    <span className="text-xs font-black w-4 text-center text-slate-900 dark:text-white">{item.quantity}</span>
                    <button onClick={() => updateQuantity(item.id, 1)} className="px-1.5 text-slate-500"><Plus size={12}/></button>
                  </div>
                  <button onClick={() => removeFromCart(item.id)} className="text-red-500 hover:text-red-600 transition-colors"><Trash2 size={14}/></button>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 space-y-3 pt-3 border-t border-slate-200 dark:border-slate-700">
            <div className="flex justify-between font-black text-lg text-slate-900 dark:text-white"><span>{t.total}</span><span>{formatCurrency(total)}</span></div>
            
            <div className="grid grid-cols-2 gap-1.5">
              <button 
                onClick={() => setPaymentType('cash')} 
                className={cn(
                  "py-2 rounded-lg border font-black text-[9px] transition-all", 
                  paymentType === 'cash' ? "bg-emerald-600 text-white border-emerald-600" : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 dark:border-slate-700"
                )}
              >{t.cash.toUpperCase()}</button>
              <button 
                onClick={() => setPaymentType('udhar')} 
                className={cn(
                   "py-2 rounded-lg border font-black text-[9px] transition-all", 
                   paymentType === 'udhar' ? "bg-amber-500 text-white border-amber-500" : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 dark:border-slate-700"
                )}
              >{t.udhar.toUpperCase()}</button>
              <button 
                onClick={() => setPaymentType('jazzcash')} 
                className={cn(
                   "py-2 rounded-lg border font-black text-[9px] transition-all", 
                   paymentType === 'jazzcash' ? "bg-amber-600 text-white border-amber-600" : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 dark:border-slate-700"
                )}
              >JAZZCASH</button>
              <button 
                onClick={() => setPaymentType('easypaisa')} 
                className={cn(
                   "py-2 rounded-lg border font-black text-[9px] transition-all", 
                   paymentType === 'easypaisa' ? "bg-emerald-500 text-white border-emerald-500" : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 dark:border-slate-700"
                )}
              >EASYPAISA</button>
              <button 
                onClick={() => {
                  setIsCustomerModalOpen(true);
                  setIsAddingNewCustomer(true);
                }} 
                className="col-span-2 py-3 mt-1 rounded-xl border-2 border-dashed border-emerald-200 dark:border-slate-700 bg-emerald-50/30 dark:bg-slate-800 text-emerald-600 dark:text-slate-400 font-black text-[10px] tracking-widest flex items-center justify-center gap-2 hover:bg-emerald-50 hover:border-emerald-500 transition-all shadow-sm active:scale-95"
              >
                <Plus size={16} /> {settings.language === 'en' ? 'ADD CUSTOMER (NAME/NO)' : (settings.language === 'roman' ? 'NAYA GRAHAK (NAAM/NO)' : t.grahak_new.toUpperCase())}
              </button>
            </div>

            {selectedCustomer || tempCustomer ? (
              <div className="flex items-center justify-between bg-indigo-50 dark:bg-indigo-900/20 px-4 py-2 rounded-xl border border-indigo-100 dark:border-indigo-900/40">
                <div className="flex items-center gap-2">
                   <Users size={14} className="text-indigo-600 dark:text-indigo-400" />
                   <span className="text-[10px] font-black uppercase text-indigo-600 dark:text-indigo-400">{(selectedCustomer || tempCustomer)?.name}</span>
                </div>
                <button onClick={() => { setSelectedCustomer(null); setTempCustomer(null); }} className="text-indigo-400 p-1"><Plus className="rotate-45" size={14}/></button>
              </div>
            ) : paymentType === 'udhar' ? (
              <button 
                onClick={() => setIsCustomerModalOpen(true)}
                className="w-full bg-amber-50 dark:bg-amber-900/10 text-amber-600 dark:text-amber-400 text-[10px] font-black uppercase tracking-widest text-center py-3 rounded-xl border border-amber-200 dark:border-amber-900/30 animate-pulse"
              >
                Grahak Select Karein (Udhar ke liye)
              </button>
            ) : null}

            <button onClick={handleCheckout} disabled={cart.length === 0} className="w-full bg-slate-900 dark:bg-white dark:text-slate-900 text-white py-4 rounded-xl font-black text-sm disabled:opacity-50 shadow-xl active:scale-95 transition-all">{t.finalize_bill.toUpperCase()}</button>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {isCustomerModalOpen && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              className="bg-white dark:bg-slate-800 w-full max-w-md rounded-[32px] overflow-hidden shadow-2xl"
            >
              <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-700/50">
                <h3 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tighter">
                  {isAddingNewCustomer ? t.grahak_new : t.select_customer_title}
                </h3>
                <button 
                  onClick={() => {
                    setIsCustomerModalOpen(false);
                    setIsAddingNewCustomer(false);
                  }} 
                  className="p-2 bg-white dark:bg-slate-800 text-slate-400 rounded-full shadow-sm"
                >
                  <Plus className="rotate-45" size={20} />
                </button>
              </div>

              <div className="p-6">
                {!isAddingNewCustomer ? (
                  <div className="space-y-4">
                    <div className="relative">
                      <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                      <input 
                        type="text" 
                        placeholder={t.search_placeholder} 
                        className="w-full bg-slate-50 dark:bg-slate-700 border-none rounded-2xl py-4 pl-12 pr-4 text-sm font-bold dark:text-white focus:ring-2 focus:ring-indigo-500 transition-all"
                        value={customerSearchQuery}
                        onChange={(e) => setCustomerSearchQuery(e.target.value)}
                        autoFocus
                      />
                    </div>

                    <div className="max-h-60 overflow-y-auto space-y-2 no-scrollbar">
                      {filteredCustomers.length > 0 ? (
                        filteredCustomers.map(c => (
                          <button 
                            key={c.id} 
                            onClick={() => {
                              setSelectedCustomer(c); 
                              setIsCustomerModalOpen(false);
                              if (paymentType === 'cash') setPaymentType('udhar');
                            }} 
                            className="w-full text-left p-4 rounded-2xl hover:bg-slate-50 dark:hover:bg-slate-800 border border-transparent hover:border-slate-100 dark:hover:border-slate-700 transition-all group"
                          >
                            <div className="flex justify-between items-center">
                              <div>
                                <p className="font-black text-slate-900 dark:text-white group-hover:text-indigo-600 transition-colors">{c.name}</p>
                                <p className="text-[10px] text-slate-400 font-bold tracking-widest">{c.phone}</p>
                              </div>
                              <div className={cn(
                                "text-xs font-black px-2 py-1 rounded-lg",
                                c.balance > 0 ? "bg-amber-50 text-amber-600" : "bg-emerald-50 text-emerald-600"
                              )}>
                                {formatCurrency(c.balance)}
                              </div>
                            </div>
                          </button>
                        ))
                      ) : (
                        <div className="py-8 text-center bg-slate-50 dark:bg-slate-800/50 rounded-2xl">
                          <p className="text-slate-400 font-bold mb-4">{t.no_results}</p>
                        </div>
                      )}
                    </div>

                    <button 
                      onClick={() => {
                        setIsAddingNewCustomer(true);
                        if (isNaN(Number(customerSearchQuery))) {
                          setNewCustomer({ ...newCustomer, name: customerSearchQuery });
                        } else {
                          setNewCustomer({ ...newCustomer, phone: customerSearchQuery });
                        }
                      }}
                      className="w-full flex items-center justify-center gap-2 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 py-4 rounded-2xl font-black text-xs uppercase tracking-widest active:scale-95 transition-all"
                    >
                      <Plus size={18} /> {t.grahak_new} {customerSearchQuery ? `"${customerSearchQuery}"` : ''}
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <button 
                      type="button"
                      onClick={importFromContacts}
                      className="w-full flex items-center justify-between bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 p-4 rounded-2xl border border-blue-100 dark:border-blue-900/30 font-black active:scale-95 transition-all mb-2"
                    >
                      <div className="flex items-center gap-3">
                        <Users size={20} />
                        <span className="text-sm">Import from Contacts</span>
                      </div>
                      <ChevronRight size={20} />
                    </button>
                    <div className="space-y-1">

                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{t.grahak_name}</label>
                      <input 
                        type="text" 
                        placeholder="e.g. Aslam Bhai" 
                        className="w-full bg-slate-50 dark:bg-slate-700 border-none rounded-2xl py-4 px-6 text-sm font-bold dark:text-white focus:ring-2 focus:ring-emerald-500 transition-all"
                        value={newCustomer.name}
                        onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })}
                        autoFocus
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{t.phone_number}</label>
                      <input 
                        type="tel" 
                        placeholder="e.g. 0300 1234567" 
                        className="w-full bg-slate-50 dark:bg-slate-700 border-none rounded-2xl py-4 px-6 text-sm font-bold dark:text-white focus:ring-2 focus:ring-emerald-500 transition-all"
                        value={newCustomer.phone}
                        onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })}
                      />
                    </div>
                    <div className="flex gap-3 pt-4">
                      <button 
                        onClick={() => {
                          if (!newCustomer.name) return;
                          setTempCustomer({ name: newCustomer.name, phone: newCustomer.phone });
                          setIsAddingNewCustomer(false);
                          setIsCustomerModalOpen(false);
                          setNewCustomer({ name: '', phone: '' });
                        }}
                        disabled={!newCustomer.name}
                        className="flex-1 border-2 border-slate-200 dark:border-slate-700 text-slate-500 py-4 rounded-2xl font-black text-xs uppercase tracking-widest active:scale-95 transition-all disabled:opacity-50"
                      >
                        {t.slip_only}
                      </button>
                      <button 
                        onClick={handleQuickAddCustomer}
                        disabled={!newCustomer.name}
                        className="flex-[1.5] bg-emerald-600 text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-emerald-200 dark:shadow-none active:scale-95 transition-all disabled:opacity-50"
                      >
                        {t.save_to_contacts}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
        {isReceiptOpen && (
          <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-md z-[110] flex flex-col items-center justify-center p-4 overflow-y-auto">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              className="w-full max-w-lg"
            >
                <div 
                  ref={receiptRef}
                  className="bg-white p-4 relative overflow-hidden"
                  style={{
                    backgroundColor: '#ffffff',
                    backgroundImage: 'radial-gradient(#e2e8f0 0.5px, transparent 0.5px)',
                    backgroundSize: '20px 20px',
                    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
                  }}
                >
                  {/* High-end border accent */}
                  <div className="absolute top-0 left-0 right-0 h-1 bg-emerald-600" />
                  
                  {/* Header Section - Uniform Row Layout */}
                  <div className="flex justify-between items-start gap-4 mb-3 mt-1">
                    <div className="flex gap-3 items-start flex-1">
                      {settings.logoUrl && (
                        <div className="flex-shrink-0">
                          <img src={settings.logoUrl} alt="Logo" className="h-14 w-auto object-contain" referrerPolicy="no-referrer" />
                        </div>
                      )}
                      <div>
                        <div className="inline-block bg-emerald-950 text-white px-2 py-0.5 text-[7px] font-black uppercase tracking-widest rounded-full mb-0.5">
                          OFFICIAL RECEIPT
                        </div>
                        <h2 className="text-xl font-black text-slate-900 leading-none uppercase mb-1 tracking-tight">{settings.name}</h2>
                        <div className="flex flex-col gap-0.5 text-[9px] text-slate-500 font-bold">
                          <div className="flex items-center gap-1.5">
                            <span className="w-3 h-3 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600"><Phone size={7}/></span>
                            <span>{settings.phone}</span>
                            <span className="text-slate-300 mx-1">|</span>
                            <span className="w-3 h-3 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600"><CheckCircle2 size={7}/></span>
                            <span>{new Date().toLocaleString('en-PK', { dateStyle: 'short', timeStyle: 'short' })}</span>
                          </div>
                          {settings.address && (
                            <div className="flex items-center gap-1.5">
                              <span className="w-3 h-3 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600"><MapPin size={7}/></span>
                              <span className="truncate max-w-[200px]">{settings.address}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Compact Customer Box */}
                    <div className="w-32 flex-shrink-0">
                      <div className="bg-slate-50 border border-slate-100 rounded-lg p-2">
                        <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest mb-0.5 border-b border-slate-200/50 pb-0.5">CUSTOMER</p>
                        <p className="text-[10px] font-black text-slate-900 leading-tight uppercase truncate">{(selectedCustomer || tempCustomer)?.name || 'Guest'}</p>
                        <p className="text-[8px] font-bold text-slate-500 truncate">{(selectedCustomer || tempCustomer)?.phone || '-'}</p>
                      </div>
                    </div>
                  </div>

                  {/* Items Table - More Compact */}
                  <div className="mb-3 rounded-lg border border-slate-200 overflow-hidden shadow-sm">
                    <div className="bg-slate-900 px-3 py-1 flex justify-between items-center text-[8px] font-black text-white uppercase tracking-widest">
                      <span className="flex-1">ITEM</span>
                      <span className="w-24 text-center">QTY × PRICE</span>
                      <span className="w-20 text-right">TOTAL</span>
                    </div>
                    <div className="divide-y divide-slate-100 px-3">
                      {cart.map(item => (
                        <div key={item.id} className="py-1.5 flex justify-between items-center text-[10px]">
                          <span className="flex-1 font-bold text-slate-800 uppercase pr-2 truncate">{item.name}</span>
                          <span className="w-24 text-center text-slate-500 font-bold tabular-nums">
                            {item.quantity} × {formatCurrency(item.price).replace('Rs.', '').trim()}
                          </span>
                          <span className="w-20 text-right font-black text-slate-900 tabular-nums">
                            {formatCurrency(item.price * item.quantity)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Summary Section - Ultra Compact */}
                  <div className="flex justify-between items-center gap-4 bg-slate-50/50 p-2 rounded-lg border border-dashed border-slate-200">
                    <div className="flex-1">
                      <p className="text-[8px] text-slate-400 font-bold uppercase leading-tight whitespace-pre-wrap">
                        {settings.receiptFooter || "Thank you for shopping!\nCome back soon."}
                      </p>
                    </div>

                    <div className="w-40 space-y-0.5">
                      <div className="flex justify-between items-center text-[7px] font-bold text-slate-400 uppercase tracking-widest border-b border-white pb-0.5">
                        <span>PAID VIA {paymentType.toUpperCase()}</span>
                        <span className="text-slate-600 font-black">{formatCurrency(total)}</span>
                      </div>
                      <div className="flex justify-between items-center pt-0.5">
                        <span className="text-[10px] font-black text-slate-900 uppercase">TOTAL</span>
                        <span className="text-sm font-black text-emerald-600 tabular-nums">
                          {formatCurrency(total)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Clean Footer Section */}
                  <div className="mt-3 pt-2 border-t border-slate-100 flex justify-between items-end">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[8px] font-black uppercase text-slate-400">Powered by Dukan Pro</span>
                      <span className="text-[9px] font-black text-slate-900 tracking-wider">
                        RECEIPT #{currentTransaction?.id?.slice(-8).toUpperCase()}
                      </span>
                    </div>
                    
                    <div className="flex flex-col items-end gap-1">
                      <div className="p-0.5 bg-white border border-slate-100 rounded">
                        <QRCodeSVG value="https://dukanpro.netlify.app/" size={24} />
                      </div>
                      <span className="text-[7px] text-indigo-600 lowercase font-bold">dukanpro.netlify.app</span>
                    </div>
                  </div>

                  {/* Bottom Border Accent */}
                  <div className="absolute bottom-0 left-0 right-0 h-1 bg-slate-100" />
                </div>

              <div className="mt-8 grid grid-cols-2 gap-3">
                <button 
                  onClick={captureReceipt}
                  disabled={isCapturing}
                  className="bg-white text-slate-900 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 shadow-xl active:scale-95 transition-all border-2 border-slate-900"
                >
                  {isCapturing ? (
                    <RefreshCcw className="animate-spin" size={18} />
                  ) : (
                    <>
                      <Download size={18} /> Save Image
                    </>
                  )}
                </button>
                <button 
                  onClick={shareReceiptImage} 
                  disabled={isCapturing}
                  className="bg-emerald-600 text-white py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 shadow-xl shadow-emerald-900/20 active:scale-95 transition-all"
                >
                  {isCapturing ? (
                    <RefreshCcw className="animate-spin" size={18} />
                  ) : (
                    <>
                      <Share2 size={18} /> Share Receipt
                    </>
                  )}
                </button>
              </div>
              <button 
                onClick={() => {setCart([]); setIsReceiptOpen(false); setSelectedCustomer(null); onComplete();}} 
                className="w-full mt-3 bg-slate-800/50 backdrop-blur-md text-white py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl active:scale-95 transition-all"
              >
                Close & Next Bill
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
