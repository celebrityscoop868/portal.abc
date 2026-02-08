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
  } catch(e) {
    console.error("onAuth error:", e);
    cb(null);
    return () => {};
  }
}

async function ensureUserDoc(user) {
  if (!user || !isFirebaseConfigured()) return;

  const ref = doc(db, "users", user.uid);
  
  try {
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
      });
      console.log("✅ Nuevo usuario creado:", user.uid);
    } else {
      await setDoc(ref, patch, { merge: true });
      console.log("✅ Usuario actualizado:", user.uid);
    }
  } catch(e) {
    console.error("Error en ensureUserDoc:", e);
    throw e;
  }
}

export async function signInEmail(email, pass) {
  if (!isFirebaseConfigured()) throw new Error("Firebase not configured.");
  
  try {
    await setPersistence(auth, browserLocalPersistence);
    const cred = await signInWithEmailAndPassword(auth, email, pass);
    await ensureUserDoc(cred.user);
    return cred.user;
  } catch(e) {
    console.error("signInEmail error:", e);
    // Traducir errores comunes
    if (e.code === 'auth/user-not-found') throw new Error("Usuario no encontrado");
    if (e.code === 'auth/wrong-password') throw new Error("Contraseña incorrecta");
    if (e.code === 'auth/invalid-credential') throw new Error("Email o contraseña incorrectos");
    throw e;
  }
}

export async function registerEmail(email, pass) {
  if (!isFirebaseConfigured()) throw new Error("Firebase not configured.");
  
  try {
    await setPersistence(auth, browserLocalPersistence);
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    await ensureUserDoc(cred.user);
    return cred.user;
  } catch(e) {
    console.error("registerEmail error:", e);
    if (e.code === 'auth/email-already-in-use') throw new Error("Este email ya está registrado");
    throw e;
  }
}

export async function signInGoogle() {
  if (!isFirebaseConfigured()) throw new Error("Firebase not configured.");
  
  await setPersistence(auth, browserLocalPersistence);
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });

  try {
    const cred = await signInWithPopup(auth, provider);
    await ensureUserDoc(cred.user);
    return cred.user;
  } catch(e) {
    console.error("signInGoogle error:", e.code, e.message);
    if (e.code === "auth/popup-blocked") {
      throw new Error("Popup bloqueado. Permite ventanas emergentes para este sitio.");
    }
    if (e.code === "auth/cancelled-popup-request") {
      throw new Error("Inicio de sesión cancelado.");
    }
    throw e;
  }
}

export async function resetPassword(email) {
  if (!isFirebaseConfigured()) throw new Error("Firebase not configured.");
  await sendPasswordResetEmail(auth, email);
}

export async function signOutNow() {
  if (!isFirebaseConfigured()) return;
  await signOut(auth);
}

export async function getCurrentUserEmail() {
  return auth?.currentUser?.email || "";
}
