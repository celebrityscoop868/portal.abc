import { auth, db, isFirebaseConfigured } from "./firebase.js";

import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  setPersistence,
  browserLocalPersistence,
  GoogleAuthProvider,
  signInWithPopup
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  doc, getDoc, setDoc, updateDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

// ✅ ADMIN EMAILS
const ADMIN_EMAILS = ['sunpcorporation@gmail.com'];

// ✅ PASOS DEFAULT
function createDefaultSteps() {
  return [
    { id: "shift_selection", label: "Shift Selection", done: false },
    { id: "footwear", label: "Safety Footwear", done: false },
    { id: "i9", label: "I-9 Verification Ready", done: false },
    { id: "photo_badge", label: "Photo Badge", done: false },
    { id: "firstday", label: "First Day Preparation", done: false }
  ];
}

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

// ✅ VERIFICAR ADMIN
export async function isAdminUser(user) {
  if (!user || !user.email) return false;
  return ADMIN_EMAILS.includes(user.email.toLowerCase());
}

// ✅ LOGIN EMAIL (solo admin)
export async function signInEmail(email, pass) {
  if (!isFirebaseConfigured()) throw new Error("Firebase not configured");
  
  await setPersistence(auth, browserLocalPersistence);
  const cred = await signInWithEmailAndPassword(auth, email, pass);
  
  const isAdmin = await isAdminUser(cred.user);
  if (!isAdmin) {
    throw new Error("Only admins can use email login");
  }
  
  return { user: cred.user, role: 'admin' };
}

// ✅ GOOGLE SIGN IN - FLUJO CORREGIDO
export async function signInGoogle() {
  if (!isFirebaseConfigured()) throw new Error("Firebase not configured");
  
  await setPersistence(auth, browserLocalPersistence);
  
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  
  // 1. Crear/autenticar usuario en Firebase Auth
  const cred = await signInWithPopup(auth, provider);
  const user = cred.user;
  
  // 2. Buscar si tiene ID pre-asignado en allowedEmployees (por email)
  const allowedRef = doc(db, "allowedEmployees", user.email.toLowerCase());
  const allowedSnap = await getDoc(allowedRef);
  
  // 3. Si NO está en allowedEmployees → rechazar
  if (!allowedSnap.exists()) {
    await signOut(auth); // Desloguear al usuario no autorizado
    return { notAuthorized: true, email: user.email };
  }
  
  const allowedData = allowedSnap.data();
  
  // 4. Si no está activo → rechazar
  if (allowedData.active !== true) {
    await signOut(auth);
    return { notAuthorized: true, email: user.email };
  }
  
  // 5. Verificar si ya existe en users
  const userRef = doc(db, "users", user.uid);
  const userSnap = await getDoc(userRef);
  
  // 6. Si ya existe y está verificado → login normal
  if (userSnap.exists() && userSnap.data()?.verified === true) {
    await updateDoc(userRef, { lastLoginAt: serverTimestamp() });
    return { user, role: 'employee', verified: true };
  }
  
  // 7. Primer login → necesita verificar ID
  return { 
    user, 
    role: 'employee', 
    needsVerification: true,
    employeeId: allowedData.employeeId
  };
}

// ✅ VERIFICAR ID DE EMPLEADO
export async function verifyEmployeeId(user, inputEmpId) {
  if (!user) throw new Error("Not authenticated");
  
  const empId = inputEmpId.toString().toUpperCase().trim();
  
  // Verificar que el ID coincida con el asignado
  const allowedRef = doc(db, "allowedEmployees", user.email.toLowerCase());
  const allowedSnap = await getDoc(allowedRef);
  
  if (!allowedSnap.exists()) {
    throw new Error("Email not registered");
  }
  
  const allowedData = allowedSnap.data();
  
  if (allowedData.employeeId !== empId) {
    throw new Error("Incorrect Employee ID");
  }
  
  // Crear documento de usuario verificado
  const userRef = doc(db, "users", user.uid);
  await setDoc(userRef, {
    uid: user.uid,
    email: user.email.toLowerCase(),
    fullName: user.displayName || allowedData.name || "",
    employeeId: empId,
    role: "employee",
    status: "active",
    verified: true,
    verifiedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
    lastLoginAt: serverTimestamp(),
    currentStep: 0,
    onboardingComplete: false,
    steps: createDefaultSteps()
  });
  
  // Marcar como verificado en allowedEmployees
  await updateDoc(allowedRef, {
    status: "verified",
    verifiedAt: serverTimestamp(),
    uid: user.uid
  });
  
  return { success: true, employeeId: empId };
}

export async function resetPassword(email) {
  if (!isFirebaseConfigured()) throw new Error("Firebase not configured");
  await sendPasswordResetEmail(auth, email);
}

export async function signOutNow() {
  if (!isFirebaseConfigured()) return;
  await signOut(auth);
}

export async function getCurrentUserEmail() {
  return auth?.currentUser?.email || "";
}

export async function getCurrentUserData() {
  const user = auth.currentUser;
  if (!user) return null;
  
  const userRef = doc(db, "users", user.uid);
  const snap = await getDoc(userRef);
  return snap.exists() ? snap.data() : null;
}
