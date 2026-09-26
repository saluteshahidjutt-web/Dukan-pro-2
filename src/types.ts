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
  isClearedFromLog?: boolean;
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
  biometricEnabled?: boolean;
  biometricType?: 'face' | 'fingerprint' | 'biometric';
  biometricCredentialId?: string;
  securityQuestion?: string;
  securityAnswerHash?: string;
  logoUrl?: string;
  photoURL?: string;
  receiptFooter?: string;
  address?: string;
  theme?: 'light' | 'dark';
  ownerEmail?: string;
  chatEnabled?: boolean;
  phoneVerified?: boolean;
}

export interface UserProfile {
  id: string;
  uid: string;
  name: string;
  phone: string;
  phoneVerified?: boolean;
  email?: string;
  photoURL?: string;
  status?: string;
  updatedAt: string;
}

export interface ChatRoom {
  id: string;
  participants: string[]; // [uid1, uid2]
  participantDetails: {
    [uid: string]: {
      name: string;
      phone: string;
      photoURL?: string;
    };
  };
  archivedBy?: string[]; // list of uids who archived this chat
  deletedFor?: string[]; // list of uids who deleted this chat
  lastMessageText?: string;
  lastMessageType?: 'text' | 'voice' | 'image' | 'call';
  lastMessageSenderId?: string;
  lastMessageCallStatus?: 'missed' | 'completed' | 'rejected' | 'busy';
  lastMessageCallType?: 'voice' | 'video';
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  roomId: string;
  senderId: string;
  senderName: string;
  type: 'text' | 'voice' | 'image' | 'call';
  text?: string;
  audioData?: string; // compressed base64 audio
  audioDuration?: number; // seconds
  imageData?: string; // compressed base64 image
  callInfo?: {
    callId?: string;
    callType?: 'voice' | 'video';
    status: 'missed' | 'completed' | 'rejected' | 'busy';
    duration?: number; // duration in seconds if connected
    callerId: string;
    receiverId: string;
  };
  createdAt: string;
}

export interface CallSession {
  id: string;
  callerId: string;
  callerName: string;
  callerPhone: string;
  callerPhoto?: string;
  receiverId: string;
  receiverName: string;
  receiverPhone: string;
  receiverPhoto?: string;
  callType?: 'voice' | 'video';
  status: 'ringing' | 'connected' | 'ended' | 'rejected' | 'busy';
  offer?: any;
  answer?: any;
  createdAt: string;
  endedAt?: string;
}
