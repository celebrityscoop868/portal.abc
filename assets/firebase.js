// ===============================
// Firebase - SINGLE SOURCE OF TRUTH
// ===============================

import { initializeApp, getApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js";

/**
 * ✅ CONFIGURACIÓN REAL - sunpower-portal
 */
const firebaseConfig = {
  apiKey: "AIzaSyA6kZ4LL22vPr5XeTCdtcnCqfs_2g_jjqw",
  authDomain: "sunpower-portal.firebaseapp.com",
  projectId: "sunpower-portal",
  storageBucket: "sunpower-portal.appspot.com",
  messagingSenderId: "557829218180",
  appId: "1:557829218180:web:f5ae1a4362e88a271e87d1",
  measurementId: "G-70553ET048"
};

// Initialize Firebase only once
let app;
try {
  app = getApp(); // Try to get existing app
} catch (e) {
  app = initializeApp(firebaseConfig); // Initialize if doesn't exist
}

// Initialize services
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();

// ✅ Always returns true since we have real credentials
export function isFirebaseConfigured() {
  return true;
}

// Configure Google Provider
googleProvider.setCustomParameters({
  prompt: 'select_account'
});
