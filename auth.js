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

  const patch = {
    email: user.email || "",
    fullName: user.displayName || "",
    updatedAt: serverTimestamp(),
    lastLoginAt: serverTimestamp()
  };

  if (!snap.exists()) {
    await setDoc(ref, {
      ...patch,
      role: "employee",
      status: "active",
      createdAt: serverTimestamp()
    }, { merge: true });
  } else {
    await setDoc(ref, patch, { merge: true });
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
        "Popup blocked. On iPhone: Settings > Safari > Block Pop-ups = OFF, then try again. " +
        "Also make sure you tapped the button (not auto-redirect)."
      );
    }
    if (code === "auth/operation-not-supported-in-this-environment") {
      throw new Error("Google sign-in not supported in this browser. Open in Safari/Chrome (not inside an app).");
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
