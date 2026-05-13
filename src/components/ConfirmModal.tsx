import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
  isDanger?: boolean;
  isLoading?: boolean;
}

export function ConfirmModal({ 
  isOpen, 
  title, 
  message, 
  onConfirm, 
  onCancel, 
  confirmLabel = "Yes, Delete", 
  cancelLabel = "Cancel",
  isDanger = true,
  isLoading = false
}: ConfirmModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div 
          initial={{ opacity: 0 }} 
          animate={{ opacity: 1 }} 
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[9999] flex items-center justify-center p-4"
          onClick={isLoading ? undefined : onCancel}
        >
          <motion.div 
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            className="bg-white w-full max-w-sm rounded-[32px] overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-8 text-center">
              <div className={cn(
                "w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6",
                isDanger ? "bg-red-50 text-red-500" : "bg-emerald-50 text-emerald-500"
              )}>
                <AlertTriangle size={32} />
              </div>
              <h3 className="text-xl font-black text-slate-900 mb-2">{title}</h3>
              <p className="text-sm text-slate-500 font-medium leading-relaxed">
                {message}
              </p>
            </div>
            <div className="flex border-t border-slate-100">
              <button 
                disabled={isLoading}
                onClick={onCancel}
                className="flex-1 py-4 text-sm font-black text-slate-400 hover:bg-slate-50 transition-colors uppercase tracking-widest disabled:opacity-50"
              >
                {cancelLabel}
              </button>
              <button 
                disabled={isLoading}
                onClick={onConfirm}
                className={cn(
                  "flex-1 py-4 text-sm font-black text-white transition-colors uppercase tracking-widest disabled:opacity-50",
                  isDanger ? "bg-red-600 hover:bg-red-700" : "bg-emerald-600 hover:bg-emerald-700"
                )}
              >
                {isLoading ? 'Wait...' : confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function cn(...classes: any[]) {
  return classes.filter(Boolean).join(' ');
}
