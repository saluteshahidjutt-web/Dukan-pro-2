import React, { useState, useEffect } from 'react';
import { Plus, Calendar, Search, Trash2, X, Tag, FileText, ChevronLeft, XCircle, Mic, UserCircle, Clock, Paperclip, Delete, Pencil, ArrowRight, Camera, Image as ImageIcon } from 'lucide-react';
import { Product, Customer, Transaction, ShopSettings, Expense } from '../types';
import { formatCurrency, cn, generateId } from '../lib/utils';
import { FirestoreService } from '../lib/firestoreService';
import { motion, AnimatePresence } from 'motion/react';
import { ConfirmModal } from './ConfirmModal';

interface ExpensesProps {
  expenses: Expense[];
  settings: ShopSettings;
}

export function Expenses({ expenses, settings }: ExpensesProps) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  
  // Form State
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [time, setTime] = useState(new Date().toTimeString().split(' ')[0].slice(0, 5));
  const [category, setCategory] = useState('Select Category/Party');
  const [photo, setPhoto] = useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const cameraInputRef = React.useRef<HTMLInputElement>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Sync Add Modal state with browser history
  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      if (showAddModal) {
        setShowAddModal(false);
        setEditingExpenseId(null);
        resetForm();
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [showAddModal]);

  const openAddModal = () => {
    window.history.pushState({ subview: 'addExpense' }, '');
    setShowAddModal(true);
  };

  const closeAddModal = () => {
    setShowAddModal(false);
    setEditingExpenseId(null);
    resetForm();
    if (window.history.state?.subview === 'addExpense') {
      window.history.back();
    }
  };

  const openEditModal = (expense: Expense) => {
    window.history.pushState({ subview: 'addExpense' }, '');
    setEditingExpenseId(expense.id);
    setAmount(expense.amount.toString());
    setDescription(expense.description);
    setCategory(expense.category);
    const dt = new Date(expense.createdAt);
    setDate(dt.toISOString().split('T')[0]);
    setTime(dt.toTimeString().split(' ')[0].slice(0, 5));
    setPhoto(expense.evidenceUrl || null);
    setShowAddModal(true);
  };

  const filteredExpenses = expenses.filter(e => 
    e.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
    e.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSaveExpense = async () => {
    // Description is no longer strictly required, default to "General Expense"
    const finalDescription = description.trim() || 'General Expense';
    
    if (!amount || amount === 'Error') return;
    
    // Evaluate the expression if it's an equation
    let finalAmount = 0;
    try {
      const strAmount = String(amount);
      // If it contains operators, try to evaluate it as an expression
      if (/[+\-*/]/.test(strAmount)) {
        const sanitized = strAmount.replace(/[^-+*/.0-9]/g, '');
        // eslint-disable-next-line no-new-func
        const result = new Function(`"use strict"; return (${sanitized})`)();
        finalAmount = parseFloat(result.toString());
      } else {
        finalAmount = parseFloat(strAmount.replace(/[^\d.]/g, ''));
      }
    } catch(e) {
      finalAmount = parseFloat(String(amount).replace(/[^\d.]/g, ''));
    }

    if (isNaN(finalAmount) || finalAmount <= 0) return;

    try {
      // Use current date/time if date/time states are somehow corrupted, though they should be initialized
      const dtString = `${date}T${time}`;
      const dt = new Date(dtString);
      const isoDate = isNaN(dt.getTime()) ? new Date().toISOString() : dt.toISOString();

      const expenseData: any = {
        id: editingExpenseId || generateId(),
        amount: finalAmount,
        description: finalDescription,
        category: category === 'Select Category/Party' ? 'General' : category,
        createdAt: isoDate
      };
      if (photo) expenseData.evidenceUrl = photo;

      await FirestoreService.saveExpense(expenseData);
      closeAddModal();
    } catch (e) {
      console.error("Save expense error:", e);
      alert('Failed to save expense. Please try again.');
    }
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = reader.result as string;
        // Compress image to ~30-40KB
        const img = new Image();
        img.src = base64;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 800;
          let width = img.width;
          let height = img.height;
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);
          const compressed = canvas.toDataURL('image/jpeg', 0.3); // High compression
          setPhoto(compressed);
        };
      };
      reader.readAsDataURL(file);
    }
  };

  const resetForm = () => {
    setAmount('');
    setDescription('');
    setDate(new Date().toISOString().split('T')[0]);
    setTime(new Date().toTimeString().split(' ')[0].slice(0, 5));
    setCategory('Select Category/Party');
    setPhoto(null);
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    setIsDeleting(true);
    try {
      await FirestoreService.deleteExpense(deletingId);
      setDeletingId(null);
    } finally {
      setIsDeleting(false);
    }
  };

  // Calculator Logic
  const addToAmount = (val: string) => {
    setAmount(prev => {
       const strPrev = String(prev);
       if (strPrev === 'Error') return val;
       return strPrev + val;
    });
  };

  const backspaceAmount = () => {
     setAmount(prev => String(prev).slice(0, -1));
  };

  const calculateResult = () => {
     try {
        const strAmount = String(amount);
        if(!strAmount || !/[+\-*/]/.test(strAmount)) return;
        const sanitized = strAmount.replace(/[^-+*/.0-9]/g, '');
        setAmount(Function(`"use strict"; return (${sanitized})`)().toString());
     } catch (e) {
        setAmount('Error');
     }
  };

  return (
    <div className="space-y-6 pb-20">
      <div className="flex gap-2 items-stretch">
        <div className="flex-1 bg-white dark:bg-slate-900 rounded-xl p-3 border border-slate-100 dark:border-slate-800 flex items-center gap-3">
          <Search size={20} className="text-slate-400" />
          <input 
            type="text" 
            placeholder="Search expense / record"
            className="bg-transparent border-none w-full text-sm font-bold dark:text-white focus:ring-0 p-0"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
        <button 
          onClick={openAddModal}
          className="bg-emerald-600 text-white rounded-xl px-5 flex items-center justify-center active:scale-95 transition-all shadow-lg shadow-emerald-200 dark:shadow-none"
        >
          <Plus size={24} />
        </button>
      </div>

      {/* Expense History List */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 overflow-hidden shadow-sm">
        <div className="px-5 py-3 border-b border-slate-50 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/30">
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Recent Records</h3>
          <span className="text-[10px] font-black text-slate-900 dark:text-white bg-slate-200 dark:bg-slate-700 px-2 py-0.5 rounded-full">{filteredExpenses.length} Records</span>
        </div>
        
        <div className="divide-y divide-slate-50 dark:divide-slate-800">
          {filteredExpenses.map((expense) => (
            <div key={expense.id} className="p-4 flex items-center justify-between hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors group">
              <div className="flex flex-col">
                <h4 className="font-bold text-slate-900 dark:text-white text-sm">{expense.description}</h4>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[10px] font-bold text-slate-500 flex items-center gap-1">
                    <Calendar size={10} /> {new Date(expense.createdAt).toLocaleDateString()}
                  </span>
                  <span className="text-[10px] font-bold text-slate-500 uppercase">
                    • {expense.category}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <p className="text-base font-black text-emerald-600">-{formatCurrency(expense.amount, settings.currency)}</p>
                <button 
                  onClick={() => openEditModal(expense)}
                  className="p-1.5 text-slate-300 hover:text-emerald-500 hover:bg-emerald-50 rounded-lg transition-all"
                >
                  <Pencil size={16} />
                </button>
                <button 
                  onClick={() => setDeletingId(expense.id)}
                  className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
          {filteredExpenses.length === 0 && (
            <div className="py-20 flex flex-col items-center justify-center text-slate-300">
              <FileText size={48} className="mb-4 opacity-20" />
              <p className="font-black uppercase tracking-widest text-xs">No records found</p>
            </div>
          )}
        </div>
      </div>

      {/* Add Expense Modal (Full Screen) */}
      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 z-[200] bg-slate-100 flex flex-col">
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'tween', duration: 0.2 }}
              className="absolute inset-0 bg-slate-100 flex flex-col"
            >
              {/* Header */}
              <div className="bg-emerald-600 text-white p-3 flex items-center gap-3 z-50 pt-safe relative">
                 <button onClick={closeAddModal} className="active:scale-90 transition-transform"><ChevronLeft size={28}/></button>
                 <h2 className="text-lg font-bold">{editingExpenseId ? 'Edit' : 'Expense'} -</h2>
                 
                 {/* Decorative block */}
                 <div className="absolute top-full left-0 right-0 h-4 bg-emerald-600 -z-10" />
              </div>

              {/* Form Area */}
              <div className="flex-1 overflow-y-auto px-4 pb-1 bg-transparent z-10 no-scrollbar">
                 <div className="bg-white rounded-2xl p-3 shadow-sm space-y-3 mt-1 border border-slate-100">
        {/* Amount Display - Large at top */}
                     <div className="text-center py-3 bg-emerald-50/50 rounded-2xl mb-2 border border-emerald-100">
                        <p className="text-[10px] font-black text-emerald-600/60 uppercase tracking-widest mb-1">Amount to Pay</p>
                        <div className="flex items-center justify-center gap-1">
                           <span className="text-xl font-black text-emerald-600">Rs.</span>
                           <input 
                              type="text" 
                              value={amount}
                              inputMode="none"
                              onChange={(e) => setAmount(e.target.value)}
                              onFocus={(e) => e.target.select()}
                              onDoubleClick={(e) => (e.target as HTMLInputElement).select()}
                              placeholder="0"
                              className="text-4xl font-black text-slate-900 border-none p-0 focus:ring-0 outline-none bg-transparent w-full text-center max-w-[250px]"
                           />
                        </div>
                     </div>

                     <div className="space-y-3">
                        {/* Photo Preview if exists */}
                        {photo && (
                          <div className="relative w-full h-24 rounded-xl overflow-hidden border border-slate-100 mb-2">
                            <img src={photo} alt="Evidence" className="w-full h-full object-cover" />
                            <button 
                              onClick={() => setPhoto(null)}
                              className="absolute top-2 right-2 p-1 bg-black/50 text-white rounded-full active:scale-95"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        )}

                        {/* Detail / Notes */}
                        <div>
                           <label className="text-[10px] font-black text-slate-400 uppercase ml-1 block mb-1">Expense detail / Notes</label>
                           <textarea 
                              rows={1}
                              value={description}
                              onChange={e => setDescription(e.target.value)}
                              placeholder="Kharche ki detail likhein"
                              className="w-full border border-slate-200 rounded-xl p-2.5 text-sm font-bold focus:ring-1 focus:border-emerald-500 focus:ring-emerald-500/20 bg-white resize-none"
                           />
                        </div>

                        {/* Date & Camera Option Side by Side */}
                        <div className="flex gap-2">
                           <div className="flex-1">
                              <label className="text-[10px] font-black text-slate-400 uppercase ml-1 block mb-0.5">Date</label>
                              <div className="border border-slate-200 rounded-xl p-2.5 flex items-center gap-2 bg-white focus-within:border-emerald-500">
                                 <Calendar size={16} className="text-emerald-600 shrink-0" />
                                 <input type="date" value={date} onChange={e=>setDate(e.target.value)} className="w-full bg-transparent border-none p-0 text-xs font-bold text-slate-700 focus:ring-0" />
                              </div>
                           </div>
                           <div className="w-[120px] flex gap-1">
                              <input 
                                type="file" 
                                ref={fileInputRef} 
                                onChange={handlePhotoUpload} 
                                accept="image/*" 
                                className="hidden" 
                              />
                              <input 
                                type="file" 
                                ref={cameraInputRef} 
                                onChange={handlePhotoUpload} 
                                accept="image/*" 
                                capture="environment"
                                className="hidden" 
                              />
                              <div className="flex-1">
                                <label className="text-[10px] font-black text-slate-400 uppercase block mb-0.5 text-center">Gallery</label>
                                <button 
                                  onClick={() => fileInputRef.current?.click()}
                                  className={cn(
                                    "w-full border border-slate-200 rounded-xl p-2.5 flex items-center justify-center transition-all h-[38px] mt-0",
                                    photo ? "bg-emerald-50 border-emerald-200 text-emerald-600" : "bg-white text-slate-500 active:bg-slate-50"
                                  )}
                                >
                                   <ImageIcon size={16} />
                                </button>
                              </div>
                              <div className="flex-1">
                                <label className="text-[10px] font-black text-slate-400 uppercase block mb-0.5 text-center">Camera</label>
                                <button 
                                  onClick={() => cameraInputRef.current?.click()}
                                  className={cn(
                                    "w-full border border-slate-200 rounded-xl p-2.5 flex items-center justify-center transition-all h-[38px] mt-0",
                                    photo ? "bg-emerald-50 border-emerald-200 text-emerald-600" : "bg-white text-slate-500 active:bg-slate-50"
                                  )}
                                >
                                   <Camera size={16} />
                                </button>
                              </div>
                           </div>
                        </div>

                        {/* Save Button for visibility */}
                        <button 
                          onClick={handleSaveExpense} 
                          className="w-full bg-emerald-600 text-white font-black py-4 rounded-xl mt-2 text-xs uppercase tracking-widest shadow-lg shadow-emerald-100 active:bg-emerald-700 transition-colors"
                        >
                           Save Expense
                        </button>
                     </div>
                 </div>
              </div>

              {/* Calculator Area - Fixed Height 320px, Green/White Theme */}
              <div className="bg-white p-2 border-t border-slate-100 shadow-2xl z-20 h-[310px] flex flex-col justify-between pb-8">
                 <div className="grid grid-cols-4 gap-1 flex-1">
                    {/* Row 1 */}
                    <button onClick={()=>setAmount('')} className="bg-slate-100 text-slate-600 rounded-2xl font-black text-xl active:bg-slate-200 transition-colors">AC</button>
                    <button onClick={()=>addToAmount('/')} className="bg-emerald-50 text-emerald-600 rounded-2xl font-black text-xl active:bg-emerald-100 transition-colors">÷</button>
                    <button onClick={()=>addToAmount('*')} className="bg-emerald-50 text-emerald-600 rounded-2xl font-black text-xl active:bg-emerald-100 transition-colors">×</button>
                    <button onClick={backspaceAmount} className="bg-slate-100 text-slate-600 rounded-2xl font-black text-xl flex items-center justify-center active:bg-slate-200 transition-colors"><Delete size={20}/></button>

                    {/* Row 2 */}
                    <button onClick={()=>addToAmount('7')} className="bg-white border border-slate-100 rounded-2xl font-black text-xl shadow-sm active:bg-slate-50 transition-colors">7</button>
                    <button onClick={()=>addToAmount('8')} className="bg-white border border-slate-100 rounded-2xl font-black text-xl shadow-sm active:bg-slate-50 transition-colors">8</button>
                    <button onClick={()=>addToAmount('9')} className="bg-white border border-slate-100 rounded-2xl font-black text-xl shadow-sm active:bg-slate-50 transition-colors">9</button>
                    <button onClick={()=>addToAmount('-')} className="bg-emerald-50 text-emerald-600 rounded-2xl font-black text-2xl active:bg-emerald-100 transition-colors">-</button>

                    {/* Row 3 */}
                    <button onClick={()=>addToAmount('4')} className="bg-white border border-slate-100 rounded-2xl font-black text-xl shadow-sm active:bg-slate-50 transition-colors">4</button>
                    <button onClick={()=>addToAmount('5')} className="bg-white border border-slate-100 rounded-2xl font-black text-xl shadow-sm active:bg-slate-50 transition-colors">5</button>
                    <button onClick={()=>addToAmount('6')} className="bg-white border border-slate-100 rounded-2xl font-black text-xl shadow-sm active:bg-slate-50 transition-colors">6</button>
                    <button onClick={()=>addToAmount('+')} className="bg-emerald-50 text-emerald-600 rounded-2xl font-black text-2xl row-span-2 flex items-center justify-center active:bg-emerald-100 transition-colors">+</button>

                    {/* Row 4 */}
                    <button onClick={()=>addToAmount('1')} className="bg-white border border-slate-100 rounded-2xl font-black text-xl shadow-sm active:bg-slate-50 transition-colors">1</button>
                    <button onClick={()=>addToAmount('2')} className="bg-white border border-slate-100 rounded-2xl font-black text-xl shadow-sm active:bg-slate-50 transition-colors">2</button>
                    <button onClick={()=>addToAmount('3')} className="bg-white border border-slate-100 rounded-2xl font-black text-xl shadow-sm active:bg-slate-50 transition-colors">3</button>

                    {/* Row 5 */}
                    <button onClick={()=>addToAmount('00')} className="bg-white border border-slate-100 rounded-2xl font-black text-xl shadow-sm active:bg-slate-50 transition-colors">00</button>
                    <button onClick={()=>addToAmount('0')} className="bg-white border border-slate-100 rounded-2xl font-black text-xl shadow-sm active:bg-slate-100 transition-colors">0</button>
                    <button onClick={()=>addToAmount('.')} className="bg-white border border-slate-100 rounded-2xl font-black text-xl shadow-sm active:bg-slate-100 transition-colors">.</button>
                    <button onClick={handleSaveExpense} className="bg-emerald-600 text-white rounded-2xl font-black text-xl flex items-center justify-center active:bg-emerald-700 transition-colors shadow-lg shadow-emerald-100">
                       <ArrowRight size={28} />
                    </button>
                 </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <ConfirmModal 
        isOpen={!!deletingId}
        isLoading={isDeleting}
        title="Delete Record?"
        message="Are you sure you want to delete this expense record?"
        onConfirm={handleDelete}
        onCancel={() => setDeletingId(null)}
      />
    </div>
  );
}
