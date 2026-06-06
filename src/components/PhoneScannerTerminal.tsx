import React, { useState, useEffect, useRef } from 'react';
import { db, auth } from '../lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { FirestoreService } from '../lib/firestoreService';
import { BarcodeScanner, playBeep } from './BarcodeScanner';
import { Smartphone, Wifi, WifiOff, Volume2, VolumeX, ShieldCheck, Sun, Eye, Zap, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface PhoneScannerTerminalProps {
  shopId: string;
}

export function PhoneScannerTerminal({ shopId }: PhoneScannerTerminalProps) {
  const [pcStatus, setPcStatus] = useState<'idle' | 'active'>('idle');
  const [lastScanned, setLastScanned] = useState<string>('');
  const [scanCount, setScanCount] = useState<number>(0);
  const [isMuted, setIsMuted] = useState(false);
  const [wakeLockActive, setWakeLockActive] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [shopName, setShopName] = useState<string>('Dukaan Partner');
  const [isCameraActive, setIsCameraActive] = useState(true);
  const wakeLockRef = useRef<any>(null);

  // Sync real-time status of the shop PC and document
  useEffect(() => {
    const docRef = doc(db, 'scanner_sessions', shopId);
    const unsub = onSnapshot(docRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        if (data.pc_status) {
          setPcStatus(data.pc_status);
        }
      }
    });

    // Also fetch shop details to personalize the UI
    const settingsDoc = doc(db, 'settings', shopId);
    const fetchSettings = onSnapshot(settingsDoc, (sn) => {
      if (sn.exists()) {
        const data = sn.data();
        if (data.name) setShopName(data.name);
      }
    });

    return () => {
      unsub();
      fetchSettings();
    };
  }, [shopId]);

  // Request & Maintain Screen Wake Lock to keep phone screen ALWAYS on
  useEffect(() => {
    async function requestWakeLock() {
      if ('wakeLock' in navigator) {
        try {
          wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
          setWakeLockActive(true);
          console.log('Screen Wake Lock holds active!');
        } catch (err) {
          console.warn('Wake Lock request failed:', err);
        }
      }
    }

    requestWakeLock();

    // Re-verify on window focus/tab change
    const handleVisibilityChange = async () => {
      if (wakeLockRef.current !== null && document.visibilityState === 'visible') {
        requestWakeLock();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (wakeLockRef.current) {
        wakeLockRef.current.release().then(() => {
          wakeLockRef.current = null;
          setWakeLockActive(false);
        });
      }
    };
  }, []);

  const handleBarcodeScanned = async (barcode: string) => {
    const code = barcode.trim();
    if (!code || isSubmitting) return;

    try {
      setIsSubmitting(true);
      
      // Phone vibration feedback
      if ('vibrate' in navigator) {
        navigator.vibrate([100, 50, 100]);
      }

      // Local success sound
      if (!isMuted) {
        playBeep();
      }

      // Fire to Firestore immediately
      await FirestoreService.updateMobileBarcode(shopId, code);

      setLastScanned(code);
      setScanCount(prev => prev + 1);

      // Brief ripple animation freeze to avoid double-scans of exact same frame
      setTimeout(() => {
        setIsSubmitting(false);
      }, 1200);

    } catch (e) {
      console.error(e);
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between p-4 font-sans select-none overflow-hidden pb-[env(safe-area-inset-bottom,16px)]">
      {/* Top Header Panel */}
      <header className="bg-slate-900/60 border border-slate-800/80 rounded-[28px] p-4 flex items-center justify-between shadow-2xl backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center border border-emerald-500/20">
            <Smartphone size={20} className="animate-pulse" />
          </div>
          <div>
            <h1 className="text-sm font-black tracking-tight text-white uppercase">{shopName}</h1>
            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Mobile Laser Node</p>
          </div>
        </div>

        {/* Real-time Connection status indicator */}
        <div className="flex items-center gap-2">
          <AnimatePresence mode="wait">
            {pcStatus === 'active' ? (
              <motion.div 
                key="active" 
                initial={{ opacity: 0, scale: 0.8 }} 
                animate={{ opacity: 1, scale: 1 }} 
                exit={{ opacity: 0, scale: 0.8 }}
                className="bg-emerald-950/40 border border-emerald-500/20 text-emerald-400 text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-full flex items-center gap-1.5"
              >
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping shrink-0" />
                <span>PC Connected</span>
              </motion.div>
            ) : (
              <motion.div 
                key="idle" 
                initial={{ opacity: 0, scale: 0.8 }} 
                animate={{ opacity: 1, scale: 1 }} 
                exit={{ opacity: 0, scale: 0.8 }}
                className="bg-amber-950/40 border border-amber-500/20 text-amber-400 text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-full flex items-center gap-1.5 animate-pulse"
              >
                <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                <span>PC Idle / Offline</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </header>

      {/* Main Barcode Camera Container */}
      <div className="flex-1 my-4 flex flex-col rounded-[32px] overflow-hidden relative border border-slate-800 bg-black shadow-2xl">
        {isCameraActive ? (
          <div className="absolute inset-0 z-0">
            <BarcodeScanner 
              onScanSuccess={handleBarcodeScanned}
              onClose={() => setIsCameraActive(false)}
            />
          </div>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-slate-900/40">
            <button 
              onClick={() => setIsCameraActive(true)}
              className="px-6 py-4 bg-emerald-500 text-slate-950 font-black rounded-2xl flex items-center gap-2 shadow-2xl hover:bg-emerald-400 active:scale-95 transition-all uppercase tracking-widest text-xs"
            >
              <RefreshCw size={18} className="animate-spin" /> Activate Camera feed
            </button>
            <p className="text-[10px] text-slate-500 mt-4 font-bold tracking-wider max-w-xs leading-relaxed">
              Activate your smartphone camera to instantly stream high-performance laser scans as your hardware barcode gun.
            </p>
          </div>
        )}

        {/* Scan Status overlay banner */}
        {lastScanned && (
          <div className="absolute bottom-6 left-6 right-6 bg-slate-950/90 border border-slate-800 rounded-2xl p-4 z-40 flex items-center justify-between shadow-2xl backdrop-blur-md">
            <div>
              <p className="text-[9px] text-slate-500 font-black tracking-widest uppercase">Last Scanned Code</p>
              <p className="text-amber-400 font-mono font-black text-sm tracking-widest mt-0.5">{lastScanned}</p>
            </div>
            <div className="text-right">
              <p className="text-[9px] text-slate-500 font-black tracking-widest uppercase">PC Received</p>
              <p className="text-emerald-400 text-xs font-black uppercase mt-0.5 flex items-center gap-1 justify-end">
                <ShieldCheck size={14} /> Sent
              </p>
            </div>
          </div>
        )}

        {/* Sync ping feedback ripple */}
        {isSubmitting && (
          <div className="absolute inset-0 bg-emerald-500/10 border-4 border-emerald-500 z-50 flex items-center justify-center pointer-events-none animate-pulse">
            <div className="bg-emerald-500 text-slate-950 text-xs font-black px-6 py-3 rounded-full flex items-center gap-2 shadow-2xl uppercase tracking-widest">
              <span>Sending...</span>
            </div>
          </div>
        )}
      </div>

      {/* Footer Controls & Stats */}
      <footer className="bg-slate-900/60 border border-slate-800/80 rounded-[32px] p-4 shadow-2xl backdrop-blur-md space-y-3">
        {/* Connection status card info & stats */}
        <div className="flex items-center justify-between text-slate-400 text-xs px-2 font-black uppercase tracking-wider">
          <div className="flex items-center gap-1.5">
            <Sun size={14} className={wakeLockActive ? "text-emerald-400 animate-spin" : "text-slate-500"} />
            <span className="text-[10px] font-black uppercase">
              {wakeLockActive ? 'WAKELOCK ACTIVE (Screen On)' : 'Screensaver idle'}
            </span>
          </div>
          <div className="text-right text-[10px]">
            Total Scanned: <span className="text-emerald-400 font-mono text-xs">{scanCount}</span>
          </div>
        </div>

        {/* Utility Rails / Buttons */}
        <div className="grid grid-cols-2 gap-3.5">
          {/* Mute toggle button */}
          <button 
            onClick={() => setIsMuted(prev => !prev)}
            className={`py-3 rounded-2xl flex items-center justify-center gap-2 border font-black uppercase tracking-wider text-xs active:scale-[0.98] transition-all ${
              isMuted 
                ? 'bg-rose-950/20 border-rose-900/30 text-rose-400' 
                : 'bg-slate-800/40 border-slate-700/50 text-slate-300'
            }`}
          >
            {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
            <span>{isMuted ? 'Muted' : 'Beep Enabled'}</span>
          </button>

          {/* Test connection / trigger button */}
          <button 
            onClick={() => handleBarcodeScanned('88888888')} // Generates an instant test SKU match code!
            disabled={isSubmitting}
            className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 py-3 rounded-2xl flex items-center justify-center gap-2 font-black uppercase tracking-widest text-xs active:scale-[0.98] transition-all disabled:opacity-50"
          >
            <Zap size={15} />
            <span>Send Test ping</span>
          </button>
        </div>
      </footer>
    </div>
  );
}
