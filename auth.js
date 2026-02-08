import { auth, db, isFirebaseConfigured } from "./firebase.js";

import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  sendPasswordResetEmail,
  signOut,
  setPersistence,
  browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  doc, getDoc, setDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

export async function authReady() {
  return isFirebaseConfigured();
}

export function onAuth(cb) {
  try {
    return onAuthStateChanged(auth, cb);
  } catch {
    cb(null);
    return () => {};
  }
}

async function ensureUserDoc(user) {
  if (!user || !isFirebaseConfigured()) return;

  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);

  const baseData = {
    email: user.email || "",
    fullName: user.displayName || "",
    role: "employee",
    status: "active",
    stage: "shift_selection",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    lastLoginAt: serverTimestamp(),
    steps: [
      { id: "shift_selection", label: "Shift Selection", done: false },
      { id: "footwear", label: "Safety Footwear", done: false },
      { id: "i9", label: "I-9 Verification Ready", done: false },
      { id: "photo_badge", label: "Photo Badge", done: false },
      { id: "firstday", label: "First Day Preparation", done: false }
    ],
    appointment: {},
    shift: {},
    footwear: {},
    i9: {},
    notifications: []
  };

  if (!snap.exists()) {
    await setDoc(ref, baseData);
  } else {
    const existing = snap.data();
    await setDoc(ref, {
      email: user.email || existing.email || "",
      fullName: user.displayName || existing.fullName || "",
      updatedAt: serverTimestamp(),
      lastLoginAt: serverTimestamp()
    }, { merge: true });
  }
}

export async function signInEmail(email, pass) {
  if (!isFirebaseConfigured()) throw new Error("Firebase not configured yet.");
  await setPersistence(auth, browserLocalPersistence);

  const cred = await signInWithEmailAndPassword(auth, email, pass);
  await ensureUserDoc(cred.user);
  return cred.user;
}

export async function registerEmail(email, pass) {
  if (!isFirebaseConfigured()) throw new Error("Firebase not configured yet.");
  await setPersistence(auth, browserLocalPersistence);

  const cred = await createUserWithEmailAndPassword(auth, email, pass);
  await ensureUserDoc(cred.user);
  return cred.user;
}

export async function signInGoogle() {
  if (!isFirebaseConfigured()) throw new Error("Firebase not configured yet.");
  await setPersistence(auth, browserLocalPersistence);

  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });

  try {
    const cred = await signInWithPopup(auth, provider);
    await ensureUserDoc(cred.user);
    return cred.user;
  } catch (e) {
    const code = e?.code || "";
    if (code === "auth/popup-blocked" || code === "auth/cancelled-popup-request") {
      throw new Error(
        "Popup blocked. On iPhone: Settings > Safari > Block Pop-ups = OFF, then try again."
      );
    }
    if (code === "auth/operation-not-supported-in-this-environment") {
      throw new Error("Google sign-in not supported in this browser. Open in Safari/Chrome.");
    }
    throw e;
  }
}

export async function resetPassword(email) {
  if (!isFirebaseConfigured()) throw new Error("Firebase not configured yet.");
  await sendPasswordResetEmail(auth, email);
}

export async function signOutNow() {
  if (!isFirebaseConfigured()) return;
  await signOut(auth);
}

export async function getCurrentUserEmail() {
  return auth?.currentUser?.email || "";
}
