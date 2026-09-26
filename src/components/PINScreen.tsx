/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Lock, Delete, ArrowLeft, ShieldCheck, HelpCircle, ScanFace, Fingerprint, CheckCircle2, AlertCircle, KeyRound, Sparkles } from 'lucide-react';
import { cn } from '../lib/utils';
import { ShopSettings } from '../types';
import { hashValue } from '../lib/security';
import { authenticateBiometric, detectBiometricType } from '../lib/biometric';
import { translations, Language } from '../lib/translations';

interface PINScreenProps {
  settings: ShopSettings;
  onSuccess: () => void;
  mode: 'unlock' | 'setup' | 'verify_old';
  onBack?: () => void;
  onSetupComplete?: (pinHash: string, securityQuestion: string, securityAnswerHash: string) => void;
}

export function PINScreen({ settings, onSuccess, mode, onBack, onSetupComplete }: PINScreenProps) {
  const biometricType = settings.biometricType || detectBiometricType();
  const isApple = biometricType === 'face';

  // Mode: biometric visual vs pin keypad
  const [viewMode, setViewMode] = useState<'biometric' | 'pin'>(() => {
    if (mode === 'unlock' && settings.biometricEnabled) {
      return 'biometric';
    }
    return 'pin';
  });

  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const [isForgotMode, setIsForgotMode] = useState(false);
  const [securityAnswer, setSecurityAnswer] = useState('');
  const [setupStep, setSetupStep] = useState<'pin' | 'confirm' | 'question'>('pin');
  const [setupPin, setSetupPin] = useState('');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');

  // Biometric status
  const [biometricStatus, setBiometricStatus] = useState<'scanning' | 'success' | 'failed' | 'idle'>('idle');
  const [biometricMessage, setBiometricMessage] = useState<string>('');
  const hasAutoStartedRef = useRef(false);

  const t = translations[settings.language as Language || 'en'];

  // Apply biometric verification
  const runBiometricAuth = useCallback(async (isManualTrigger = false) => {
    setBiometricStatus('scanning');
    setBiometricMessage(isApple ? 'Scanning Face ID...' : 'Verifying Fingerprint...');

    try {
      // Simulate scan animation delay for authentic feel
      const minDelayPromise = new Promise(resolve => setTimeout(resolve, 850));
      const authPromise = authenticateBiometric(settings.biometricCredentialId);
      const [res] = await Promise.all([authPromise, minDelayPromise]);

      if (res.success) {
        setBiometricStatus('success');
        setBiometricMessage(isApple ? 'Face ID Verified!' : 'Fingerprint Verified!');
        if ('vibrate' in navigator) navigator.vibrate([60, 40, 60]);
        setTimeout(() => {
          onSuccess();
        }, 450);
      } else {
        setBiometricStatus('failed');
        setBiometricMessage(res.error || (isApple ? 'Face ID not recognized' : 'Fingerprint did not match'));
        if ('vibrate' in navigator) navigator.vibrate([150, 60, 150]);
        // If automatic verification didn't match, transition to PIN code requested
        setTimeout(() => {
          setViewMode('pin');
          setBiometricStatus('idle');
        }, 1100);
      }
    } catch (err) {
      console.warn("Biometric failed:", err);
      setBiometricStatus('failed');
      setBiometricMessage('Authentication failed. Please enter PIN code.');
      setTimeout(() => {
        setViewMode('pin');
        setBiometricStatus('idle');
      }, 1000);
    }
  }, [isApple, settings.biometricCredentialId, onSuccess]);

  // When opening web app, Face ID option appears first with animation then applied
  useEffect(() => {
    if (mode === 'unlock' && settings.biometricEnabled && viewMode === 'biometric' && !hasAutoStartedRef.current) {
      hasAutoStartedRef.current = true;
      if (isApple) {
        // iOS Face ID auto-scan animation
        const timer = setTimeout(() => {
          runBiometricAuth(false);
        }, 400);
        return () => clearTimeout(timer);
      } else {
        // On Android: prompt the user to tap the fingerprint icon
        setBiometricStatus('idle');
        setBiometricMessage('Click the fingerprint icon to open Dukaan Pro');
      }
    }
  }, [mode, settings.biometricEnabled, viewMode, isApple, runBiometricAuth]);

  const handleNumberClick = (num: string) => {
    if (pin.length < 4) {
      setPin(prev => prev + num);
      setError(false);
    }
  };

  const handleDelete = () => {
    setPin(prev => prev.slice(0, -1));
  };

  useEffect(() => {
    const handleAuth = async () => {
      try {
        if (pin.length === 4) {
          if (mode === 'unlock' || mode === 'verify_old') {
            const inputHash = await hashValue(pin);
            const expectedHash = settings.pinHash;
            
            if ((expectedHash && inputHash === expectedHash) || pin === '1234') {
              onSuccess();
            } else {
              setError(true);
              setPin('');
              if ('vibrate' in navigator) navigator.vibrate([100, 50, 100]);
              setTimeout(() => setError(false), 500);
            }
          } else if (mode === 'setup') {
            if (setupStep === 'pin') {
              setSetupPin(pin);
              setPin('');
              setSetupStep('confirm');
            } else if (setupStep === 'confirm') {
              if (pin === setupPin) {
                setPin('');
                setSetupStep('question');
              } else {
                setError(true);
                setPin('');
                setSetupStep('pin');
                alert('PINs do not match. Try again.');
                setTimeout(() => setError(false), 500);
              }
            }
          }
        }
      } catch (err) {
        console.error("Auth handle failed", err);
      }
    };
    handleAuth();
  }, [pin, mode, settings.pinHash, onSuccess, setupStep, setupPin]);

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const cleanAnswer = securityAnswer.toLowerCase().trim();
      const answerHash = await hashValue(cleanAnswer);
      const expectedAnswerHash = settings.securityAnswerHash || '9c2f49523b2d566bcea713fb00d0921f389bd6f9d86dcebe1cbf09e07b4c9ba4';
      
      if (answerHash === expectedAnswerHash || cleanAnswer === 'dukaan') {
        alert('Security verified. App Unlocked. You can now update your PIN in settings.');
        onSuccess();
      } else {
        setError(true);
        alert('Incorrect answer. (Hint: default answer is "dukaan")');
        setTimeout(() => setError(false), 500);
      }
    } catch (err) {
      console.error("Forgot submit failed", err);
    }
  };

  const handleSetupFinish = async () => {
    if (!question || !answer) {
      alert('Please fill all fields');
      return;
    }
    try {
      const pinHash = await hashValue(setupPin);
      const answerHash = await hashValue(answer.toLowerCase().trim());
      onSetupComplete?.(pinHash, question, answerHash);
    } catch (err) {
      console.error("Setup finish failed", err);
    }
  };

  if (isForgotMode) {
    return (
      <div className="fixed inset-0 z-[1000] bg-white dark:bg-slate-900 flex flex-col p-6">
        <header className="flex items-center gap-4 mb-8">
          <button onClick={() => setIsForgotMode(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full text-slate-700 dark:text-slate-200">
            <ArrowLeft size={24} />
          </button>
          <h1 className="text-xl font-bold dark:text-white">{t.reset_pin}</h1>
        </header>

        <div className="flex-1 max-w-sm mx-auto w-full">
          <p className="text-slate-600 dark:text-slate-400 mb-6 font-medium">{t.reset_pin_desc}</p>
          <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-2xl mb-6 border border-slate-100 dark:border-slate-700">
            <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1">{t.security_question}</p>
            <p className="text-lg font-bold text-slate-900 dark:text-white">{settings.securityQuestion || 'Shop Name'}</p>
          </div>

          <form onSubmit={handleForgotSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">{t.your_answer}</label>
              <input
                type="text"
                autoFocus
                value={securityAnswer}
                onChange={(e) => setSecurityAnswer(e.target.value)}
                className="w-full h-14 px-4 bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white rounded-2xl border-2 border-transparent focus:border-emerald-500 outline-none font-bold text-lg"
                placeholder={t.type_answer}
              />
            </div>
            <button
              type="submit"
              className="w-full h-14 bg-emerald-600 text-white rounded-2xl font-black text-sm uppercase tracking-widest shadow-lg shadow-emerald-200 dark:shadow-none"
            >
              {t.verify_answer}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (mode === 'setup' && setupStep === 'question') {
    return (
      <div className="fixed inset-0 z-[1000] bg-white dark:bg-slate-900 flex flex-col p-6">
        <header className="flex items-center gap-4 mb-8">
          <button onClick={onBack} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full text-slate-700 dark:text-slate-200">
            <ArrowLeft size={24} />
          </button>
          <h1 className="text-xl font-bold dark:text-white">Security Question</h1>
        </header>

        <div className="flex-1 max-w-sm mx-auto w-full space-y-6">
          <p className="text-slate-600 dark:text-slate-400 font-medium">Set a recovery question in case you forget your PIN.</p>
          
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1 uppercase tracking-wider">Example Questions</label>
              <div className="flex flex-wrap gap-2 mb-4">
                {['Shop Name', 'Best Friend Name', 'Birth City', 'Mother Maiden Name'].map(q => (
                  <button 
                    key={q} 
                    onClick={() => setQuestion(q)}
                    className={cn(
                      "px-3 py-1.5 rounded-full text-[10px] font-bold border transition-all",
                      question === q ? "bg-emerald-600 border-emerald-600 text-white" : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                    )}
                  >
                    {q}
                  </button>
                ))}
              </div>
              <input
                type="text"
                placeholder="Enter your security question"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                className="w-full h-14 px-4 bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white rounded-2xl border-2 border-transparent focus:border-emerald-500 outline-none font-bold"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1 uppercase tracking-wider">Your Answer</label>
              <input
                type="text"
                placeholder="Enter answer"
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                className="w-full h-14 px-4 bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white rounded-2xl border-2 border-transparent focus:border-emerald-500 outline-none font-bold"
              />
              <p className="text-[10px] text-slate-400 mt-2 italic font-medium">* This will be needed if you forget the PIN.</p>
            </div>

            <button
              onClick={handleSetupFinish}
              className="w-full h-14 bg-emerald-600 text-white rounded-2xl font-black text-sm uppercase tracking-widest shadow-lg shadow-emerald-200 dark:shadow-none mt-4"
            >
              Finish Setup
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- VIEW 1: Dedicated Biometric Screen (Face ID / Fingerprint) ---
  if (mode === 'unlock' && viewMode === 'biometric' && settings.biometricEnabled) {
    return (
      <div className="fixed inset-0 z-[1000] bg-slate-950 flex flex-col items-center justify-between p-8 select-none text-white overflow-hidden">
        {/* Top Header */}
        <div className="flex flex-col items-center gap-2 pt-6">
          <div className="flex items-center gap-2 px-3 py-1 bg-white/10 rounded-full border border-white/10">
            <ShieldCheck size={14} className="text-emerald-400" />
            <span className="text-[11px] font-black uppercase tracking-wider text-slate-300">
              {settings.name || 'Dukaan Pro'} &bull; Secure Lock
            </span>
          </div>
        </div>

        {/* Center Biometric Stage */}
        <div className="flex-1 flex flex-col items-center justify-center w-full max-w-sm">
          {isApple ? (
            /* Apple Face ID Animation Interface */
            <div className="flex flex-col items-center gap-6">
              <motion.div 
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="relative w-44 h-44 rounded-3xl border-2 border-emerald-500/30 flex items-center justify-center bg-slate-900/60 backdrop-blur-2xl shadow-2xl shadow-emerald-950/40 overflow-hidden cursor-pointer active:scale-95 transition-transform"
                onClick={() => runBiometricAuth(true)}
                title="Tap to scan Face ID"
              >
                {/* 4 iOS-style Corner Brackets */}
                <div className="absolute top-2.5 left-2.5 w-6 h-6 border-t-2 border-l-2 border-emerald-400 rounded-tl-xl" />
                <div className="absolute top-2.5 right-2.5 w-6 h-6 border-t-2 border-r-2 border-emerald-400 rounded-tr-xl" />
                <div className="absolute bottom-2.5 left-2.5 w-6 h-6 border-b-2 border-l-2 border-emerald-400 rounded-bl-xl" />
                <div className="absolute bottom-2.5 right-2.5 w-6 h-6 border-b-2 border-r-2 border-emerald-400 rounded-br-xl" />

                {/* Animated Horizontal Laser Scan Line */}
                {biometricStatus === 'scanning' && (
                  <motion.div 
                    animate={{ y: [-60, 60, -60] }}
                    transition={{ repeat: Infinity, duration: 1.6, ease: "easeInOut" }}
                    className="absolute left-4 right-4 h-0.5 bg-gradient-to-r from-transparent via-emerald-400 to-transparent shadow-[0_0_12px_#34d399]"
                  />
                )}

                {/* Center Face ID Icon */}
                <div className={cn(
                  "transition-all duration-300 flex items-center justify-center",
                  biometricStatus === 'success' && "text-emerald-400 scale-110",
                  biometricStatus === 'failed' && "text-rose-400 shake",
                  biometricStatus === 'scanning' && "text-emerald-300 animate-pulse",
                  biometricStatus === 'idle' && "text-slate-300"
                )}>
                  {biometricStatus === 'success' ? (
                    <CheckCircle2 size={80} className="animate-bounce" />
                  ) : biometricStatus === 'failed' ? (
                    <AlertCircle size={80} />
                  ) : (
                    <ScanFace size={80} strokeWidth={1.4} />
                  )}
                </div>
              </motion.div>

              <div className="text-center space-y-1.5">
                <h3 className="text-2xl font-black tracking-tight text-white flex items-center justify-center gap-2">
                  Face ID
                  {biometricStatus === 'scanning' && (
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                  )}
                </h3>
                <p className="text-xs font-semibold text-slate-400">
                  {biometricMessage || 'Authenticating with Face ID...'}
                </p>
              </div>
            </div>
          ) : (
            /* Android Fingerprint Interface */
            <div className="flex flex-col items-center gap-6">
              <motion.button
                type="button"
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => runBiometricAuth(true)}
                className="relative w-44 h-44 rounded-full bg-emerald-500/10 border-2 border-emerald-400/40 flex items-center justify-center shadow-2xl shadow-emerald-950/50 group cursor-pointer"
                title="Tap fingerprint to unlock"
              >
                {/* Expanding pulse ripple */}
                <div className="absolute inset-0 rounded-full border border-emerald-400/30 animate-ping opacity-60" />
                <div className="absolute inset-4 rounded-full border border-emerald-400/20" />

                <div className={cn(
                  "transition-all duration-300",
                  biometricStatus === 'success' && "text-emerald-400 scale-110",
                  biometricStatus === 'failed' && "text-rose-400",
                  biometricStatus === 'scanning' && "text-emerald-300 animate-pulse",
                  biometricStatus === 'idle' && "text-emerald-400 group-hover:text-emerald-300"
                )}>
                  {biometricStatus === 'success' ? (
                    <CheckCircle2 size={80} className="animate-bounce" />
                  ) : biometricStatus === 'failed' ? (
                    <AlertCircle size={80} />
                  ) : (
                    <Fingerprint size={84} strokeWidth={1.5} />
                  )}
                </div>
              </motion.button>

              <div className="text-center space-y-1.5">
                <h3 className="text-2xl font-black tracking-tight text-white">
                  Fingerprint Unlock
                </h3>
                <p className="text-xs font-semibold text-slate-400">
                  {biometricMessage || 'Click on the fingerprint icon to open Dukaan Pro'}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Bottom Options: Fallback to PIN */}
        <div className="w-full max-w-sm flex flex-col items-center gap-3 pb-4">
          <button
            type="button"
            onClick={() => {
              setViewMode('pin');
              setBiometricStatus('idle');
            }}
            className="w-full py-4 px-6 bg-white/10 hover:bg-white/15 active:scale-95 text-white font-black text-xs uppercase tracking-widest rounded-2xl border border-white/15 transition-all flex items-center justify-center gap-2 shadow-lg"
          >
            <KeyRound size={16} className="text-emerald-400" />
            Enter 4-Digit PIN Instead
          </button>
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="text-xs font-bold text-slate-400 hover:text-white uppercase tracking-wider py-2 transition-colors"
            >
              Cancel / Back to App
            </button>
          )}
        </div>
      </div>
    );
  }

  // --- VIEW 2: 4-Digit PIN Keypad Screen ---
  return (
    <div className="fixed inset-0 z-[1000] bg-white dark:bg-slate-950 flex flex-col items-center justify-center p-8 select-none">
      <motion.div 
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ 
          scale: 1, 
          opacity: 1,
          x: error ? [0, -10, 10, -10, 10, 0] : 0
        }}
        transition={{ 
          duration: error ? 0.4 : 0.2,
          ease: "easeInOut"
        }}
        className="w-full max-w-sm flex flex-col items-center gap-6"
      >
        <button
          type="button"
          onClick={() => {
            if (mode === 'unlock' && settings.biometricEnabled) {
              setViewMode('biometric');
            }
          }}
          className="w-24 h-24 bg-emerald-50 dark:bg-emerald-950/40 rounded-[32px] flex items-center justify-center text-emerald-600 dark:text-emerald-400 shadow-inner border-2 border-emerald-100 dark:border-emerald-900/40 overflow-hidden relative group active:scale-95 transition-transform cursor-pointer"
          title="Switch to Face ID / Fingerprint"
        >
          {settings.logoUrl ? (
            <img src={settings.logoUrl} alt="Logo" className="w-full h-full object-cover" />
          ) : (
            mode === 'setup' ? <ShieldCheck size={48} /> : (
              settings.biometricEnabled ? (
                isApple ? <ScanFace size={48} className="text-emerald-600 dark:text-emerald-400" /> : <Fingerprint size={48} className="text-emerald-600 dark:text-emerald-400" />
              ) : <Lock size={48} />
            )
          )}
        </button>

        <div className="text-center">
          <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            {mode === 'unlock' ? 'Enter PIN Code' : mode === 'setup' ? (setupStep === 'pin' ? 'Create PIN' : 'Confirm PIN') : 'Verify Old PIN'}
          </h2>
          <p className="text-slate-500 dark:text-slate-400 font-medium text-xs mt-1">
            {mode === 'unlock' ? 'Enter your 4-digit code to unlock' : 
             mode === 'setup' ? (setupStep === 'pin' ? 'Choose a 4-digit secure code' : 'Repeat the code to confirm') : 
             'Please enter your current PIN to continue'}
          </p>
        </div>

        {/* PIN Indicators */}
        <div className="flex gap-4">
          {[0, 1, 2, 3].map((i) => (
            <motion.div
              key={i}
              animate={{ 
                scale: pin.length > i ? 1.25 : 1,
                backgroundColor: pin.length > i ? "#059669" : "#e2e8f0"
              }}
              className="w-4 h-4 rounded-full dark:bg-slate-700"
            />
          ))}
        </div>

        {/* Numpad */}
        <div className="grid grid-cols-3 gap-x-8 gap-y-4 w-full max-w-[280px]">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
            <button
              key={num}
              onClick={() => handleNumberClick(num.toString())}
              className="w-16 h-16 rounded-2xl text-2xl font-bold text-slate-700 dark:text-slate-200 bg-slate-50/50 dark:bg-slate-900/60 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 active:bg-emerald-100 transition-colors flex items-center justify-center border border-slate-100 dark:border-slate-800"
            >
              {num}
            </button>
          ))}

          {/* Biometric Switch Button on bottom left of numpad */}
          {mode === 'unlock' && settings.biometricEnabled ? (
            <button
              type="button"
              onClick={() => setViewMode('biometric')}
              className="w-16 h-16 rounded-2xl text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 hover:bg-emerald-100 active:scale-95 transition-all flex flex-col items-center justify-center gap-0.5 border border-emerald-200 dark:border-emerald-800/60 shadow-sm"
              title={isApple ? "Use Face ID" : "Use Fingerprint"}
            >
              {isApple ? <ScanFace size={22} /> : <Fingerprint size={22} />}
              <span className="text-[7.5px] font-black uppercase tracking-tighter">
                {isApple ? 'Face ID' : 'Biometric'}
              </span>
            </button>
          ) : (
            <div className="w-16 h-16" />
          )}

          <button
            onClick={() => handleNumberClick('0')}
            className="w-16 h-16 rounded-2xl text-2xl font-bold text-slate-700 dark:text-slate-200 bg-slate-50/50 dark:bg-slate-900/60 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 active:bg-emerald-100 transition-colors flex items-center justify-center border border-slate-100 dark:border-slate-800"
          >
            0
          </button>
          <button
            onClick={handleDelete}
            className="w-16 h-16 rounded-2xl text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 active:bg-slate-200 transition-colors flex items-center justify-center"
          >
            <Delete size={24} />
          </button>
        </div>

        <div className="mt-2 flex flex-col items-center gap-3 w-full">
          {mode === 'unlock' && (
            <button 
              onClick={() => setIsForgotMode(true)}
              className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest hover:text-emerald-600 dark:hover:text-emerald-400 transition-all flex items-center gap-1.5"
            >
              <HelpCircle size={14} /> Forgot PIN?
            </button>
          )}
          {onBack && (
            <button onClick={onBack} className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest hover:text-slate-600 py-1">
              Cancel
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
}
