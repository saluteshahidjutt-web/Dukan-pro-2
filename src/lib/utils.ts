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
