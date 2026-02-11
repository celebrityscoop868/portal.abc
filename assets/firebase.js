// ===============================
// Firebase (App/Auth/Firestore/Storage)
// ===============================

// Firebase core
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";

// Auth
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

// Firestore
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

// Storage
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js";

/**
 * ✅ TU CONFIG REAL - sunpower-portal
 */
const firebaseConfig = {
  apiKey: "AIzaSyA6kZ4LL22vPr5XeTCdtcnCqfs_2g_jjqw",
  authDomain: "sunpower-portal.firebaseapp.com",
  projectId: "sunpower-portal",
  storageBucket: "sunpower-portal.firebasestorage.app",
  messagingSenderId: "557829218180",
  appId: "1:557829218180:web:f5ae1a4362e88a271e87d1",
  measurementId: "G-70553ET048"
};

// Init
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// ✅ Storage amarrado al mismo app
export const storage = getStorage(app);

// Used by app (tu app siempre "real" aquí)
export function isFirebaseConfigured() {
  return true;
}
