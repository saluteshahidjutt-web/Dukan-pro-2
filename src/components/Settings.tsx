import React, { useState, useRef } from 'react';
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
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
  const [isPINSetupOpen, setIsPINSetupOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleLogout = async () => {
    if (confirm("Are you sure? Your data will not be backed up anymore.")) {
      await signOut(auth);
      window.location.reload();
    }
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 500000) {
        alert("Image too large. Please select under 500KB.");
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setSettings({ ...settings, logoUrl: reader.result as string });
      };
      reader.readAsDataURL(file);
    }
  };

  const resetData = () => {
    localStorage.clear();
    window.location.reload();
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
              onClick={handleLogout}
              className="bg-white/50 dark:bg-emerald-900/20 text-rose-600 p-2 rounded-xl hover:bg-rose-50 transition-colors"
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
      <section className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-100 dark:border-slate-800 shadow-sm space-y-4">
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
      <section className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-100 dark:border-slate-800 shadow-sm space-y-4">
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
      <section className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-100 dark:border-slate-800 shadow-sm space-y-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
             <div className="bg-slate-900 dark:bg-slate-800 text-white rounded-xl overflow-hidden flex items-center justify-center w-12 h-12 shadow-lg border border-slate-700/50">
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
              className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-xl py-3 px-4 mt-1 text-sm font-bold dark:text-white focus:ring-2 focus:ring-slate-200 dark:focus:ring-slate-700"
              value={settings.name}
              onChange={(e) => setSettings({...settings, name: e.target.value})}
            />
          </div>

          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Phone Number / Mobile Number</label>
            <input 
              type="tel" 
              className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-xl py-3 px-4 mt-1 text-sm font-bold dark:text-white focus:ring-2 focus:ring-slate-200 dark:focus:ring-slate-700"
              value={settings.phone}
              onChange={(e) => setSettings({...settings, phone: e.target.value})}
            />
          </div>

          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase ml-1 flex items-center gap-1"><FileText size={10}/> Receipt Footer Message</label>
            <textarea 
              rows={2}
              className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-xl py-3 px-4 mt-1 text-xs dark:text-white focus:ring-2 focus:ring-slate-200 dark:focus:ring-slate-700 resize-none"
              placeholder='Example: "Visit again!" or your Address'
              value={settings.receiptFooter || ''}
              onChange={(e) => setSettings({...settings, receiptFooter: e.target.value})}
            />
          </div>
        </div>
      </section>

      {/* App Prefs */}
      <section className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-100 dark:border-slate-800 shadow-sm space-y-4">
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
                settings.language === lang ? "bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-slate-900 dark:border-white shadow-lg" : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-400"
              )}
            >
              {lang === 'en' ? 'English' : lang === 'ur' ? 'اردو' : 'Roman'}
            </button>
          ))}
        </div>
      </section>

      <section className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-100 dark:border-slate-800 shadow-sm space-y-4">
        <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">{t.reset_app} - Only use if needed.</p>
        <button 
          onClick={() => setIsResetConfirmOpen(true)}
          className="w-full py-3 bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 rounded-xl font-bold text-xs uppercase tracking-widest active:scale-95 transition-all"
        >
          {t.clear_data}
        </button>
      </section>

      <ConfirmModal 
        isOpen={isResetConfirmOpen}
        isLoading={false}
        title={t.clear_data}
        message={t.reset_warning}
        onConfirm={resetData}
        onCancel={() => setIsResetConfirmOpen(false)}
        confirmLabel="Reset Everything"
      />
    </div>
  );
}


