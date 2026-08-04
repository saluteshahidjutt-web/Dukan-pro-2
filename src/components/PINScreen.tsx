/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Lock, Delete, ArrowLeft, ShieldCheck, HelpCircle, ScanFace, Fingerprint, CheckCircle2, AlertCircle, RefreshCcw } from 'lucide-react';
import { cn } from '../lib/utils';
import { ShopSettings } from '../types';
import { hashValue } from '../lib/security';
import { authenticateBiometric } from '../lib/biometric';
import { translations, Language } from '../lib/translations';

interface PINScreenProps {
  settings: ShopSettings;
  onSuccess: () => void;
  mode: 'unlock' | 'setup' | 'verify_old';
  onBack?: () => void;
  onSetupComplete?: (pinHash: string, securityQuestion: string, securityAnswerHash: string) => void;
}

export function PINScreen({ settings, onSuccess, mode, onBack, onSetupComplete }: PINScreenProps) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const [isForgotMode, setIsForgotMode] = useState(false);
  const [securityAnswer, setSecurityAnswer] = useState('');
  const [setupStep, setSetupStep] = useState<'pin' | 'confirm' | 'question'>('pin');
  const [setupPin, setSetupPin] = useState('');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');

  // Biometric states
  const [isScanningBiometric, setIsScanningBiometric] = useState<boolean>(false);
  const [biometricStatus, setBiometricStatus] = useState<'idle' | 'scanning' | 'success' | 'failed'>('idle');
  const [biometricError, setBiometricError] = useState<string>('');

  const t = translations[settings.language as Language || 'en'];

  const handleBiometricScan = useCallback(async () => {
    setIsScanningBiometric(true);
    setBiometricStatus('scanning');
    setBiometricError('');

    try {
      const res = await authenticateBiometric(settings.biometricCredentialId);
      if (res.success) {
        setBiometricStatus('success');
        if ('vibrate' in navigator) navigator.vibrate([80, 40, 80]);
        setTimeout(() => {
          setIsScanningBiometric(false);
          onSuccess();
        }, 400);
      } else {
        setBiometricStatus('failed');
        setBiometricError(res.error || 'Face ID / Fingerprint did not match. Please enter PIN code.');
        if ('vibrate' in navigator) navigator.vibrate([150, 80, 150]);
        setTimeout(() => {
          setIsScanningBiometric(false);
        }, 1200);
      }
    } catch (err) {
      console.error("Biometric scan error:", err);
      setBiometricStatus('failed');
      setBiometricError('Face ID / Fingerprint verification failed. Enter PIN code.');
      setTimeout(() => {
        setIsScanningBiometric(false);
      }, 1000);
    }
  }, [settings.biometricCredentialId, onSuccess]);

  // Auto trigger Face ID / Fingerprint when app opens if biometric is enabled
  useEffect(() => {
    if (mode === 'unlock' && settings.biometricEnabled) {
      handleBiometricScan();
    }
  }, [mode, settings.biometricEnabled, handleBiometricScan]);

  const handleNumberClick = (num: string) => {
    if (pin.length < 4) {
      setPin(prev => prev + num);
      setError(false);
      setBiometricError('');
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
            if (inputHash === settings.pinHash) {
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
      const answerHash = await hashValue(securityAnswer.toLowerCase().trim());
      if (answerHash === settings.securityAnswerHash) {
        alert('Security verified. App Unlocked. Please update your PIN in settings.');
        onSuccess();
      } else {
        setError(true);
        alert('Incorrect answer.');
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
            <p className="text-lg font-bold text-slate-900 dark:text-white">{settings.securityQuestion}</p>
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
                {['Best Friend Name', 'Full Name', 'Birth City', 'Mother Maiden Name'].map(q => (
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

  return (
    <div className="fixed inset-0 z-[1000] bg-white dark:bg-slate-950 flex flex-col items-center justify-center p-8 select-none">
      
      {/* Biometric Scanning Overlay Modal */}
      <AnimatePresence>
        {isScanningBiometric && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[1100] bg-slate-950/80 backdrop-blur-2xl flex flex-col items-center justify-center p-6 text-white"
          >
            <motion.div 
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.85, opacity: 0 }}
              className="bg-slate-900/90 border border-white/10 rounded-3xl p-8 max-w-xs w-full flex flex-col items-center text-center shadow-2xl relative overflow-hidden"
            >
              {/* Scanning visual ring */}
              <div className="relative w-28 h-28 flex items-center justify-center my-4">
                <motion.div 
                  animate={biometricStatus === 'scanning' ? { rotate: 360, scale: [1, 1.08, 1] } : { scale: 1 }}
                  transition={{ repeat: biometricStatus === 'scanning' ? Infinity : 0, duration: 2, ease: "linear" }}
                  className={cn(
                    "absolute inset-0 rounded-full border-2 border-dashed transition-all duration-300",
                    biometricStatus === 'scanning' && "border-emerald-400 border-t-transparent animate-spin",
                    biometricStatus === 'success' && "border-emerald-500 bg-emerald-500/20",
                    biometricStatus === 'failed' && "border-rose-500 bg-rose-500/20"
                  )}
                />
                <div className={cn(
                  "w-20 h-20 rounded-full flex items-center justify-center transition-all duration-300 relative z-10",
                  biometricStatus === 'scanning' && "bg-emerald-500/20 text-emerald-400",
                  biometricStatus === 'success' && "bg-emerald-500 text-white",
                  biometricStatus === 'failed' && "bg-rose-500 text-white"
                )}>
                  {biometricStatus === 'success' ? (
                    <CheckCircle2 size={44} className="animate-bounce" />
                  ) : biometricStatus === 'failed' ? (
                    <AlertCircle size={44} />
                  ) : (
                    <div className="flex items-center justify-center relative">
                      <ScanFace size={40} className="animate-pulse" />
                      <Fingerprint size={24} className="absolute opacity-80" />
                    </div>
                  )}
                </div>
              </div>

              <h3 className="text-xl font-black text-white tracking-tight mt-2">
                {biometricStatus === 'success' ? 'Face ID Verified!' :
                 biometricStatus === 'failed' ? 'Biometric Mismatch' :
                 'Face ID / Fingerprint'}
              </h3>

              <p className="text-xs text-slate-300 font-medium mt-1.5 mb-6">
                {biometricStatus === 'scanning' ? 'Verifying Face ID or Fingerprint...' :
                 biometricStatus === 'success' ? 'Unlocking your Dukaan Pro...' :
                 biometricError || 'Face ID did not match. Prompting PIN code...'}
              </p>

              <button
                type="button"
                onClick={() => setIsScanningBiometric(false)}
                className="w-full py-3 bg-white/10 hover:bg-white/20 active:scale-95 text-white font-bold text-xs uppercase tracking-widest rounded-2xl border border-white/10 transition-all"
              >
                Enter PIN Code
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
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
        <div className="w-32 h-32 bg-emerald-50 dark:bg-emerald-950/40 rounded-[36px] flex items-center justify-center text-emerald-600 dark:text-emerald-400 shadow-inner border-2 border-emerald-100 dark:border-emerald-900/40 overflow-hidden relative group">
          {settings.logoUrl ? (
            <img src={settings.logoUrl} alt="Logo" className="w-full h-full object-cover" />
          ) : (
            mode === 'setup' ? <ShieldCheck size={64} /> : (
              settings.biometricEnabled ? <ScanFace size={64} /> : <Lock size={64} />
            )
          )}
        </div>

        <div className="text-center">
          <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            {mode === 'unlock' ? 'Welcome Back' : mode === 'setup' ? (setupStep === 'pin' ? 'Create PIN' : 'Confirm PIN') : 'Verify Old PIN'}
          </h2>
          <p className="text-slate-500 dark:text-slate-400 font-medium text-sm mt-1">
            {mode === 'unlock' ? 'Enter PIN or use Face ID to unlock' : 
             mode === 'setup' ? (setupStep === 'pin' ? 'Choose a 4-digit secure code' : 'Repeat the code to confirm') : 
             'Please enter your current PIN to continue'}
          </p>
        </div>

        {/* Error notification banner if Face ID did not match */}
        {biometricError && mode === 'unlock' && (
          <motion.div 
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 rounded-2xl p-3 flex items-center gap-2.5 text-rose-700 dark:text-rose-300 text-xs font-bold"
          >
            <AlertCircle size={18} className="shrink-0 text-rose-600 dark:text-rose-400" />
            <span>{biometricError}</span>
          </motion.div>
        )}

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

          {/* Quick Face ID / Fingerprint button on Numpad */}
          {mode === 'unlock' && settings.biometricEnabled ? (
            <button
              type="button"
              onClick={handleBiometricScan}
              className="w-16 h-16 rounded-2xl text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 hover:bg-emerald-100 active:scale-95 transition-all flex flex-col items-center justify-center gap-0.5 border border-emerald-200 dark:border-emerald-800/60 shadow-sm"
              title="Scan Face ID or Fingerprint"
            >
              <ScanFace size={22} />
              <span className="text-[8px] font-black uppercase tracking-tighter">Face ID</span>
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
