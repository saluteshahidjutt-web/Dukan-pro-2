/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Lock, Delete, ArrowLeft, ShieldCheck, HelpCircle } from 'lucide-react';
import { cn } from '../lib/utils';
import { ShopSettings } from '../types';
import { hashValue } from '../lib/security';

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

  const t = translations[settings.language as Language || 'en'];

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
      if (pin.length === 4) {
        if (mode === 'unlock' || mode === 'verify_old') {
          const inputHash = await hashValue(pin);
          if (inputHash === settings.pinHash) {
            onSuccess();
          } else {
            setError(true);
            setPin('');
            // Optional: Vibrate if supported
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
    };
    handleAuth();
  }, [pin, mode, settings.pinHash, onSuccess, setupStep, setupPin]);

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const answerHash = await hashValue(securityAnswer.toLowerCase().trim());
    if (answerHash === settings.securityAnswerHash) {
      alert('Security verified. App Unlocked. Please update your PIN in settings.');
      onSuccess();
    } else {
      setError(true);
      alert('Incorrect answer.');
      setTimeout(() => setError(false), 500);
    }
  };

  const handleSetupFinish = async () => {
    if (!question || !answer) {
      alert('Please fill all fields');
      return;
    }
    const pinHash = await hashValue(setupPin);
    const answerHash = await hashValue(answer.toLowerCase().trim());
    onSetupComplete?.(pinHash, question, answerHash);
  };

  if (isForgotMode) {
    return (
      <div className="fixed inset-0 z-[1000] bg-white flex flex-col p-6">
        <header className="flex items-center gap-4 mb-8">
          <button onClick={() => setIsForgotMode(false)} className="p-2 hover:bg-slate-100 rounded-full">
            <ArrowLeft size={24} />
          </button>
          <h1 className="text-xl font-bold">{t.reset_pin}</h1>
        </header>

        <div className="flex-1 max-w-sm mx-auto w-full">
          <p className="text-slate-600 mb-6 font-medium">{t.reset_pin_desc}</p>
          <div className="bg-slate-50 p-4 rounded-2xl mb-6">
            <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1">{t.security_question}</p>
            <p className="text-lg font-bold text-slate-900">{settings.securityQuestion}</p>
          </div>

          <form onSubmit={handleForgotSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">{t.your_answer}</label>
              <input
                type="text"
                autoFocus
                value={securityAnswer}
                onChange={(e) => setSecurityAnswer(e.target.value)}
                className="w-full h-14 px-4 bg-slate-100 rounded-2xl border-2 border-transparent focus:border-emerald-500 outline-none font-bold text-lg"
                placeholder={t.type_answer}
              />
            </div>
            <button
              type="submit"
              className="w-full h-14 bg-emerald-600 text-white rounded-2xl font-black text-sm uppercase tracking-widest shadow-lg shadow-emerald-200"
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
      <div className="fixed inset-0 z-[1000] bg-white flex flex-col p-6">
        <header className="flex items-center gap-4 mb-8">
          <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-full">
            <ArrowLeft size={24} />
          </button>
          <h1 className="text-xl font-bold">Security Question</h1>
        </header>

        <div className="flex-1 max-w-sm mx-auto w-full space-y-6">
          <p className="text-slate-600 font-medium">Set a recovery question in case you forget your PIN.</p>
          
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-wider">Example Questions</label>
              <div className="flex flex-wrap gap-2 mb-4">
                {['Best Friend Name', 'Full Name', 'Birth City', 'Mother Maiden Name'].map(q => (
                  <button 
                    key={q} 
                    onClick={() => setQuestion(q)}
                    className={cn(
                      "px-3 py-1.5 rounded-full text-[10px] font-bold border transition-all",
                      question === q ? "bg-emerald-600 border-emerald-600 text-white" : "border-slate-200 text-slate-600 hover:bg-slate-50"
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
                className="w-full h-14 px-4 bg-slate-100 rounded-2xl border-2 border-transparent focus:border-emerald-500 outline-none font-bold"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-wider">Your Answer</label>
              <input
                type="text"
                placeholder="Enter answer"
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                className="w-full h-14 px-4 bg-slate-100 rounded-2xl border-2 border-transparent focus:border-emerald-500 outline-none font-bold"
              />
              <p className="text-[10px] text-slate-400 mt-2 italic font-medium">* This will be needed if you forget the PIN.</p>
            </div>

            <button
              onClick={handleSetupFinish}
              className="w-full h-14 bg-emerald-600 text-white rounded-2xl font-black text-sm uppercase tracking-widest shadow-lg shadow-emerald-200 mt-4"
            >
              Finish Setup
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[1000] bg-white flex flex-col items-center justify-center p-8">
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
        className="w-full max-w-sm flex flex-col items-center gap-8"
      >
        <div className="w-20 h-20 bg-emerald-50 rounded-3xl flex items-center justify-center text-emerald-600 shadow-sm border border-emerald-100">
          {mode === 'setup' ? <ShieldCheck size={40} /> : <Lock size={40} />}
        </div>

        <div className="text-center">
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">
            {mode === 'unlock' ? 'Welcome Back' : mode === 'setup' ? (setupStep === 'pin' ? 'Create PIN' : 'Confirm PIN') : 'Verify Old PIN'}
          </h2>
          <p className="text-slate-500 font-medium text-sm mt-1">
            {mode === 'unlock' ? 'Enter PIN to unlock your shop' : 
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
                scale: pin.length > i ? 1.2 : 1,
                backgroundColor: pin.length > i ? "#059669" : "#e2e8f0"
              }}
              className="w-4 h-4 rounded-full"
            />
          ))}
        </div>

        {/* Numpad */}
        <div className="grid grid-cols-3 gap-x-8 gap-y-4 w-full max-w-[280px]">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
            <button
              key={num}
              onClick={() => handleNumberClick(num.toString())}
              className="w-16 h-16 rounded-2xl text-2xl font-bold text-slate-700 hover:bg-slate-50 active:bg-slate-100 transition-colors flex items-center justify-center"
            >
              {num}
            </button>
          ))}
          <div className="w-16 h-16" /> {/* Placeholder */}
          <button
            onClick={() => handleNumberClick('0')}
            className="w-16 h-16 rounded-2xl text-2xl font-bold text-slate-700 hover:bg-slate-50 active:bg-slate-100 transition-colors flex items-center justify-center"
          >
            0
          </button>
          <button
            onClick={handleDelete}
            className="w-16 h-16 rounded-2xl text-slate-400 hover:bg-slate-50 active:bg-slate-100 transition-colors flex items-center justify-center"
          >
            <Delete size={24} />
          </button>
        </div>

        <div className="mt-4 flex flex-col items-center gap-4 w-full">
          {mode === 'unlock' && (
            <button 
              onClick={() => setIsForgotMode(true)}
              className="text-xs font-black text-slate-400 uppercase tracking-widest hover:text-emerald-600 transition-all flex items-center gap-1.5"
            >
              <HelpCircle size={14} /> Forgot PIN?
            </button>
          )}
          {onBack && (
            <button onClick={onBack} className="text-xs font-black text-slate-400 uppercase tracking-widest hover:text-slate-600 py-2">
              Cancel
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
}
