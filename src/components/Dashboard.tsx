import React from 'react';
import { TrendingUp, Users, AlertTriangle, Wallet, ArrowUpRight, ArrowDownRight, BarChart3, ShoppingCart, Package, X, Trash2, RefreshCw } from 'lucide-react';
import { Product, Customer, Transaction, ShopSettings, Expense } from '../types';
import { formatCurrency, cn } from '../lib/utils';
import { motion } from 'motion/react';
import { FirestoreService } from '../lib/firestoreService';

import { translations, Language } from '../lib/translations';

interface DashboardProps {
  products: Product[];
  customers: Customer[];
  transactions: Transaction[];
  expenses: Expense[];
  settings: ShopSettings;
  onNavigate: (tab: any) => void;
}

export function Dashboard({ products, customers, transactions, expenses, settings, onNavigate }: DashboardProps) {
  const [showSalesModal, setShowSalesModal] = React.useState(false);
  const [confirmDialog, setConfirmDialog] = React.useState<{message: string, action: () => Promise<void>} | null>(null);

  const handleReturnTransaction = async (tx: Transaction) => {
    setConfirmDialog({
      message: 'Are you sure you want to process a return for this transaction?',
      action: async () => {
        try {
          await FirestoreService.processReturn(tx);
        } catch (e) {
          alert('Error processing return');
        }
      }
    });
  };

  const handleDeleteTransaction = async (tx: Transaction) => {
    setConfirmDialog({
      message: 'Are you sure you want to remove this transaction from the log? It will remain in the customer\'s Khata if applicable.',
      action: async () => {
        try {
          await FirestoreService.clearSingleTransactionFromLog(tx.id);
        } catch (e) {
          alert('Failed to remove from log');
        }
      }
    });
  };

  // Use local day start for filtering
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  
  const todaySales = transactions
    .filter(t => {
      const txDate = new Date(t.createdAt);
      return !t.isDeleted && !t.isClearedFromLog && txDate.getTime() >= todayStart;
    })
    .reduce((sum, t) => {
      if (t.type === 'sale') return sum + t.amount;
      if (t.type === 'return') return sum - t.amount;
      return sum;
    }, 0);

  const totalSalesAllTime = transactions
    .filter(t => !t.isDeleted && !t.isClearedFromLog)
    .reduce((sum, t) => {
      if (t.type === 'sale') return sum + t.amount;
      if (t.type === 'return') return sum - t.amount;
      return sum;
    }, 0);

  const totalUdhar = customers.reduce((sum, c) => sum + (c.balance > 0 ? c.balance : 0), 0);
  const lowStockCount = products.filter(p => p.stock <= p.lowStockThreshold).length;

  const todayExpenses = expenses
    .filter(e => {
       const d = new Date(e.createdAt);
       return d.getTime() >= todayStart;
    })
    .reduce((sum, e) => sum + e.amount, 0);

  // Best Selling Products
  const productSalesMap = new Map<string, number>();
  transactions
    .filter(t => t.type === 'sale' && !t.isDeleted && !t.isClearedFromLog && t.items)
    .forEach(t => {
      t.items?.forEach(item => {
        productSalesMap.set(item.productId, (productSalesMap.get(item.productId) || 0) + item.quantity);
      });
    });

  const bestSellingProducts = Array.from(productSalesMap.entries())
    .map(([id, qty]) => ({
      product: products.find(p => p.id === id),
      quantity: qty
    }))
    .filter(item => item.product)
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 4);

  const t = translations[settings.language as Language || 'en'];

  return (
    <div className="space-y-6">
      {/* Welcome Section */}
      <section>
        <h2 className="text-sm font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">{t.welcome}</h2>
        <h3 className="text-2xl font-bold text-slate-900 dark:text-white">{settings.name}</h3>
      </section>

      {/* Primary Stats Grid */}
      <div className="grid grid-cols-2 gap-4">
        <StatCard 
          icon={<TrendingUp className="text-emerald-600 dark:text-emerald-400" size={20} />}
          label={t.total_sales}
          value={formatCurrency(todaySales, settings.currency)}
          trend={`${formatCurrency(totalSalesAllTime, settings.currency)}`}
          trendLabel={t.total}
          color="emerald"
          onClick={() => setShowSalesModal(true)}
        />
        <StatCard 
          icon={<ArrowDownRight className="text-emerald-600 dark:text-emerald-400" size={20} />}
          label="Today's Expenses"
          value={formatCurrency(todayExpenses, settings.currency)}
          trend={formatCurrency(expenses.reduce((s, e) => s + e.amount, 0), settings.currency)}
          trendLabel="Total"
          color="emerald"
          onClick={() => onNavigate('expenses')}
        />
        <StatCard 
          icon={<Wallet className="text-amber-600 dark:text-amber-400" size={20} />}
          label={t.total_udhar}
          value={formatCurrency(totalUdhar, settings.currency)}
          color="amber"
          onClick={() => onNavigate('customers')}
        />
        <StatCard 
          icon={<AlertTriangle className={cn(lowStockCount > 0 ? "text-amber-600 dark:text-amber-400" : "text-slate-400 dark:text-slate-600")} size={20} />}
          label={t.low_stock}
          value={lowStockCount.toString()}
          color={lowStockCount > 0 ? "amber" : "slate"}
          onClick={() => onNavigate('inventory')}
        />
      </div>

      {/* Quick Actions */}
      <section>
        <h3 className="text-lg font-bold mb-3 dark:text-white">{t.quick_actions}</h3>
        <div className="flex gap-4 overflow-x-auto pb-2 -mx-1 px-1 no-scrollbar">
          <ActionButton 
            label={t.add_sale} 
            sub={t.sub_add_sale} 
            icon={<ShoppingCart className="text-white" size={20} />} 
            onClick={() => onNavigate('pos')}
            className="bg-emerald-600 !border-emerald-500"
            labelClass="!text-white"
            subClass="!text-emerald-100"
            iconClass="!bg-emerald-500/50 !text-white"
          />
          <ActionButton 
            label="Expenses" 
            sub="Manage Kharcha" 
            icon={<ArrowDownRight size={20} />} 
            onClick={() => onNavigate('expenses')}
            className="bg-emerald-50 dark:bg-emerald-800/10 !border-emerald-100 dark:!border-emerald-800/30"
          />
          <ActionButton 
            label={t.add_customer} 
            sub={t.sub_add_customer} 
            icon={<Users size={20} />} 
            onClick={() => onNavigate('customers')}
          />
          <ActionButton 
            label={t.add_stock} 
            sub={t.sub_add_stock} 
            icon={<Package size={20} />} 
            onClick={() => onNavigate('inventory')}
          />
          <ActionButton 
            label={t.view_reports} 
            sub={t.sub_view_reports} 
            icon={<BarChart3 size={20} />} 
            onClick={() => onNavigate('reports')}
          />
        </div>
      </section>

      {/* Best Selling Products */}
      <section>
        <h3 className="text-lg font-bold mb-3 dark:text-white">Mashhoor Products (Top Selling)</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {bestSellingProducts.map(({ product, quantity }: any) => (
            <div key={product.id} className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-100 dark:border-slate-700 flex items-center gap-4 transition-all hover:shadow-md">
              <div className="h-12 w-12 bg-emerald-50 dark:bg-emerald-800/20 rounded-xl flex items-center justify-center shrink-0">
                {product.image ? (
                  <img src={product.image} alt={product.name} className="h-full w-full object-cover rounded-xl" />
                ) : (
                  <Package className="text-emerald-600 dark:text-emerald-400" size={24} />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-black text-slate-900 dark:text-white truncate uppercase text-sm">{product.name}</p>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">{product.category}</p>
              </div>
              <div className="text-right">
                <p className="text-xs font-black text-emerald-600 dark:text-emerald-400 uppercase">{quantity} SOLD</p>
                <p className="text-[10px] text-slate-400 font-bold">{formatCurrency(product.price * quantity, settings.currency)}</p>
              </div>
            </div>
          ))}
          {bestSellingProducts.length === 0 && (
            <div className="col-span-full py-8 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 flex flex-col items-center justify-center">
               <Package size={32} className="text-slate-300 mb-2" />
               <p className="text-slate-400 font-bold text-sm">Abhi tak koi product sale nahi hui.</p>
            </div>
          )}
        </div>
      </section>

      {/* Sales Log Modal */}
      {showSalesModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="bg-white dark:bg-slate-800 w-full max-w-lg rounded-[32px] overflow-hidden shadow-2xl flex flex-col max-h-[85vh]"
          >
            <div className="p-4 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-700/50">
              <div>
                <h3 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tighter">
                  {t.total_sales}
                </h3>
              </div>
              <button 
                onClick={() => setShowSalesModal(false)}
                className="p-2 bg-white dark:bg-slate-800 text-slate-400 rounded-full shadow-sm hover:text-red-500 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-4 flex-1 overflow-y-auto no-scrollbar">
              <div className="space-y-3">
                {transactions
                  .filter(tx => tx.type === 'sale' && !tx.isDeleted && !tx.isClearedFromLog)
                  .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                  .map(tx => (
                    <div key={tx.id} className="p-4 bg-slate-50 dark:bg-slate-700/50 rounded-2xl border border-slate-100 dark:border-slate-600 flex justify-between items-center group hover:bg-white dark:hover:bg-slate-700 transition-all hover:shadow-md">
                      <div className="flex items-center gap-4">
                        <div className={cn(
                          "w-10 h-10 rounded-xl flex items-center justify-center shadow-sm",
                          tx.paymentMethod === 'cash' ? "bg-emerald-100 text-emerald-600" : 
                          tx.paymentMethod === 'udhar' ? "bg-amber-100 text-amber-600" : "bg-indigo-100 text-indigo-600"
                        )}>
                          <ShoppingCart size={20} />
                        </div>
                        <div>
                          <p className="text-sm font-black text-slate-900 dark:text-white uppercase">{tx.description}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[10px] text-slate-400 font-bold">{new Date(tx.createdAt).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                            {tx.customerName && <span className="text-[9px] bg-slate-200 dark:bg-slate-700 px-1.5 py-0.5 rounded text-slate-600 dark:text-slate-400 font-bold uppercase">Customer: {tx.customerName}</span>}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className="text-sm font-black text-slate-900 dark:text-white">{formatCurrency(tx.amount, settings.currency)}</p>
                          <span className={cn(
                             "text-[9px] font-black uppercase px-2 py-0.5 rounded shadow-sm inline-block",
                             tx.paymentMethod === 'cash' ? "bg-emerald-600 text-white" : 
                             tx.paymentMethod === 'udhar' ? "bg-amber-500 text-white" : "bg-indigo-600 text-white"
                          )}>
                            {tx.paymentMethod || 'sale'}
                          </span>
                        </div>
                        {tx.type === 'sale' && !tx.isDeleted && (
                          <button 
                            onClick={() => handleReturnTransaction(tx)}
                            className="p-2 text-slate-300 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-xl transition-all"
                          >
                            <RefreshCw size={18} />
                          </button>
                        )}
                        {!tx.isDeleted && (
                          <button 
                            onClick={() => handleDeleteTransaction(tx)}
                            className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-all"
                          >
                            <Trash2 size={18} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                
                {transactions.filter(tx => tx.type === 'sale' && !tx.isDeleted && !tx.isClearedFromLog).length === 0 && (
                  <div className="text-center py-12">
                    <p className="text-slate-400 font-bold">Abhi tak koi sale nahi hui.</p>
                    <button 
                      onClick={() => onNavigate('pos')}
                      className="mt-4 text-emerald-600 text-xs font-black uppercase tracking-widest decoration-dotted underline underline-offset-4"
                    >
                      Pehli Sale Karein
                    </button>
                  </div>
                )}
              </div>
            </div>
            
            <div className="p-4 bg-slate-50 dark:bg-slate-700/50 border-t border-slate-100 dark:border-slate-700">
              <button 
                onClick={() => setShowSalesModal(false)}
                className="w-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 py-4 rounded-2xl font-black uppercase tracking-widest text-xs shadow-xl active:scale-95 transition-all"
              >
                Done
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {confirmDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm shadow-2xl">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 max-w-sm w-full border border-slate-100 dark:border-slate-800">
            <h3 className="text-lg font-black text-slate-800 dark:text-white mb-2">Confirmation Required</h3>
            <p className="text-sm font-bold text-slate-600 dark:text-slate-400 mb-6">{confirmDialog.message}</p>
            <div className="flex gap-3">
              <button 
                onClick={() => setConfirmDialog(null)}
                className="flex-1 py-3 px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold text-sm hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={async () => {
                  if (confirmDialog?.action) {
                    await confirmDialog.action();
                  }
                  setConfirmDialog(null);
                }}
                className="flex-1 py-3 px-4 rounded-xl bg-rose-600 text-white font-bold text-sm shadow-lg shadow-rose-200 hover:bg-rose-700 transition-colors"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon, label, labelUr, value, trend, trendLabel, color, onClick }: any) {
  const colors: any = {
    emerald: "text-emerald-600 dark:text-emerald-400",
    amber: "text-amber-500 dark:text-amber-400",
    blue: "text-slate-800 dark:text-blue-400",
    slate: "text-slate-400 dark:text-slate-600",
  };

  return (
    <motion.button
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm text-left flex flex-col justify-between hover:shadow-md transition-all active:bg-slate-50 dark:active:bg-slate-700 min-h-[140px]"
    >
      <div>
        <p className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-tight">{label}</p>
      </div>
      <div className="mt-2">
        <h3 className={cn("text-2xl font-bold mt-1", colors[color])}>{value}</h3>
        {trend ? (
          <div className="mt-2 pt-2 border-t border-slate-50 dark:border-slate-700">
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">{trendLabel || "Total"}</p>
            <p className="text-sm font-black text-slate-900 dark:text-white">{trend}</p>
          </div>
        ) : (
          <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-2 font-medium uppercase">Summary</p>
        )}
      </div>
    </motion.button>
  );
}

function ActionButton({ label, sub, icon, onClick, className, labelClass, subClass, iconClass }: any) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "flex flex-col items-center justify-center bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 min-w-[120px] shadow-sm hover:shadow-md transition-shadow active:bg-slate-50 dark:active:bg-slate-700",
        className
      )}
    >
      <div className={cn("bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 p-2 rounded-xl mb-2", iconClass)}>{icon}</div>
      <span className={cn("text-xs font-bold text-slate-900 dark:text-white leading-tight", labelClass)}>{label}</span>
      <span className={cn("text-[8px] text-slate-400 dark:text-slate-500 uppercase tracking-widest font-black mt-1", subClass)}>{sub}</span>
    </button>
  );
}

