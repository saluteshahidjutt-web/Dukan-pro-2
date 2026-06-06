import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number, currency: string = 'Rs.') {
  return `${currency} ${amount.toLocaleString()}`;
}

export function generateId() {
  return Math.random().toString(36).substring(2, 9);
}

export const normalizeBarcode = (code: any): string => {
  if (!code) return '';
  let str = String(code).trim().replace(/[\r\n\s\t]+/g, '').toLowerCase();
  
  // Strip standard AIM barcode identifiers like ]C1, ]E0 which are 3 chars
  if (str.startsWith(']')) {
    str = str.substring(3);
  }
  
  return str;
};

export const isBarcodeMatch = (b1: string, b2: string): boolean => {
  const norm1 = normalizeBarcode(b1);
  const norm2 = normalizeBarcode(b2);
  if (!norm1 || !norm2) return false;
  if (norm1 === norm2) return true;
  
  const stripZeros = (s: string) => s.replace(/^0+/, '');
  return stripZeros(norm1) === stripZeros(norm2);
};
