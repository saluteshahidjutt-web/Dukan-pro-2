import React, { useState } from 'react';
import { Store, ArrowRight } from 'lucide-react';
import { FirestoreService } from '../lib/firestoreService';
import { auth } from '../lib/firebase';
import { ShopSettings } from '../types';
import { motion } from 'motion/react';

export function Onboarding() {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    currency: 'Rs.',
    language: 'en' as const
  });

  const handleFinish = async () => {
    if (!formData.name || !formData.phone) return;
    setLoading(true);
    try {
      const settings: ShopSettings = {
        name: formData.name,
        phone: formData.phone,
        currency: formData.currency,
        language: formData.language,
        theme: 'light',
        ownerEmail: auth.currentUser?.email || ''
      };
      await FirestoreService.saveSettings(settings);
    } catch (error) {
      console.error('Onboarding error:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 font-sans">
      <motion.div 
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="max-w-md w-full"
      >
        <div className="bg-white p-10 rounded-[40px] shadow-2xl border border-slate-100">
          <div className="flex flex-col items-center gap-6 mb-8 text-center">
            <div className="w-28 h-28 bg-emerald-50 rounded-[40px] flex items-center justify-center text-emerald-600 shadow-inner border-2 border-emerald-100">
              <Store size={56} />
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-900 leading-tight">Setup Your Shop</h1>
              <p className="text-slate-500 font-medium">Add your basic details to get started.</p>
            </div>
          </div>

          <div className="space-y-6">
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Shop Name / Dukaan Ka Naam</label>
              <input 
                type="text" 
                placeholder="e.g. Al-Madina General Store"
                className="w-full bg-slate-50 border-none rounded-2xl py-4 px-6 text-sm font-bold focus:ring-2 focus:ring-emerald-500 transition-all"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Shop Phone Number / Mobile Number</label>
              <input 
                type="tel" 
                placeholder="e.g. 0300 1234567"
                className="w-full bg-slate-50 border-none rounded-2xl py-4 px-6 text-sm font-bold focus:ring-2 focus:ring-emerald-500 transition-all"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Currency</label>
                <select 
                  className="w-full bg-slate-50 border-none rounded-2xl py-4 px-6 text-sm font-bold focus:ring-2 focus:ring-emerald-500 transition-all"
                  value={formData.currency}
                  onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                >
                  <option value="Rs.">PKR (Rs.)</option>
                  <option value="$">USD ($)</option>
                  <option value="AED">AED</option>
                  <option value="SAR">SAR</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Language</label>
                <select 
                  className="w-full bg-slate-50 border-none rounded-2xl py-4 px-6 text-sm font-bold focus:ring-2 focus:ring-emerald-500 transition-all"
                  value={formData.language}
                  onChange={(e) => setFormData({ ...formData, language: e.target.value as any })}
                >
                  <option value="en">English (US)</option>
                  <option value="roman">Urdu (Roman)</option>
                  <option value="ur">اردو (Urdu)</option>
                </select>
              </div>
            </div>

            <button
              onClick={handleFinish}
              disabled={loading || !formData.name || !formData.phone}
              className="w-full bg-slate-900 text-white py-4 rounded-2xl font-black flex items-center justify-center gap-3 active:scale-95 transition-all shadow-xl shadow-slate-200 mt-4 disabled:opacity-50"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  START SHARING RECEIPTS
                  <ArrowRight size={20} />
                </>
              )}
            </button>
          </div>

          <p className="mt-8 text-[9px] text-slate-400 text-center font-bold uppercase tracking-widest leading-loose">
            By continuing you agree to modernize your dukaan<br />and become part of Digital Pakistan.
          </p>
        </div>
      </motion.div>
    </div>
  );
}
