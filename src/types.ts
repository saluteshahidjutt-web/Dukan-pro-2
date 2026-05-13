/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Product {
  id: string;
  name: string;
  category: string;
  price: number;
  purchasePrice: number;
  stock: number;
  barcode: string;
  image?: string;
  lowStockThreshold: number;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  balance: number; // Positive = user owes us (Udhar), Negative = We owe user (Prepaid)
  lastTransactionAt: string;
  dueDate?: string;
  lastTransactionType?: string;
}

export interface Transaction {
  id: string;
  type: 'sale' | 'payment' | 'credit' | 'payment_received' | 'credit_given' | 'return';
  amount: number;
  description: string;
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  items?: Array<{productId: string, quantity: number, price: number}>;
  createdAt: string;
  proofImage?: string;
  dueDate?: string;
  paymentMethod?: 'cash' | 'jazzcash' | 'easypaisa' | 'udhar' | 'split';
  isDeleted?: boolean;
  deletedAt?: string;
  splitDetails?: {
    cash?: number;
    udhar?: number;
    jazzcash?: number;
    easypaisa?: number;
  };
}

export interface Expense {
  id: string;
  amount: number;
  description: string;
  category: string;
  createdAt: string;
  evidenceUrl?: string;
  ownerId?: string;
}

export interface ShopSettings {
  name: string;
  phone: string;
  currency: string;
  language: 'en' | 'ur' | 'roman';
  pinEnabled?: boolean;
  pinHash?: string;
  securityQuestion?: string;
  securityAnswerHash?: string;
  logoUrl?: string;
  receiptFooter?: string;
  address?: string;
  theme?: 'light' | 'dark';
  ownerEmail?: string;
}
