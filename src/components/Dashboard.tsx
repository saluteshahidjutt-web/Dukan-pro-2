import React from 'react';
import { TrendingUp, Users, AlertTriangle, Wallet, ArrowUpRight, ArrowDownRight, BarChart3, ShoppingCart, Package } from 'lucide-react';
import { Product, Customer, Transaction, ShopSettings } from '../types';
import { formatCurrency, cn } from '../lib/utils';
import { motion } from 'motion/react';
import { Trash2 } from 'lucide-react';
import { FirestoreService } from '../lib/firestoreService';

import { translations, Language } from '../lib/translations';

interface DashboardProps {
  products: Product[];
  customers: Customer[];
  transactions: Transaction[];
  settings: ShopSettings;
  onNavigate: (tab: any) => void;
}

export function Dashboard({ products, customers, transactions, settings, onNavigate }: DashboardProps) {
  const handleDeleteTransaction = async (tx: Transaction) => {
    if (!window.confirm('Delete this transaction? Errors in balance or stock must be fixed manually.')) return;
    try {
      await FirestoreService.deleteTransaction(tx.id);
    } catch (e) {
      alert('Failed to delete');
    }
  };

  // Use local day start for filtering
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  
  const todaySales = transactions
    .filter(t => {
      const isSale = t.type === 'sale';
      const txDate = new Date(t.createdAt);
      return isSale && txDate.getTime() >= todayStart;
    })
    .reduce((sum, t) => sum + t.amount, 0);

  const totalSalesAllTime = transactions
    .filter(t => t.type === 'sale')
    .reduce((sum, t) => sum + t.amount, 0);

  const totalUdhar = customers.reduce((sum, c) => sum + (c.balance > 0 ? c.balance : 0), 0);
  const lowStockCount = products.filter(p => p.stock <= p.lowStockThreshold).length;

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
        />
        <StatCard 
          icon={<Wallet className="text-amber-600 dark:text-amber-400" size={20} />}
          label={t.total_udhar}
          value={formatCurrency(totalUdhar, settings.currency)}
          color="amber"
          onClick={() => onNavigate('customers')}
        />
        <StatCard 
          icon={<Users className="text-blue-600 dark:text-blue-400" size={20} />}
          label={t.total_customers}
          value={customers.length.toString()}
          color="blue"
          onClick={() => onNavigate('customers')}
        />
        <StatCard 
          icon={<AlertTriangle className={cn(lowStockCount > 0 ? "text-rose-600 dark:text-rose-400" : "text-slate-400 dark:text-slate-600")} size={20} />}
          label={t.low_stock}
          value={lowStockCount.toString()}
          color={lowStockCount > 0 ? "rose" : "slate"}
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
    </div>
  );
}

function StatCard({ icon, label, labelUr, value, trend, trendLabel, color, onClick }: any) {
  const colors: any = {
    emerald: "text-emerald-600 dark:text-emerald-400",
    amber: "text-amber-500 dark:text-amber-400",
    blue: "text-slate-800 dark:text-blue-400",
    rose: "text-rose-500 dark:text-rose-400",
    slate: "text-slate-400 dark:text-slate-600",
  };

  return (
    <motion.button
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm text-left flex flex-col justify-between hover:shadow-md transition-all active:bg-slate-50 dark:active:bg-slate-800 min-h-[140px]"
    >
      <div>
        <p className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-tight">{label}</p>
      </div>
      <div className="mt-2">
        <h3 className={cn("text-2xl font-bold mt-1", colors[color])}>{value}</h3>
        {trend ? (
          <div className="mt-2 pt-2 border-t border-slate-50 dark:border-slate-800">
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
        "flex flex-col items-center justify-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 min-w-[120px] shadow-sm hover:shadow-md transition-shadow active:bg-slate-50 dark:active:bg-slate-800",
        className
      )}
    >
      <div className={cn("bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 p-2 rounded-xl mb-2", iconClass)}>{icon}</div>
      <span className={cn("text-xs font-bold text-slate-900 dark:text-white leading-tight", labelClass)}>{label}</span>
      <span className={cn("text-[8px] text-slate-400 dark:text-slate-500 uppercase tracking-widest font-black mt-1", subClass)}>{sub}</span>
    </button>
  );
}

