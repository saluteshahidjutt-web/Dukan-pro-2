import React, { useState } from 'react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from 'recharts';
import { Product, Customer, Transaction, ShopSettings, Expense } from '../types';
import { formatCurrency, cn } from '../lib/utils';
import { TrendingUp, TrendingDown, DollarSign, Trash2, Calendar, LayoutGrid, Activity, RefreshCw } from 'lucide-react';
import { FirestoreService } from '../lib/firestoreService';

import { translations, Language } from '../lib/translations';

interface ReportsProps {
  products: Product[];
  customers: Customer[];
  transactions: Transaction[];
  expenses: Expense[];
  settings: ShopSettings;
  onNavigate: (tab: 'dashboard' | 'customers' | 'inventory' | 'pos' | 'reports' | 'expenses' | 'settings') => void;
}

export function Reports({ products, customers, transactions, expenses, settings, onNavigate }: ReportsProps) {
  const [timeRange, setTimeRange] = useState<7 | 30>(7);
  const [filter, setFilter] = useState<'all' | 'deleted' | 'return' | 'cash' | 'digital'>('all');
  const [chartType, setChartType] = useState<'bar' | 'line'>('bar');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const t = translations[settings.language as Language || 'en'];

  const handleDeleteAllTransactions = async () => {
    if (!window.confirm('You are all data will be deleted. No option to recover. Are you absolutely sure?')) return;
    
    try {
      await FirestoreService.deleteAllTransactions();
      alert('All transaction records have been deleted.');
    } catch (e) {
      alert('Error deleting all transactions');
    }
  };

  const handleDeleteTransaction = async (tx: Transaction) => {
    if (!window.confirm('Are you sure you want to delete this transaction? This will not automatically revert stock or customer balance.')) return;
    
    try {
      await FirestoreService.deleteTransaction(tx.id);
    } catch (e) {
      alert('Error deleting transaction');
    }
  };

  const handleReturnTransaction = async (tx: Transaction) => {
    if (!window.confirm('Are you sure you want to process a return for this transaction?')) return;
    
    try {
      await FirestoreService.processReturn(tx);
    } catch (e) {
      alert('Error processing return');
    }
  };

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - timeRange);

  const filteredTxs = transactions.filter(t => { 
    const txDate = new Date(t.createdAt);
    if (txDate < cutoffDate) return false;
    
    // Apply type/status filter
    if (filter === 'deleted') return t.isDeleted;
    if (filter === 'return') return !t.isDeleted && t.type === 'return';
    
    if (t.isDeleted) return false;

    if (filter === 'cash') return t.paymentMethod === 'cash' && t.type !== 'return';
    if (filter === 'digital') return ['jazzcash', 'easypaisa'].includes(t.paymentMethod || '') && t.type !== 'return';
    
    return true; // For 'all' - excluding deleted
  });

  const salesData = filteredTxs
    .filter(t => t.type === 'sale')
    .reduce((acc: any[], t) => {
      const date = new Date(t.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' });
      const existing = acc.find(item => item.name === date);
      if (existing) {
        existing.sales += t.amount;
      } else {
        acc.push({ name: date, sales: t.amount, timestamp: new Date(t.createdAt).getTime() });
      }
      return acc;
    }, [])
    .sort((a, b) => a.timestamp - b.timestamp);

  const typeData = [
    { name: t.cash, value: filteredTxs.filter(t => t.type === 'sale' && t.paymentMethod === 'cash').reduce((s, t) => s + t.amount, 0) },
    { name: t.udhar, value: filteredTxs.filter(t => t.type === 'sale' && t.paymentMethod === 'udhar').reduce((s, t) => s + t.amount, 0) },
    { name: 'Online', value: filteredTxs.filter(t => t.type === 'sale' && (t.paymentMethod === 'jazzcash' || t.paymentMethod === 'easypaisa')).reduce((s, t) => s + t.amount, 0) },
  ].filter(d => d.value > 0);

  const totalSales = filteredTxs.reduce((s, t) => {
    if (t.type === 'sale') return s + t.amount;
    if (t.type === 'return') return s - t.amount;
    return s;
  }, 0);

  const totalFilteredExpenses = expenses
    .filter(e => new Date(e.createdAt) >= cutoffDate)
    .reduce((s, e) => s + e.amount, 0);

  const totalProfit = transactions
    .filter(t => !t.isDeleted && t.type === 'sale' && new Date(t.createdAt) >= cutoffDate)
    .reduce((s, t) => {
      const cost = t.items?.reduce((c, item) => {
        const p = products.find(p => p.id === item.productId);
        return c + (p?.purchasePrice || 0) * item.quantity;
      }, 0) || 0;
      return s + (t.amount - cost);
    }, 0) - totalFilteredExpenses;

  const COLORS = ['#10B981', '#F59E0B', '#6366F1'];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end">
        <h2 className="text-2xl font-black text-slate-900 dark:text-white">{t.reports} <span className="text-sm font-medium text-slate-400 block uppercase tracking-tighter">{t.karobar_summary}</span></h2>
        <div className="flex gap-1 bg-slate-200 dark:bg-slate-800 p-1 rounded-xl">
          <button 
            onClick={() => setTimeRange(7)}
            className={cn("px-3 py-1.5 rounded-lg text-[10px] font-black transition-all", timeRange === 7 ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm" : "text-slate-500")}
          >7D</button>
          <button 
            onClick={() => setTimeRange(30)}
            className={cn("px-3 py-1.5 rounded-lg text-[10px] font-black transition-all", timeRange === 30 ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm" : "text-slate-500")}
          >30D</button>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm">
        <div className="flex justify-between items-center mb-6">
          <h3 className="font-bold text-slate-500 dark:text-slate-400 uppercase text-[10px] tracking-widest">{t.sale_trends}</h3>
          <div className="flex gap-1">
             <button onClick={() => setChartType('bar')} className={cn("p-1.5 rounded", chartType === 'bar' ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20" : "text-slate-400")}><LayoutGrid size={14}/></button>
             <button onClick={() => setChartType('line')} className={cn("p-1.5 rounded", chartType === 'line' ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20" : "text-slate-400")}><Activity size={14}/></button>
          </div>
        </div>
        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            {chartType === 'bar' ? (
              <BarChart data={salesData} onClick={(data) => {
                if (data && data.activeLabel) {
                  setSelectedDate(data.activeLabel === selectedDate ? null : data.activeLabel);
                }
              }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" className="dark:opacity-10" />
                <XAxis dataKey="name" fontSize={9} axisLine={false} tickLine={false} />
                <YAxis hide />
                <Tooltip 
                   cursor={{ fill: 'transparent' }}
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', backgroundColor: '#0f172a', color: '#fff' }}
                  itemStyle={{ color: '#fff', fontSize: '12px', fontWeight: 'bold' }}
                  labelStyle={{ display: 'none' }}
                  formatter={(val: number) => [formatCurrency(val), t.pos]}
                />
                <Bar dataKey="sales" fill="#10B981" radius={[6, 6, 0, 0]} barSize={timeRange === 7 ? 30 : 12}>
                  {salesData.map((entry: any, index: number) => (
                    <Cell key={index} fill={selectedDate === entry.name ? '#059669' : '#10B981'} />
                  ))}
                </Bar>
              </BarChart>
            ) : (
              <LineChart data={salesData} onClick={(data) => {
                if (data && data.activeLabel) {
                  setSelectedDate(data.activeLabel === selectedDate ? null : data.activeLabel);
                }
              }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" className="dark:opacity-10" />
                <XAxis dataKey="name" fontSize={9} axisLine={false} tickLine={false} />
                <YAxis hide />
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', backgroundColor: '#0f172a', color: '#fff' }}
                  itemStyle={{ color: '#fff', fontSize: '12px', fontWeight: 'bold' }}
                  labelStyle={{ display: 'none' }}
                  formatter={(val: number) => [formatCurrency(val), t.pos]}
                />
                <Line type="monotone" dataKey="sales" stroke="#10B981" strokeWidth={3} dot={{ r: 4, fill: '#10B981', strokeWidth: 0 }} activeDot={{ r: 6 }} />
              </LineChart>
            )}
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-100 dark:border-slate-800">
           <h4 className="text-[10px] font-bold text-slate-400 uppercase mb-2">Estimated Profit</h4>
           <p className={cn("text-xl font-black", totalProfit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400")}>{formatCurrency(totalProfit)}</p>
           <div className="flex items-center gap-1 mt-2">
             <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">(Revenue - Cost - Expenses)</span>
           </div>
        </div>
        <div 
          onClick={() => onNavigate('expenses')}
          className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-100 dark:border-slate-800 cursor-pointer active:scale-95 transition-all"
        >
           <h4 className="text-[10px] font-bold text-slate-400 uppercase mb-2">Total Expenses</h4>
           <p className="text-xl font-black text-emerald-600 dark:text-emerald-400">{formatCurrency(totalFilteredExpenses)}</p>
           <div className="flex items-center gap-1 mt-2">
             <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">Total Monthly Kharcha</span>
           </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-100 dark:border-slate-800">
           <h4 className="text-[10px] font-bold text-slate-400 uppercase mb-2">{t.total_sales} ({timeRange}D)</h4>
           <p className="text-xl font-black text-slate-900 dark:text-white">{formatCurrency(totalSales)}</p>
           <div className="flex items-center gap-1 mt-2">
             <div className="bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 p-0.5 rounded">
                <TrendingUp size={10} />
             </div>
             <span className="text-[9px] font-bold text-emerald-600 uppercase">Growth</span>
           </div>
        </div>
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-100 dark:border-slate-800">
           <h4 className="text-[10px] font-bold text-slate-400 uppercase mb-2">{t.payment_methods}</h4>
           <div className="h-16">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={typeData} innerRadius={18} outerRadius={28} paddingAngle={4} dataKey="value">
                    {typeData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} stroke="none" />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
           </div>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 overflow-hidden shadow-sm">
        <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
          <h4 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-widest">Transaction Log</h4>
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{filteredTxs.length} Items</span>
        </div>
        <div className="px-6 py-3 border-b border-slate-100 dark:border-slate-800 flex gap-2 overflow-x-auto no-scrollbar">
          {(['all', 'deleted', 'return', 'cash', 'digital'] as const).map(f => (
            <button 
              key={f}
              onClick={() => setFilter(f)}
              className={cn("px-4 py-1.5 rounded-full text-[10px] font-bold uppercase whitespace-nowrap", filter === f ? "bg-emerald-600 text-white" : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-100 dark:border-slate-700")}
            >
              {f}
            </button>
          ))}
        </div>
        <div className="divide-y divide-slate-50 dark:divide-slate-800 max-h-80 overflow-y-auto no-scrollbar">
          {filteredTxs.slice(0, 50).map(t => (
            <div key={t.id} className={cn("p-4 flex justify-between items-center hover:bg-slate-50 dark:hover:bg-slate-800/50 group transition-colors", t.isDeleted && "opacity-50", selectedDate && new Date(t.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' }) === selectedDate ? "bg-emerald-50 dark:bg-emerald-900/10" : "")}>
              <div className="flex items-center gap-3">
                <div className={cn(
                  "p-2 rounded-xl", 
                  t.type === 'sale' ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400" : "bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400"
                )}>
                  {t.type === 'sale' ? <ArrowUpRight size={16}/> : <ArrowDownRight size={16}/>}
                </div>
                <div>
                  <p className="text-xs font-black text-slate-900 dark:text-white uppercase">{t.description} {t.isDeleted && <span className="text-[8px] font-black uppercase px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 ml-2">Deleted</span>}</p>
                  <p className="text-[10px] text-slate-400 font-medium">{new Date(t.createdAt).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <p className="text-xs font-black text-slate-900 dark:text-white">{formatCurrency(t.amount)}</p>
                  <span className={cn(
                    "text-[8px] font-black uppercase px-1.5 py-0.5 rounded",
                    t.paymentMethod === 'cash' ? "bg-emerald-100 text-emerald-700" : 
                    t.paymentMethod === 'udhar' ? "bg-amber-100 text-amber-700" : "bg-indigo-100 text-indigo-700"
                  )}>
                    {t.paymentMethod || t.type}
                  </span>
                </div>
                {t.type === 'sale' && !t.isDeleted && (
                  <button 
                    onClick={() => handleReturnTransaction(t)}
                    className="p-1.5 text-slate-300 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                  >
                    <RefreshCw size={16} />
                  </button>
                )}
                <button 
                  onClick={() => handleDeleteTransaction(t)}
                  className="p-1.5 text-slate-300 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
          <div className="p-4">
            <button 
              onClick={handleDeleteAllTransactions}
              className="w-full py-3 bg-rose-600 text-white rounded-xl font-black text-sm uppercase tracking-wider hover:bg-rose-700 transition-colors"
            >
              Delete all record
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const ArrowUpRight = ({ size }: { size: number }) => <TrendingUp size={size} />;
const ArrowDownRight = ({ size }: { size: number }) => <TrendingDown size={size} />;
