import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, 
  Users, 
  Package, 
  ShoppingCart, 
  BarChart3, 
  Settings as SettingsIcon,
  Plus,
  ArrowUpRight,
  ArrowDownRight,
  Menu,
  X,
  LogOut,
  MessageCircle,
  Lock,
  Wifi,
  WifiOff,
  RefreshCw,
  Share2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Dashboard } from './components/Dashboard';
import { Customers } from './components/Customers';
import { Inventory } from './components/Inventory';
import { POS } from './components/POS';
import { Reports } from './components/Reports';
import { Expenses } from './components/Expenses';
import { Settings } from './components/Settings';
import { Login } from './components/Login';
import { Onboarding } from './components/Onboarding';
import { PINScreen } from './components/PINScreen';
import { ConfirmModal } from './components/ConfirmModal';
import { 
  onAuthStateChanged, 
  signOut,
  getRedirectResult
} from './lib/firebase';
import { auth } from './lib/firebase';
import { FirestoreService } from './lib/firestoreService';
import { Product, Customer, Transaction, ShopSettings, Expense } from './types';
import { cn } from './lib/utils';
import { useNetworkStatus } from './lib/hooks';

import { translations, Language } from './lib/translations';

export default function App() {
  return <MainApp />;
}

function MainApp() {
  const isOnline = useNetworkStatus();
  const [user, setUser] = useState<any>(null);
  const [isGuest, setIsGuest] = useState(false);
  const [isLocked, setIsLocked] = useState(true);
  const [authLoading, setAuthLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [currentPath, setCurrentPath] = useState('');
  const [renderError, setRenderError] = useState<string | null>(null);
  const [targetCustomerId, setTargetCustomerId] = useState<string | null>(null);

  // Auth Listener
  useEffect(() => {
    return onAuthStateChanged(auth, (u: any) => {
      setUser(u);
      setAuthLoading(false);
    });
  }, []);

  // Global Error Handler for Async Errors and Rejections
  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      console.error("Global Error Detected:", event.error);
      // Suppress UI crash for non-critical login/network errors
      if (event.message?.includes('Firebase') || event.message?.includes('auth') || event.message?.includes('permission')) return;
      setRenderError(event.message || "Unknown error occurred");
    };

    const handleRejection = (event: PromiseRejectionEvent) => {
      console.error("Unhandled Rejection:", event.reason);
      const msg = typeof event.reason === 'string' ? event.reason : (event.reason?.message || "");
      
      // Broadly suppress UI crash for common non-critical errors (auth, network, firebase, aborted)
      const shouldSuppress = 
        !msg ||
        msg.includes('Firebase') || 
        msg.includes('auth') || 
        msg.includes('permission') || 
        msg.includes('403') ||
        msg.includes('network') ||
        msg.includes('aborted') ||
        msg.includes('quota') ||
        msg.includes('Offline');
        
      if (shouldSuppress) return;
      
      setRenderError(msg || "Async Error");
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleRejection);
    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleRejection);
    };
  }, []);

  // Sync effect
  useEffect(() => {
    if (isOnline && user && !localStorage.getItem('dukan_has_migrated')) {
      setIsSyncing(true);
      FirestoreService.syncLocalToCloud(user.uid).catch(err => {
        console.error("Sync failed:", err);
      }).finally(() => {
        setIsSyncing(false);
      });
    }
  }, [isOnline, user]);

  // Handle Redirect Result
  useEffect(() => {
    getRedirectResult(auth).then((result) => {
      if (result?.user) {
        setIsSyncing(true);
        FirestoreService.syncLocalToCloud(result.user.uid).catch(err => {
          console.error("Sync after redirect failed:", err);
        }).finally(() => {
          setIsSyncing(false);
          alert("Dukaan Pro Cloud Sync Active! Ap ka data ab mehfooz hai.");
        });
      }
    }).catch((error) => {
      if (error.code !== 'auth/no-current-user') {
        console.error("Redirect result error:", error);
      }
    });
  }, []);

  const [activeTab, setActiveTab] = useState<'dashboard' | 'customers' | 'inventory' | 'pos' | 'reports' | 'expenses' | 'settings'>('dashboard');
  const [lastBackPress, setLastBackPress] = useState(0);
  const [showExitToast, setShowExitToast] = useState(false);

  // Sync activeTab with Browser History for Mobile Back Button
  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      const state = event.state;

      // If this is a subview state, let the component handle it (or ignore it)
      if (state && (state.subview || state.view)) {
        return;
      }

      // If we see a state with a tab, move to that tab
      if (state && state.tab) {
        setActiveTab(state.tab);
        return;
      }

      // Fallback: If no state or sub-view handled it, default to dashboard
      if (activeTab !== 'dashboard') {
        setActiveTab('dashboard');
        window.history.pushState({ tab: 'dashboard' }, '');
      } else {
        // We are on dashboard
        const now = Date.now();
        if (now - lastBackPress < 2000) {
          setShowExitToast(false);
        } else {
          setLastBackPress(now);
          setShowExitToast(true);
          setTimeout(() => setShowExitToast(false), 2000);
          window.history.pushState({ tab: 'dashboard' }, '');
        }
      }
    };

    // Push initial state
    if (window.history.state?.tab !== 'dashboard') {
      window.history.replaceState({ tab: 'dashboard' }, '');
    }

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [activeTab, lastBackPress]);

  // Push state when tab changes (if manually changed via UI)
  useEffect(() => {
    if (activeTab !== 'dashboard') {
      window.history.pushState({ tab: activeTab }, '');
    }
  }, [activeTab]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [shopSettings, setShopSettings] = useState<ShopSettings>({
    name: 'Dukaan Pro',
    phone: '',
    currency: 'Rs.',
    language: 'en',
    theme: 'light'
  });

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isNavHidden, setIsNavHidden] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [signOutConfirm, setSignOutConfirm] = useState(false);

  // Firestore Data Sync
  useEffect(() => {
    // We sync for both real users AND guests (who use local storage via the same service)
    if (!user && !isGuest) return;

    const unsubProducts = FirestoreService.subscribeToProducts(setProducts);
    const unsubCustomers = FirestoreService.subscribeToCustomers(setCustomers);
    const unsubTransactions = FirestoreService.subscribeToTransactions(setTransactions);
    const unsubExpenses = FirestoreService.subscribeToExpenses(setExpenses);
    const unsubSettings = FirestoreService.subscribeToSettings((s) => {
      setSettingsLoading(false);
      if (s) {
        setShopSettings(s);
        setNeedsOnboarding(false);
      } else {
        if (!isGuest) {
          setNeedsOnboarding(true);
          setIsLocked(false);
        } else {
          setSettingsLoading(false);
        }
      }
    });

    return () => {
      unsubProducts();
      unsubCustomers();
      unsubTransactions();
      unsubExpenses();
      unsubSettings();
    };
  }, [user, isGuest]);

  // Handle theme application
  useEffect(() => {
    if (shopSettings.theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [shopSettings.theme]);

  // --- Early Returns AFTER all hooks have been declared ---

  if (renderError) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
        <div className="bg-white p-8 rounded-[40px] shadow-2xl max-w-md border border-slate-100">
           <div className="text-4xl mb-4">⚠️</div>
           <h1 className="text-2xl font-black text-slate-900 mb-2">Technical Error</h1>
           <p className="text-slate-500 font-medium mb-6">
             The app encountered a technical issue. This usually happens if your session expires or a new update was deployed. 
           </p>
           <button 
             onClick={() => {
               localStorage.clear();
               window.location.reload();
             }}
             className="w-full bg-emerald-600 text-white py-4 rounded-2xl font-black shadow-xl shadow-emerald-200 active:scale-95 transition-all mb-4"
           >
             Refresh & Fix
           </button>
           <p className="text-[10px] text-slate-400 font-mono break-all">{renderError}</p>
        </div>
      </div>
    );
  }

  if (authLoading || (user && settingsLoading)) {
    return (
      <div className="min-h-screen bg-emerald-900 flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-emerald-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user && !isGuest) {
    return (
      <div className="relative min-h-screen">
        <Login />
        <div className="fixed bottom-10 left-0 right-0 flex justify-center z-50">
          <button 
            onClick={() => setIsGuest(true)}
            className="text-emerald-400/60 font-bold text-xs underline underline-offset-4 hover:text-emerald-400 transition-colors"
          >
            CONTINUE WITHOUT LOGGING IN (OFFLINE ONLY)
          </button>
        </div>
      </div>
    );
  }

  // Mandatory Onboarding for all (even guests)
  if (needsOnboarding) {
    return <Onboarding />;
  }

  if (isLocked && shopSettings.pinEnabled) {
    return (
      <PINScreen 
        settings={shopSettings} 
        onSuccess={() => setIsLocked(false)} 
        mode="unlock"
      />
    );
  }


  // --- Derived Data and Logic ---

  const t = translations[shopSettings.language as Language || 'en'];

  // Handle navigations
  const navigateTo = (path: string) => {
    setActiveTab(path as any);
  };

  // Notifications logic: Customers with balance > 0 and due date approaching or past
  const dueNotifications = customers.filter(c => {
    // Only notify if they owe us (positive balance) and have a due date
    if (c.balance <= 0 || !c.dueDate) return false;
    
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const dueDate = new Date(c.dueDate);
      if (isNaN(dueDate.getTime())) return false; // Invalid date
      
      dueDate.setHours(0, 0, 0, 0);
      
      const diffTime = dueDate.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      // Alert if overdue (diffDays < 0) OR due within 10 days
      return diffDays <= 10;
    } catch (e) {
      return false;
    }
  });

  // Notifications logic: Products with stock below threshold
  const lowStockNotifications = products.filter(p => {
    return p.stock <= (p.lowStockThreshold || 5);
  });

  const totalNotifications = dueNotifications.length + lowStockNotifications.length;

  const handleSignOut = async () => {
    try {
      localStorage.removeItem('dukan_has_migrated');
      localStorage.removeItem('dukan_products');
      localStorage.removeItem('dukan_customers');
      localStorage.removeItem('dukan_transactions');
      localStorage.removeItem('dukan_settings');
      await signOut(auth);
      window.location.reload();
    } catch (error) {
      console.error("Sign out error:", error);
    }
  };

  const navigation = [
    { 
      id: 'dashboard', 
      label: t.dashboard, 
      labelUr: 'Home', 
      icon: <LayoutDashboard size={20} /> 
    },
    { 
      id: 'customers', 
      label: t.customers, 
      labelUr: 'Customers', 
      icon: <Users size={20} /> 
    },
    { 
      id: 'pos', 
      label: t.pos, 
      labelUr: 'POS', 
      icon: <ShoppingCart size={20} /> 
    },
    { 
      id: 'inventory', 
      label: t.inventory, 
      labelUr: 'Stock', 
      icon: <Package size={20} /> 
    },
    { 
      id: 'reports', 
      label: t.reports, 
      labelUr: 'Reports', 
      icon: <BarChart3 size={20} /> 
    },
    { 
      id: 'settings', 
      label: t.settings_title, 
      labelUr: 'Settings', 
      icon: <SettingsIcon size={20} /> 
    },
  ];

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <Dashboard 
          products={products} 
          customers={customers} 
          transactions={transactions} 
          expenses={expenses}
          settings={shopSettings}
          onNavigate={(tab) => {
            setTargetCustomerId(null);
            setActiveTab(tab);
          }}
        />;
      case 'customers':
        return <Customers 
          customers={customers} 
          setCustomers={setCustomers} 
          transactions={transactions}
          setTransactions={setTransactions}
          settings={shopSettings}
          setIsNavHidden={setIsNavHidden}
          initialCustomerId={targetCustomerId}
        />;
      case 'inventory':
        return <Inventory 
          products={products} 
          setProducts={() => {}} 
          settings={shopSettings}
        />;
      case 'pos':
        return <POS 
          products={products} 
          setProducts={() => {}}
          customers={customers} 
          setCustomers={() => {}}
          setTransactions={() => {}} 
          settings={shopSettings}
          onComplete={() => setActiveTab('dashboard')}
        />;
      case 'reports':
        return <Reports 
          products={products}
          customers={customers}
          transactions={transactions} 
          expenses={expenses}
          settings={shopSettings}
          onNavigate={(tab) => setActiveTab(tab)}
        />;
      case 'expenses':
        return <Expenses 
          expenses={expenses}
          settings={shopSettings}
        />;
      case 'settings':
        return <Settings 
          settings={shopSettings} 
          setSettings={(s) => {
            setShopSettings(s);
            FirestoreService.saveSettings(s);
          }} 
        />;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col md:flex-row font-sans transition-colors duration-300">
      {/* Offline Status Pill */}
      {!isOnline && (
        <div className="fixed top-2 left-1/2 -translate-x-1/2 z-[1000] px-4 py-1.5 bg-rose-600 text-white rounded-full text-[10px] font-black uppercase tracking-widest shadow-lg flex items-center gap-2 animate-pulse">
          <WifiOff size={12} />
          {t.offline || 'Offline'}
        </div>
      )}

      {/* Sidebar Drawer (Used for both mobile and desktop) */}
      <AnimatePresence>
        {isSidebarOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setIsSidebarOpen(false)}
              className="fixed inset-0 bg-black/60 z-40"
            />
            <motion.aside 
              initial={{ x: "-100%" }} animate={{ x: 0 }} exit={{ x: "-100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="fixed top-0 left-0 bottom-0 w-72 bg-emerald-900 text-white z-50 flex flex-col"
            >
              <div className="p-6 flex justify-between items-center">
                <div>
                  <h1 className="text-2xl font-bold tracking-tight">Dukaan<span className="text-emerald-400"> Pro</span></h1>
                  <p className="text-[10px] text-emerald-300 opacity-80 uppercase tracking-widest mt-1 font-bold">Come to Dukaan pro and become digital</p>
                </div>
                <button onClick={() => setIsSidebarOpen(false)} className="p-2 bg-emerald-800 rounded-xl"><X size={20}/></button>
              </div>
              
              <nav className="flex-1 px-4 py-4 space-y-2 overflow-y-auto">
                {navigation.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => { 
                      setActiveTab(item.id as any); 
                      setIsSidebarOpen(false); 
                      if (item.id === 'dashboard') setIsNavHidden(false); 
                    }}
                    className={cn(
                      "w-full flex items-center space-x-3 p-4 rounded-2xl transition-all font-bold text-sm",
                      activeTab === item.id 
                        ? "bg-emerald-800 text-white shadow-xl shadow-black/20" 
                        : "text-emerald-300 hover:bg-emerald-800"
                    )}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </button>
                ))}
                
                <div className="pt-8 mt-8 border-t border-emerald-800 space-y-2">
                  <button
                    onClick={() => window.open('https://wa.me/923211088723?text=Assalam-o-Alaikum!%20I%20need%20help%20with%20Dukaan%20Pro', '_blank')}
                    className="w-full flex items-center gap-3 p-4 rounded-2xl transition-all hover:bg-emerald-800 group"
                  >
                    <div className="bg-emerald-600 text-white p-2 rounded-xl group-hover:scale-110 transition-transform">
                      <MessageCircle size={20}/>
                    </div>
                    <div className="text-left">
                      <h3 className="font-bold text-white text-sm">Developer Support</h3>
                      <p className="text-[10px] text-emerald-300 font-medium">Contact for bugs or custom features</p>
                    </div>
                  </button>
                  <button
                    onClick={() => {
                      if (navigator.share) {
                        navigator.share({
                          title: 'Dukaan Pro',
                          url: 'https://ais-pre-ksuvaniosyfjqu7guwziey-604133282907.asia-southeast1.run.app/'
                        }).catch(console.error);
                      } else {
                        alert('Share not supported on this browser');
                      }
                    }}
                    className="w-full flex items-center space-x-3 p-4 rounded-2xl transition-all font-bold text-sm text-emerald-300 hover:bg-emerald-800"
                  >
                    <Share2 size={20} />
                    <span>Share with friends</span>
                  </button>
                  <button 
                    onClick={() => setSignOutConfirm(true)}
                    className="w-full flex items-center space-x-3 p-4 rounded-2xl transition-all font-bold text-sm text-amber-200 hover:bg-emerald-800"
                  >
                    <LogOut size={20} />
                    <span>Sign Out</span>
                  </button>
                </div>
              </nav>
            </motion.aside>
          </>
        )}
      </AnimatePresence>


      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-screen w-full bg-slate-50 dark:bg-slate-950 relative overflow-hidden">
        {/* Top Header - Responsive */}
        <header className="h-16 md:h-20 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-4 md:px-8 shrink-0 z-20 sticky top-0 md:bg-white/80 dark:md:bg-slate-900/80 md:backdrop-blur-md">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => {
                console.log('Menu button clicked, toggling sidebar');
                setIsSidebarOpen(prev => !prev);
              }}
              className="p-2 text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 rounded-lg active:scale-95 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
            >
              {shopSettings.logoUrl ? (
                <img src={shopSettings.logoUrl} alt="Logo" className="w-12 h-12 md:w-14 md:h-14 object-contain rounded-xl shadow-lg border-2 border-white/10" />
              ) : (
                <Menu size={32} />
              )}
            </button>
            <div>
              <h2 className="text-lg md:text-xl font-black text-slate-900 dark:text-white leading-tight">
                {navigation.find(n => n.id === activeTab)?.label}
              </h2>
              <div className="flex items-center gap-2 mt-0.5">
                <p className="text-[10px] md:text-xs text-slate-500 font-medium hidden sm:block">
                  {new Date().toLocaleDateString('en-PK', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
                
                {/* Network Status Badge */}
                <div className={cn(
                  "flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase transition-all shadow-md",
                  isOnline 
                    ? (isSyncing ? "bg-blue-600 text-white animate-pulse" : "bg-emerald-600 text-white") 
                    : "bg-rose-600 text-white"
                )}>
                  {isOnline ? (
                    isSyncing ? (
                      <>
                        <RefreshCw size={12} className="animate-spin" />
                        <span>Syncing...</span>
                      </>
                    ) : (
                      <>
                        <Wifi size={12} />
                        <span>Online</span>
                      </>
                    )
                  ) : (
                    <>
                      <WifiOff size={12} />
                      <span>Offline</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-2 md:gap-4">
            {user && shopSettings.pinEnabled && (
              <button 
                onClick={() => setIsLocked(true)}
                className="p-2 text-slate-400 bg-slate-100 rounded-xl hover:bg-indigo-50 hover:text-indigo-600 transition-all active:scale-95"
                title="Lock App"
              >
                <Lock size={18} />
              </button>
            )}
            
            {activeTab !== 'pos' && (
              <button 
                onClick={() => setActiveTab('pos')}
                className="bg-emerald-600 text-white px-4 md:px-6 py-2 rounded-xl text-xs md:text-sm font-black shadow-lg shadow-emerald-200 hover:bg-emerald-700 active:scale-95 transition-all flex items-center gap-2"
              >
                <Plus size={16} />
                <span className="hidden sm:inline">New Sale</span>
                <span className="sm:hidden">Sale</span>
              </button>
            )}
            
            <div className="relative">
              <button 
                onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
                className={cn(
                  "p-2 rounded-xl transition-all relative active:scale-95",
                  totalNotifications > 0 ? "bg-rose-100 text-rose-600" : "bg-slate-100 text-slate-500"
                )}
              >
                <div className="relative">
                  <span className="text-lg">🔔</span>
                  {totalNotifications > 0 && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-500 text-white text-[8px] font-black flex items-center justify-center rounded-full border-2 border-white animate-pulse">
                      {totalNotifications}
                    </span>
                  )}
                </div>
              </button>

              <AnimatePresence>
                {isNotificationsOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setIsNotificationsOpen(false)} />
                    <motion.div 
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      className="absolute right-0 mt-3 w-80 bg-white rounded-2xl shadow-2xl border border-slate-200 z-50 overflow-hidden"
                    >
                      <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                        <h3 className="font-black text-xs uppercase tracking-widest text-slate-900">🔔 Notifications</h3>
                      </div>
                      <div className="max-h-[300px] overflow-y-auto">
                        {totalNotifications === 0 ? (
                          <div className="p-8 text-center">
                            <p className="text-slate-400 text-xs font-bold">No new notifications.</p>
                          </div>
                        ) : (
                          <div className="divide-y divide-slate-100">
                            {/* Low Stock Alerts */}
                            {lowStockNotifications.map(p => (
                              <button 
                                key={p.id}
                                onClick={() => {
                                  setActiveTab('inventory');
                                  setIsNotificationsOpen(false);
                                }}
                                className="w-full p-4 flex items-center gap-3 hover:bg-rose-50 transition-colors text-left"
                              >
                                <div className="w-8 h-8 bg-rose-100 text-rose-600 rounded-lg flex items-center justify-center shrink-0">
                                  <Package size={16} />
                                </div>
                                <div>
                                  <p className="text-xs font-black text-slate-900 uppercase">{p.name}</p>
                                  <p className="text-[10px] text-rose-600 font-bold">
                                    Low Stock: {p.stock} remaining
                                  </p>
                                </div>
                              </button>
                            ))}
                            {/* Due Payments Alerts */}
                            {dueNotifications.map(c => (
                              <button 
                                key={c.id}
                                onClick={() => {
                                  setTargetCustomerId(c.id);
                                  setActiveTab('customers');
                                  setIsNotificationsOpen(false);
                                }}
                                className="w-full p-4 flex items-start gap-3 hover:bg-amber-50 transition-colors text-left"
                              >
                                <div className="w-8 h-8 bg-amber-100 text-amber-600 rounded-lg flex items-center justify-center shrink-0">
                                  <ArrowUpRight size={16} />
                                </div>
                                <div>
                                  <p className="text-xs font-black text-slate-900 uppercase">{c.name}</p>
                                  <p className="text-[10px] text-slate-500 font-bold mb-1">
                                    Balance: <span className="text-amber-600">{shopSettings.currency} {c.balance.toLocaleString()}</span>
                                  </p>
                                  {(() => {
                                    const diff = Math.ceil((new Date(c.dueDate!).getTime() - new Date().setHours(0,0,0,0)) / (1000 * 60 * 60 * 24));
                                    const isOverdue = diff < 0;
                                    return (
                                      <p className={cn(
                                        "text-[9px] font-black uppercase px-1.5 py-0.5 rounded inline-block",
                                        isOverdue ? "bg-amber-100 text-amber-600" : "bg-emerald-50 text-emerald-600"
                                      )}>
                                        {isOverdue ? `Overdue: ${Math.abs(diff)} days` : `Due: ${new Date(c.dueDate!).toLocaleDateString('en-PK')}`}
                                      </p>
                                    );
                                  })()}
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
          </div>
        </header>

        {/* Scrollable Content Area */}
        <main className="flex-1 overflow-y-auto p-4 md:p-8 pb-32">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
              {renderContent()}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* Bottom Navigation */}
      <nav className={cn(
        "fixed bottom-0 left-0 right-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border-t border-slate-200 dark:border-slate-800 px-2 py-3 pb-[env(safe-area-inset-bottom,12px)] flex justify-around items-center z-[100] shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.1)] transition-transform duration-300",
        isNavHidden && "translate-y-full opacity-0 pointer-events-none"
      )}>
        <NavItem active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} icon={<LayoutDashboard size={22} />} label={t.home} />
        <NavItem active={activeTab === 'customers'} onClick={() => setActiveTab('customers')} icon={<Users size={22} />} label={t.customers} />
        <NavItem active={activeTab === 'pos'} onClick={() => setActiveTab('pos')} icon={<div className="bg-emerald-600 text-white p-3 rounded-2xl shadow-lg shadow-emerald-200 active:scale-90 transition-transform"><ShoppingCart size={22} /></div>} label={t.sale} isCenter />
        <NavItem active={activeTab === 'inventory'} onClick={() => setActiveTab('inventory')} icon={<Package size={22} />} label={t.stock} />
        <NavItem active={activeTab === 'reports'} onClick={() => setActiveTab('reports')} icon={<BarChart3 size={22} />} label={t.report} />
      </nav>

      {/* Double Back Exit Toast */}
      <AnimatePresence>
        {showExitToast && (
          <motion.div 
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[200] px-6 py-3 bg-slate-900/90 backdrop-blur-md text-white rounded-2xl text-xs font-bold shadow-2xl flex items-center gap-3 border border-slate-700"
          >
            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
            {shopSettings.language === 'ur' ? 'Band karne ke liye dubara back dabayein' : 'Press back again to exit'}
          </motion.div>
        )}
      </AnimatePresence>

      <ConfirmModal
        isOpen={signOutConfirm}
        title="Sign Out"
        message="Are you sure you want to sign out? Your unsynced local changes might be lost."
        confirmLabel="Sign Out"
        onConfirm={async () => {
          setSignOutConfirm(false);
          await handleSignOut();
        }}
        onCancel={() => setSignOutConfirm(false)}
      />

      {/* Locked screen fully disabled for testing */}
    </div>
  );
}

function NavItem({ active, onClick, icon, label, isCenter = false }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string, isCenter?: boolean }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "flex flex-col items-center justify-center relative",
        isCenter ? "w-16" : "w-auto min-w-[60px]",
        active ? "text-emerald-600 font-bold" : "text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300",
        "transition-colors duration-200"
      )}
    >
      <div className={cn("mb-1 flex items-center justify-center", isCenter && "h-8")}>{icon}</div>
      <span className={cn("text-[9px] uppercase tracking-wider", isCenter && "mt-1.5", active ? "font-black" : "font-medium text-slate-400")}>{label}</span>
      {active && !isCenter && <motion.div layoutId="nav-active" className="absolute -bottom-1 w-1.5 h-1.5 bg-emerald-600 rounded-full" />}
    </button>
  );
}
