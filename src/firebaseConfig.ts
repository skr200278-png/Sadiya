// Firebase configurations from environment variables or sandbox fallbacks
const isSandbox = (import.meta.env.VITE_FIREBASE_PROJECT_ID || "symbolic-seeker-84jp1") === "symbolic-seeker-84jp1";

export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyC-PgL1KU3gN4ioKSsFTUP849YYazGM0_k",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "symbolic-seeker-84jp1.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "symbolic-seeker-84jp1",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "symbolic-seeker-84jp1.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "650925107890",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:650925107890:web:d7599764efea87680637ab",
  firestoreDatabaseId: import.meta.env.VITE_FIREBASE_DATABASE_ID || (isSandbox ? "ai-studio-2f69f56c-6639-4bfc-bde6-fc2e4fe10b83" : "(default)")
};

export default firebaseConfig;
