import React, { useState, useRef } from 'react';
import Papa from 'papaparse';
import { ShopSettings } from '../types';
import { Store, Phone, Languages, RefreshCcw, Lock, Shield, Moon, Sun, Image as ImageIcon, FileText, Cloud, LogIn, LogOut, Upload, Mail } from 'lucide-react';
import { ConfirmModal } from './ConfirmModal';
import { PINScreen } from './PINScreen';
import { cn } from '../lib/utils';
import { auth, signInWithPopup, signInWithRedirect, getGoogleProvider, signOut } from '../lib/firebase';
import { FirestoreService } from '../lib/firestoreService';

import { translations, Language } from '../lib/translations';

interface SettingsProps {
  settings: ShopSettings;
  setSettings: React.Dispatch<React.SetStateAction<ShopSettings>>;
}

export function Settings({ settings, setSettings }: SettingsProps) {
  const [isPINSetupOpen, setIsPINSetupOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  const t = translations[settings.language as Language || 'en'];

  const handleGoogleLogin = async () => {
    setIsSyncing(true);
    try {
      const isInIframe = window.self !== window.top;
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      const provider = new getGoogleProvider();
      
      if (isMobile || isInIframe) {
        console.log("Using Redirect Login for mobile/iframe compatibility...");
        await signInWithRedirect(auth, provider);
        return;
      }

      const result = await signInWithPopup(auth, provider).catch(async err => {
        console.error("Popup login error:", err);
        
        let message = '';
        const domain = window.location.hostname;

        if (err.code === 'auth/unauthorized-domain' || err.message?.includes('unauthorized domain')) {
          const devDomain = "ais-dev-ksuvaniosyfjqu7guwziey-604133282907.asia-southeast1.run.app";
          const preDomain = "ais-pre-ksuvaniosyfjqu7guwziey-604133282907.asia-southeast1.run.app";
          message = `DOMAIN NOT AUTHORIZED: You must add BOTH of these domains to your Firebase Console:\n\n1. ${devDomain}\n2. ${preDomain}\n\nGo to Firebase > Auth > Settings > Authorized Domains.`;
          alert(message);
          return { user: null };
        } 
        
        if (err.code === 'auth/popup-blocked' || err.message?.includes('403') || err.code === 'auth/internal-error') {
          console.log("Attempting Direct Login (Redirect) fallback...");
          alert("Opening Direct Login method for compatibility...");
          await signInWithRedirect(auth, provider);
          return { user: null };
        }

        if (err.code === 'auth/popup-closed-by-user') {
           return { user: null };
        }

        message = `Login failed: ${err.message || 'Unknown error'}. Ensure "${domain}" is whitelisted in Firebase.`;
        if (message) alert(message);
        return { user: null };
      });

      if (result?.user) {
        await FirestoreService.syncLocalToCloud(result.user.uid);
        alert("Google ID connected! Backup/Sync is now active.");
      }
    } catch (error) {
      console.error("Login outer catch", error);
    } finally {
      setIsSyncing(false);
    }
  };

  const [signOutConfirm, setSignOutConfirm] = React.useState(false);

  const handleLogout = async () => {
    // We handle this via the ConfirmModal confirmation dialog at the end
  };

  const executeLogout = async () => {
    try {
      localStorage.removeItem('dukan_has_migrated');
      localStorage.removeItem('dukan_products');
      localStorage.removeItem('dukan_customers');
      localStorage.removeItem('dukan_transactions');
      localStorage.removeItem('dukan_settings');
      await signOut(auth);
      window.location.reload();
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  const compressLogo = (base64Str: string): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.src = base64Str;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        // Logo needs higher detail: 1200px width
        const MAX_WIDTH = 1200;
        let width = img.width;
        let height = img.height;

        if (width > MAX_WIDTH) {
          height *= MAX_WIDTH / width;
          width = MAX_WIDTH;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(base64Str); return; }
        ctx.drawImage(img, 0, 0, width, height);
        // 0.9 quality for Logo ensures sharpness but keeps it well under 500KB
        resolve(canvas.toDataURL('image/jpeg', 0.9));
      };
      img.onerror = () => resolve(base64Str);
    });
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = async () => {
        try {
          const compressed = await compressLogo(reader.result as string);
          setSettings({ ...settings, logoUrl: compressed });
        } catch (err) {
          console.error("Logo upload compression failed", err);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const [isImporting, setIsImporting] = useState(false);

  const handleExport = async () => {
    try {
      setIsImporting(true);
      const data = {
        products: await FirestoreService.getProducts(),
        customers: await FirestoreService.getCustomers(),
        transactions: await FirestoreService.getTransactions(),
        expenses: await FirestoreService.getExpenses(),
        settings: await FirestoreService.getSettings()
      };
      
      // Flatten into a single array for CSV
      const flatData = [
        ...data.products.map(p => ({ _entityType: 'product', ...p })),
        ...data.customers.map(c => ({ _entityType: 'customer', ...c })),
        ...data.transactions.map(t => ({ _entityType: 'transaction', ...t, items: JSON.stringify(t.items) })),
        ...data.expenses.map(e => ({ _entityType: 'expense', ...e })),
        ...(data.settings ? [{ _entityType: 'settings', ...data.settings }] : [])
      ];
      
      const allKeys = Array.from(new Set(flatData.flatMap(Object.keys)));
      const normalizedData = flatData.map(row => {
        const newRow: any = {};
        allKeys.forEach(k => {
          newRow[k] = (row as any)[k] === undefined ? '' : (row as any)[k];
        });
        return newRow;
      });
      
      const csv = Papa.unparse(normalizedData);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `dukan_backup_${new Date().toISOString()}.csv`;
      link.click();
    } catch (e) {
      console.error("Export failed", e);
      alert("Failed to export data");
    } finally {
      setIsImporting(false);
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const userId = auth.currentUser?.uid;
    if (!userId) {
      alert("User not authenticated.");
      return;
    }

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          setIsImporting(true);
          const resultsData = results.data as any[];
          
          for (const row of resultsData) {
            const { _entityType, type, ...restData } = row;
            // Detect entity type
            let entity = _entityType;
            if (!entity) {
                if (['product', 'customer', 'expense', 'settings'].includes(type)) {
                    entity = type;
                } else if (['sale', 'credit_given', 'payment_received', 'payment', 'return', 'credit'].includes(type)) {
                    entity = 'transaction';
                }
            }
            
            // Reconstruct data, because `type` belongs to transaction
            const data = { ...restData, type };
            
            if (entity === 'product') {
              const stock = parseFloat(data.stock);
              const price = parseFloat(data.price);
              const minStock = parseFloat(data.minStock);
              const product: any = {
                id: data.id,
                ownerId: userId,
                name: data.name || 'Untitled',
                price: isNaN(price) ? 0 : price,
                stock: isNaN(stock) ? 0 : stock,
              };
              if (data.category) product.category = data.category;
              if (data.barcode) product.barcode = data.barcode;
              if (data.image) product.image = data.image;
              if (data.unit) product.unit = data.unit;
              if (!isNaN(minStock)) product.minStock = minStock;
              
              await FirestoreService.saveProduct(product);
            } else if (entity === 'customer') {
              const balance = parseFloat(data.balance);
              const customer: any = {
                id: data.id,
                ownerId: userId,
                name: data.name || 'Unnamed',
                balance: isNaN(balance) ? 0 : balance,
              };
              if (data.phone) customer.phone = data.phone;
              if (data.updatedAt) customer.updatedAt = data.updatedAt;
              if (data.lastTransactionAt) customer.lastTransactionAt = data.lastTransactionAt;
              
              await FirestoreService.saveCustomer(customer);
            } else if (entity === 'transaction') {
              const amount = parseFloat(data.amount);
              const transaction: any = {
                id: data.id,
                ownerId: userId,
                type: data.type || 'sale',
                amount: isNaN(amount) ? 0 : amount,
                createdAt: data.createdAt || new Date().toISOString(),
              };
              if (data.description) transaction.description = data.description;
              if (data.customerId) transaction.customerId = data.customerId;
              if (data.paymentMethod) transaction.paymentMethod = data.paymentMethod;
              if (data.items) {
                try { transaction.items = JSON.parse(data.items); } catch { transaction.items = []; }
              }
              if (data.isDeleted === 'true' || data.isDeleted === true) transaction.isDeleted = true;
              if (data.deletedAt) transaction.deletedAt = data.deletedAt;
              
              await FirestoreService.saveTransaction(transaction);
            } else if (entity === 'expense') {
              const amount = parseFloat(data.amount);
              const expense: any = {
                id: data.id,
                ownerId: userId,
                amount: isNaN(amount) ? 0 : amount,
                description: data.description || '',
                createdAt: data.createdAt || new Date().toISOString(),
              };
              if (data.category && data.category !== '') expense.category = data.category;
              if (data.evidenceUrl && data.evidenceUrl !== '') expense.evidenceUrl = data.evidenceUrl;
              
              await FirestoreService.saveExpense(expense);
            } else if (entity === 'settings') {
              const settingsData: any = { ...settings, ownerId: userId, name: data.name || settings.name || 'Shop' };
              if (data.phone !== undefined && data.phone !== '') settingsData.phone = data.phone;
              if (data.address !== undefined) settingsData.address = data.address;
              if (data.currency !== undefined && data.currency !== '') settingsData.currency = data.currency;
              if (data.language !== undefined && data.language !== '') settingsData.language = data.language;
              if (data.logoUrl !== undefined && data.logoUrl !== '') settingsData.logoUrl = data.logoUrl;
              if (data.ownerEmail !== undefined) settingsData.ownerEmail = data.ownerEmail;
              await FirestoreService.saveSettings(settingsData);
            }
          }
          
          // Recalibrate Customer Balances based on all their transactions
          const allCustomers = await FirestoreService.getCustomers();
          const allTransactions = await FirestoreService.getTransactions();
          
          for (const customer of allCustomers) {
            const customerTransactions = allTransactions.filter(t => t.customerId === customer.id && !t.isDeleted);
            let calculatedBalance = 0;
            for (const t of customerTransactions) {
              if (t.type === 'payment_received' || t.type === 'payment' || t.type === 'return') {
                calculatedBalance -= t.amount;
              } else if (t.type === 'credit_given' || t.type === 'sale' || t.type === 'credit') {
                calculatedBalance += t.amount;
              }
            }
            if (customer.balance !== calculatedBalance) {
                await FirestoreService.updateCustomer(customer.id, { balance: calculatedBalance });
            }
          }

          alert("Import successful! Data has been merged.");
          window.location.reload();
        } catch (e) {
          console.error("Import failed", e);
          alert("Failed to import data");
        } finally {
          setIsImporting(false);
          if (importInputRef.current) importInputRef.current.value = '';
        }
      }
    });
  };

  const handlePINSetupComplete = (pinHash: string, securityQuestion: string, securityAnswerHash: string) => {
    setSettings({
      ...settings,
      pinEnabled: true,
      pinHash,
      securityQuestion,
      securityAnswerHash
    });
    setIsPINSetupOpen(false);
  };

  const togglePIN = () => {
    if (settings.pinEnabled) {
      if (confirm('Are you sure you want to disable PIN security? This makes your app less secure.')) {
        setSettings({ ...settings, pinEnabled: false });
      }
    } else {
      setIsPINSetupOpen(true);
    }
  };

  const toggleTheme = () => {
    setSettings({ ...settings, theme: settings.theme === 'dark' ? 'light' : 'dark' });
  };

  return (
    <div className="space-y-6 pb-20">
      <h2 className="text-2xl font-black text-slate-900 dark:text-white">{t.settings_title} <span className="text-sm font-medium text-slate-400 block uppercase tracking-tighter">Shop ki Information</span></h2>

      {/* Cloud Backup / Google Login Section */}
      <section className="bg-emerald-50 dark:bg-emerald-900/10 rounded-3xl p-6 border border-emerald-100 dark:border-emerald-900/30 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
             <div className="bg-emerald-600 text-white p-2 rounded-xl"><Cloud size={20}/></div>
             <div>
               <h3 className="font-bold text-emerald-900 dark:text-emerald-400">Google Backup / Cloud Sync</h3>
               <p className="text-[10px] text-emerald-700 dark:text-emerald-500 font-medium">
                 {auth.currentUser ? `Syncing to ${auth.currentUser.email}` : "Connect your Google ID to backup your dukaan data."}
               </p>
             </div>
          </div>
          {auth.currentUser ? (
            <button 
              onClick={() => setSignOutConfirm(true)}
              className="bg-white/50 dark:bg-emerald-900/20 text-amber-600 p-2 rounded-xl hover:bg-amber-50 transition-colors"
            >
              <LogOut size={20} />
            </button>
          ) : (
            <button 
              onClick={handleGoogleLogin}
              disabled={isSyncing}
              className="bg-emerald-600 text-white px-4 py-2 rounded-xl text-xs font-black shadow-lg shadow-emerald-200 active:scale-95 transition-all flex items-center gap-2"
            >
              {isSyncing ? <RefreshCcw size={16} className="animate-spin" /> : <LogIn size={16} />}
              CONNECT GOOGLE ID
            </button>
          )}
        </div>
      </section>

      {/* Theme Section */}
      <section className="bg-white dark:bg-slate-800 rounded-3xl p-6 border border-slate-100 dark:border-slate-700 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
             <div className="bg-slate-900 dark:bg-white text-white dark:text-slate-900 p-2 rounded-xl">
               {settings.theme === 'dark' ? <Moon size={20}/> : <Sun size={20}/>}
             </div>
             <div>
               <h3 className="font-bold text-slate-900 dark:text-white">{t.appearance} / {t.theme}</h3>
               <p className="text-[10px] text-slate-400 font-medium">Switch between light and dark mode</p>
             </div>
          </div>
          <button 
            onClick={toggleTheme}
            className={cn(
              "w-12 h-6 rounded-full transition-all relative",
              settings.theme === 'dark' ? 'bg-indigo-600' : 'bg-slate-200'
            )}
          >
            <div className={cn(
              "absolute top-1 w-4 h-4 rounded-full bg-white transition-all",
              settings.theme === 'dark' ? 'right-1' : 'left-1'
            )} />
          </button>
        </div>
      </section>

      {/* App Security Section */}
      <section className="bg-white dark:bg-slate-800 rounded-3xl p-6 border border-slate-100 dark:border-slate-700 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
             <div className="bg-indigo-600 text-white p-2 rounded-xl"><Lock size={20}/></div>
             <div>
               <h3 className="font-bold dark:text-white text-slate-900">{t.app_security}</h3>
               <p className="text-[10px] text-slate-400 font-medium">Protect your data with 4-digit PIN</p>
             </div>
          </div>
          <button 
            onClick={togglePIN}
            className={`w-12 h-6 rounded-full transition-all relative ${settings.pinEnabled ? 'bg-emerald-500' : 'bg-slate-200'}`}
          >
            <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${settings.pinEnabled ? 'right-1' : 'left-1'}`} />
          </button>
        </div>

        {settings.pinEnabled && (
          <div className="pt-2 border-t border-slate-50 dark:border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield size={14} className="text-emerald-500" />
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">PIN is Active</span>
            </div>
            <button 
              onClick={() => setIsPINSetupOpen(true)}
              className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest hover:bg-emerald-50 dark:hover:bg-emerald-900/20 px-3 py-1.5 rounded-lg"
            >
              Change PIN
            </button>
          </div>
        )}
      </section>

      {isPINSetupOpen && (
        <PINScreen 
          mode="setup"
          settings={settings}
          onSuccess={() => setIsPINSetupOpen(false)}
          onBack={() => setIsPINSetupOpen(false)}
          onSetupComplete={handlePINSetupComplete}
        />
      )}

      {/* Shop Profile */}
      <section className="bg-white dark:bg-slate-800 rounded-3xl p-6 border border-slate-100 dark:border-slate-700 shadow-sm space-y-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
             <div className="bg-slate-900 dark:bg-slate-700 text-white rounded-xl overflow-hidden flex items-center justify-center w-12 h-12 shadow-lg border border-slate-600/50">
               {settings.logoUrl ? (
                 <img src={settings.logoUrl} alt="Logo" className="w-full h-full object-contain p-1 bg-white" />
               ) : (
                 <Store size={24}/>
               )}
             </div>
             <h3 className="font-bold dark:text-white text-lg">{t.shop_profile}</h3>
          </div>
          <div className="flex gap-2">
             <input 
               type="file" 
               ref={fileInputRef} 
               className="hidden" 
               accept="image/*" 
               onChange={handleLogoUpload}
             />
             <button 
               onClick={() => fileInputRef.current?.click()}
               className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 active:scale-95 transition-all"
             >
               <Upload size={14}/> {settings.logoUrl ? "Change Logo" : "Upload Logo"}
             </button>
          </div>
        </div>

        {settings.logoUrl && (
          <div className="flex justify-center p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-dashed border-slate-200">
            <img src={settings.logoUrl} alt="Shop Logo" className="h-20 object-contain" />
          </div>
        )}
        
        <div className="space-y-4">
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Shop Name / Dukaan Ka Naam</label>
            <input 
              type="text" 
              className="w-full bg-slate-50 dark:bg-slate-700 border-none rounded-xl py-3 px-4 mt-1 text-sm font-bold dark:text-white focus:ring-2 focus:ring-slate-200 dark:focus:ring-slate-600"
              value={settings.name}
              onChange={(e) => setSettings({...settings, name: e.target.value})}
            />
          </div>

          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Phone Number / Mobile Number</label>
            <input 
              type="tel" 
              className="w-full bg-slate-50 dark:bg-slate-700 border-none rounded-xl py-3 px-4 mt-1 text-sm font-bold dark:text-white focus:ring-2 focus:ring-slate-200 dark:focus:ring-slate-600"
              value={settings.phone}
              onChange={(e) => setSettings({...settings, phone: e.target.value})}
            />
          </div>

          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Shop Address / Dukaan Ka Pata</label>
            <input 
              type="text" 
              className="w-full bg-slate-50 dark:bg-slate-700 border-none rounded-xl py-3 px-4 mt-1 text-sm font-bold dark:text-white focus:ring-2 focus:ring-slate-200 dark:focus:ring-slate-600"
              placeholder="e.g. Shop #12, Market Name, City"
              value={settings.address || ''}
              onChange={(e) => setSettings({...settings, address: e.target.value})}
            />
          </div>

          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase ml-1 flex items-center gap-1"><FileText size={10}/> Receipt Footer Message</label>
            <textarea 
              rows={2}
              className="w-full bg-slate-50 dark:bg-slate-700 border-none rounded-xl py-3 px-4 mt-1 text-xs dark:text-white focus:ring-2 focus:ring-slate-200 dark:focus:ring-slate-600 resize-none"
              placeholder='Example: "Visit again!" or your Address'
              value={settings.receiptFooter || ''}
              onChange={(e) => setSettings({...settings, receiptFooter: e.target.value})}
            />
          </div>
        </div>
      </section>

      {/* App Prefs */}
      <section className="bg-white dark:bg-slate-800 rounded-3xl p-6 border border-slate-100 dark:border-slate-700 shadow-sm space-y-4">
        <div className="flex items-center gap-3 mb-2">
           <div className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 p-2 rounded-xl"><Languages size={20}/></div>
           <h3 className="font-bold dark:text-white">{t.language_currency}</h3>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {['en', 'ur', 'roman'].map((lang) => (
            <button 
              key={lang}
              onClick={() => setSettings({...settings, language: lang as any})}
              className={cn(
                "py-3 rounded-xl border text-[10px] font-bold transition-all",
                settings.language === lang ? "bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-slate-900 dark:border-white shadow-lg" : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-400"
              )}
            >
              {lang === 'en' ? 'English' : lang === 'ur' ? 'اردو' : 'Roman'}
            </button>
          ))}
        </div>
      </section>

      <div className="pt-8 flex flex-col items-center gap-2">
        <div className="flex gap-4 w-full px-6">
           <button onClick={handleExport} className="flex-1 bg-emerald-600 text-white py-3 rounded-2xl font-black text-xs uppercase tracking-widest active:scale-95 transition-all shadow-lg shadow-emerald-200">Export</button>
           <button onClick={() => importInputRef.current?.click()} disabled={isImporting} className="flex-1 bg-slate-900 dark:bg-white text-white dark:text-slate-900 py-3 rounded-2xl font-black text-xs uppercase tracking-widest active:scale-95 transition-all shadow-lg shadow-slate-200 dark:shadow-slate-800 disabled:opacity-50 disabled:cursor-not-allowed">
             {isImporting ? 'Importing...' : 'Import'}
             <input type="file" ref={importInputRef} className="hidden" accept=".csv" onChange={handleImport} disabled={isImporting} />
           </button>
        </div>

        <ConfirmModal
          isOpen={signOutConfirm}
          title="Sign Out"
          message="Are you sure you want to sign out? Your unsynced local changes might be lost."
          confirmLabel="Sign Out"
          onConfirm={async () => {
            setSignOutConfirm(false);
            await executeLogout();
          }}
          onCancel={() => setSignOutConfirm(false)}
        />

        <div className="flex items-center gap-2 bg-rose-50 dark:bg-rose-900/10 px-4 py-2 rounded-full border border-rose-100 dark:border-rose-900/30">
          <span className="w-2 h-2 bg-rose-500 rounded-full animate-pulse" />
          <span className="text-[10px] font-black text-rose-600 dark:text-rose-400 uppercase tracking-widest">
            Beta Version
          </span>
        </div>
        <p className="text-[9px] text-slate-400 font-bold uppercase tracking-tighter text-center px-6">
          Exciting new updates and professional features are coming in the future.
          <br /> 
          <span className="opacity-60">Build 2026.05.12 • Stable Preview</span>
        </p>
      </div>
    </div>
  );
}


