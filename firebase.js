import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyA6kZ4LL22vPr5XeTCdtcnCqfs_2g_jjqw",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "sunpower-portal.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "sunpower-portal",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "sunpower-portal.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "557829218180",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:557829218180:web:f5ae1a4362e88a271e87d1",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-70553ET048"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

export function isFirebaseConfigured() {
  return true;
}
