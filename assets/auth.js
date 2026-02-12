// ===============================
// Auth Functions
// ===============================

import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  signInWithPopup,
  signOut,
  sendPasswordResetEmail,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import { auth, googleProvider } from "./firebase.js";

// Email/Password Sign In
export async function signInEmail(email, password) {
  return signInWithEmailAndPassword(auth, email, password);
}

// Email/Password Register
export async function registerEmail(email, password) {
  return createUserWithEmailAndPassword(auth, email, password);
}

// Google Sign In
export async function signInGoogle() {
  return signInWithPopup(auth, googleProvider);
}

// Sign Out
export async function signOutNow() {
  return signOut(auth);
}

// Reset Password
export async function resetPassword(email) {
  return sendPasswordResetEmail(auth, email);
}

// Auth State Observer
export function onAuth(callback) {
  return onAuthStateChanged(auth, callback);
}

// Wait for auth to be ready
export function authReady() {
  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, () => {
      unsubscribe();
      resolve(true);
    }, () => {
      resolve(false);
    });
  });
}

export { auth };
