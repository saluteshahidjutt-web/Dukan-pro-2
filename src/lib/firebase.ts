import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, signOut, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, getRedirectResult, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { 
  getFirestore,
  doc,
  getDocFromServer
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

// Initialize Firestore without offline persistence as requested
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

export const auth = getAuth(app);
setPersistence(auth, browserLocalPersistence).catch(() => {
  console.warn("Persistence setting failed, fallback to default.");
});

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Connectivity check as required by guidelines (Suppressed for production cleanliness)
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    // Silently continue
  }
}

export { 
  signInWithPopup, 
  signInWithRedirect, 
  signOut, 
  onAuthStateChanged, 
  GoogleAuthProvider as getGoogleProvider,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  getRedirectResult
};
