import React, { useState } from 'react';
import { ShoppingCart, LogIn } from 'lucide-react';
import { signInWithPopup, getGoogleProvider, auth } from '../lib/firebase';
import { motion } from 'motion/react';
import { LegalModal } from './LegalModal';
import { AboutContent, PrivacyContent, TermsContent } from './legalPages';

export function Login() {
  const [isLoading, setIsLoading] = React.useState(false);
  const [activeModal, setActiveModal] = useState<'about' | 'privacy' | 'terms' | null>(null);

  const handleLogin = async () => {
    if (isLoading) return;
    setIsLoading(true);
    try {
      const provider = new getGoogleProvider();
      await signInWithPopup(auth, provider);
    } catch (error: any) {
      if (error.code === 'auth/cancelled-popup-request') {
        console.log('Popup request was already pending or cancelled by a new request.');
      } else {
        console.error('Login error:', error);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-emerald-900 flex flex-col items-center justify-between p-6 text-white font-sans relative">
      <div className="flex-1 w-full flex items-center justify-center">
        <motion.div 
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="max-w-md w-full space-y-8 text-center"
        >
          <div className="flex flex-col items-center gap-4 mb-8">
            <div className="w-40 h-40 bg-white/10 rounded-[40px] flex items-center justify-center text-emerald-400 shadow-2xl border border-white/5">
              <ShoppingCart size={80} strokeWidth={1.5} />
            </div>
            <div>
              <h1 className="text-4xl font-black tracking-tight">Dukaan<span className="text-emerald-400"> Pro</span></h1>
              <p className="text-emerald-300 font-bold uppercase tracking-widest text-[10px] opacity-80 mt-1">Come to Dukaan Pro and become digital</p>
            </div>
          </div>

          <div className="bg-white/5 backdrop-blur-xl p-8 rounded-[40px] border border-white/10 shadow-2xl">
            <h2 className="text-xl font-bold mb-2">Welcome Back!</h2>
            <p className="text-emerald-300/60 text-sm mb-8 font-medium">Manage your dukaan stock, udhar and reports from anywhere.</p>
            
            <button
              onClick={handleLogin}
              disabled={isLoading}
              className="w-full bg-white text-emerald-900 py-4 rounded-2xl font-black flex items-center justify-center gap-3 active:scale-95 transition-all shadow-xl shadow-black/20 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <div className="w-6 h-6 border-2 border-emerald-900/30 border-t-emerald-900 rounded-full animate-spin" />
              ) : (
                <LogIn size={20} />
              )}
              {isLoading ? 'SIGNING IN...' : 'CONTINUE WITH GOOGLE'}
            </button>

            <p className="mt-8 text-[10px] text-emerald-300/40 font-bold uppercase tracking-[0.2em]">
              Digital POS & Udhar Khata for Everyone
            </p>
          </div>
        </motion.div>
      </div>

      <div className="w-full flex justify-center gap-4 text-xs font-medium text-emerald-400/60 mb-12 relative z-10">
        <button onClick={() => setActiveModal('about')} className="hover:text-emerald-300 transition-colors">About Us</button>
        <span>&bull;</span>
        <button onClick={() => setActiveModal('privacy')} className="hover:text-emerald-300 transition-colors">Privacy Policy</button>
        <span>&bull;</span>
        <button onClick={() => setActiveModal('terms')} className="hover:text-emerald-300 transition-colors">Terms & Conditions</button>
      </div>

      <LegalModal 
        isOpen={activeModal === 'about'} 
        onClose={() => setActiveModal(null)}
        title="About Us"
        content={<AboutContent />}
      />
      <LegalModal 
        isOpen={activeModal === 'privacy'} 
        onClose={() => setActiveModal(null)}
        title="Privacy Policy"
        content={<PrivacyContent />}
      />
      <LegalModal 
        isOpen={activeModal === 'terms'} 
        onClose={() => setActiveModal(null)}
        title="Terms & Conditions"
        content={<TermsContent />}
      />
    </div>
  );
}
