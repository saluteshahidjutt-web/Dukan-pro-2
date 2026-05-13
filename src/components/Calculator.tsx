import React, { useState, useEffect } from 'react';
import { Delete, ArrowRight, X } from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

interface CalculatorProps {
  onValueChange: (value: string, expression?: string) => void;
  onComplete: () => void;
  initialValue?: string;
  onClose: () => void;
}

export function Calculator({ onValueChange, onComplete, initialValue = '', onClose }: CalculatorProps) {
  const [expression, setExpression] = useState(initialValue);

  const calculateResult = (expr: string) => {
    try {
      if (!expr) return '';
      
      // Basic validation: only numbers and operators
      const san = expr.replace(/×/g, '*').replace(/÷/g, '/').replace(/%/g, '/100');
      // Remove trailing operators
      const clean = san.replace(/[+/*-]$/, '');
      
      if (clean === '') return '';
      
      // Basic math parser
      // eslint-disable-next-line no-new-func
      const val = new Function(`return ${clean}`)();
      if (typeof val === 'number' && isFinite(val)) {
        return Number(val.toFixed(2)).toString();
      }
      return '';
    } catch {
      return '';
    }
  };

  const handlePress = (val: string) => {
    if (val === 'AC') {
      setExpression('');
      onValueChange('', '');
      return;
    }
    
    if (val === 'back') {
      const next = expression.slice(0, -1);
      setExpression(next);
      onValueChange(calculateResult(next), next);
      return;
    }

    if (val === '=') {
      const res = calculateResult(expression);
      setExpression(res);
      onValueChange(res, res);
      return;
    }

    const next = expression + val;
    setExpression(next);
    onValueChange(calculateResult(next), next);
  };

  const btnClass = "rounded-2xl flex items-center justify-center font-black text-xl active:scale-90 transition-all active:bg-slate-200 dark:active:bg-slate-700";
  const numClass = cn(btnClass, "bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white");
  const opClass = cn(btnClass, "bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400");
  const specialClass = cn(btnClass, "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400");

  return (
    <div className="bg-white dark:bg-slate-900 w-full p-2 select-none">
      <div className="grid grid-cols-4 grid-rows-5 gap-2 h-[350px]">
        {/* Row 1 */}
        <button onClick={() => handlePress('AC')} className={opClass}>AC</button>
        <button onClick={() => handlePress('÷')} className={opClass}>÷</button>
        <button onClick={() => handlePress('×')} className={opClass}>×</button>
        <button onClick={() => handlePress('back')} className={specialClass}><Delete size={20} /></button>

        {/* Row 2 */}
        <button onClick={() => handlePress('7')} className={numClass}>7</button>
        <button onClick={() => handlePress('8')} className={numClass}>8</button>
        <button onClick={() => handlePress('9')} className={numClass}>9</button>
        <button onClick={() => handlePress('-')} className={opClass}>-</button>

        {/* Row 3 */}
        <button onClick={() => handlePress('4')} className={numClass}>4</button>
        <button onClick={() => handlePress('5')} className={numClass}>5</button>
        <button onClick={() => handlePress('6')} className={numClass}>6</button>
        <button 
          onClick={() => handlePress('+')} 
          className={cn(opClass, "row-span-2 h-full text-2xl")}
        >
          +
        </button>

        {/* Row 4 */}
        <button onClick={() => handlePress('1')} className={numClass}>1</button>
        <button onClick={() => handlePress('2')} className={numClass}>2</button>
        <button onClick={() => handlePress('3')} className={numClass}>3</button>

        {/* Row 5 */}
        <button onClick={() => handlePress('00')} className={numClass}>00</button>
        <button onClick={() => handlePress('0')} className={numClass}>0</button>
        <button onClick={() => handlePress('.')} className={numClass}>.</button>
        <button 
          onClick={onComplete}
          className="bg-emerald-600 text-white rounded-2xl flex items-center justify-center font-black active:scale-95 transition-all shadow-lg shadow-emerald-200 dark:shadow-none"
        >
          <ArrowRight size={24} />
        </button>
      </div>
    </div>
  );
}
