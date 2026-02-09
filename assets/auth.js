import { auth, db } from "./firebase.js";
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
  doc, getDoc, setDoc, serverTimestamp, updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

// ✅ ADMIN EMAILS WHITELIST - SOLO ESTOS SON ADMINS
const ADMIN_EMAILS = ['sunpcorporation@gmail.com'];

export async function authReady() {
  return true;
}

export function onAuth(cb) {
  return onAuthStateChanged(auth, cb);
}

// ✅ VERIFICAR SI USUARIO ES ADMIN (por email whitelist)
export async function isAdminUser(user) {
  if (!user || !user.email) return false;
  
  // Verificar en whitelist
  if (!ADMIN_EMAILS.includes(user.email.toLowerCase())) {
    return false;
  }
  
  // Verificar en Firestore (doble seguridad)
  try {
    const adminRef = doc(db, "admins", user.uid);
    const adminSnap = await getDoc(adminRef);
    return adminSnap.exists();
  } catch (e) {
    console.error("Error checking admin:", e);
    return false;
  }
}

// ✅ CREAR USUARIO COMO EMPLEADO (nunca admin)
async function ensureUserDoc(user, isNew = false) {
  if (!user) return;

  const userRef = doc(db, "users", user.uid);
  const snap = await getDoc(userRef);

  const baseData = {
    email: user.email || "",
    fullName: user.displayName || "",
    updatedAt: serverTimestamp(),
    lastLoginAt: serverTimestamp(),
    role: "employee", // ✅ SIEMPRE employee por defecto
    status: "active",
    onboardingComplete: false,
    currentStep: 1, // Paso actual del onboarding
    steps: {
      application: { done: true, completedAt: serverTimestamp() }, // Auto-completado
      documents: { done: false },
      i9: { done: false },
      ppe: { done: false, version: null },
      safetyStore: { done: false, orderId: null },
      shiftSelection: { done: false },
      photoBadge: { done: false },
      firstDay: { done: false }
    }
  };

  if (!snap.exists()) {
    // Nuevo usuario
    await setDoc(userRef, {
      ...baseData,
      createdAt: serverTimestamp(),
      employeeId: null, // ✅ Sin ID asignado inicialmente
      verified: false
    });
  } else {
    // Actualizar login
    const existing = snap.data();
    await updateDoc(userRef, {
      lastLoginAt: serverTimestamp(),
      email: user.email || existing.email,
      fullName: user.displayName || existing.fullName
    });
  }
}

// ✅ LOGIN CON EMAIL (con verificación de paso actual)
export async function signInEmail(email, pass) {
  await setPersistence(auth, browserLocalPersistence);
  const cred = await signInWithEmailAndPassword(auth, email, pass);
  
  // Verificar si es admin
  const isAdmin = await isAdminUser(cred.user);
  
  if (isAdmin) {
    // Crear/actualizar doc admin si no existe
    const adminRef = doc(db, "admins", cred.user.uid);
    const adminSnap = await getDoc(adminRef);
    if (!adminSnap.exists()) {
      await setDoc(adminRef, {
        email: cred.user.email,
        createdAt: serverTimestamp(),
        lastLoginAt: serverTimestamp()
      });
    } else {
      await updateDoc(adminRef, { lastLoginAt: serverTimestamp() });
    }
    return { user: cred.user, role: 'admin' };
  }
  
  // Es empleado
  await ensureUserDoc(cred.user);
  return { user: cred.user, role: 'employee' };
}

// ✅ REGISTRO (solo empleados)
export async function registerEmail(email, pass) {
  // ✅ BLOQUEAR registro de emails admin
  if (ADMIN_EMAILS.includes(email.toLowerCase())) {
    throw new Error("This email is reserved. Please contact IT support.");
  }
  
  await setPersistence(auth, browserLocalPersistence);
  const cred = await createUserWithEmailAndPassword(auth, email, pass);
  await ensureUserDoc(cred.user, true);
  return { user: cred.user, role: 'employee' };
}

// ✅ GOOGLE SIGN IN (deshabilitado temporalmente hasta arreglar dominios)
export async function signInGoogle() {
  throw new Error("Google Sign In temporarily disabled. Please use email/password.");
  
  /* Cuando arregles el dominio, descomenta esto:
  await setPersistence(auth, browserLocalPersistence);
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  
  const cred = await signInWithPopup(auth, provider);
  
  // Verificar si es admin
  const isAdmin = await isAdminUser(cred.user);
  
  if (isAdmin) {
    return { user: cred.user, role: 'admin' };
  }
  
  await ensureUserDoc(cred.user);
  return { user: cred.user, role: 'employee' };
  */
}

export async function resetPassword(email) {
  await sendPasswordResetEmail(auth, email);
}

export async function signOutNow() {
  await signOut(auth);
}

export async function getCurrentUserEmail() {
  return auth?.currentUser?.email || "";
}

// ✅ OBTENER RUTA DE REDIRECCIÓN SEGÚN ROL Y ESTADO
export async function getRedirectRoute(user) {
  if (!user) return './index.html';
  
  const isAdmin = await isAdminUser(user);
  if (isAdmin) return './admin.html';
  
  // Es empleado - verificar onboarding
  const userRef = doc(db, "users", user.uid);
  const snap = await getDoc(userRef);
  
  if (!snap.exists()) return './index.html';
  
  const data = snap.data();
  
  // Si no tiene ID asignado, ir a verificación
  if (!data.employeeId || !data.verified) {
    return './employee.html#verify';
  }
  
  // Si onboarding completo, ir a home
  if (data.onboardingComplete) {
    return './employee.html#home';
  }
  
  // Ir al paso actual
  return `./employee.html#progress`;
}
