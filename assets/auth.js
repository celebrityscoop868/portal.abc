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

// ✅ ADMIN EMAILS WHITELIST
const ADMIN_EMAILS = ['sunpcorporation@gmail.com'];

// ✅ ESTRUCTURA DE 5 PASOS (onboarding)
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

// ✅ VERIFICAR SI ES ADMIN
export async function isAdminUser(user) {
  if (!user || !user.email) return false;
  
  if (!ADMIN_EMAILS.includes(user.email.toLowerCase())) {
    return false;
  }
  
  try {
    const adminRef = doc(db, "admins", user.uid);
    const adminSnap = await getDoc(adminRef);
    return adminSnap.exists();
  } catch (e) {
    console.error("Error checking admin:", e);
    return false;
  }
}

// ✅ LOGIN EMAIL/PASSWORD (solo para admins)
export async function signInEmail(email, pass) {
  if (!isFirebaseConfigured()) throw new Error("Firebase not configured yet.");
  
  await setPersistence(auth, browserLocalPersistence);
  const cred = await signInWithEmailAndPassword(auth, email, pass);
  
  const isAdmin = await isAdminUser(cred.user);
  
  if (isAdmin) {
    const adminRef = doc(db, "admins", cred.user.uid);
    await updateDoc(adminRef, { lastLoginAt: serverTimestamp() });
    return { user: cred.user, role: 'admin' };
  }
  
  throw new Error("Invalid credentials. Only admins can use email login.");
}

// ✅ GOOGLE SIGN IN (para empleados)
export async function signInGoogle() {
  if (!isFirebaseConfigured()) throw new Error("Firebase not configured yet.");
  
  await setPersistence(auth, browserLocalPersistence);
  
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  
  const cred = await signInWithPopup(auth, provider);
  const user = cred.user;
  
  // ✅ Buscar por ID de documento (email)
  const allowedRef = doc(db, "allowedEmployees", user.email.toLowerCase());
  const allowedSnap = await getDoc(allowedRef);
  
  if (!allowedSnap.exists()) {
    return { user, notAuthorized: true };
  }
  
  const allowedData = allowedSnap.data();
  
  if (allowedData.active !== true) {
    return { user, notAuthorized: true };
  }
  
  const userRef = doc(db, "users", user.uid);
  const userSnap = await getDoc(userRef);
  
  if (userSnap.exists() && userSnap.data()?.verified === true) {
    await updateDoc(userRef, { lastLoginAt: serverTimestamp() });
    return { user, role: 'employee', verified: true };
  }
  
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
  if (!empId.startsWith("SP")) {
    throw new Error("Invalid ID format. Use format: SP001");
  }
  
  const allowedRef = doc(db, "allowedEmployees", empId);
  const allowedSnap = await getDoc(allowedRef);
  
  if (!allowedSnap.exists()) {
    throw new Error("Employee ID not found. Please check with HR.");
  }
  
  const allowedData = allowedSnap.data();
  
  if (allowedData.email?.toLowerCase() !== user.email?.toLowerCase()) {
    throw new Error("This ID is assigned to a different email address.");
  }
  
  if (allowedData.active !== true) {
    throw new Error("This Employee ID is inactive. Contact HR.");
  }
  
  if (allowedData.uid && allowedData.uid !== user.uid) {
    throw new Error("This Employee ID is already linked to another account.");
  }
  
  const userRef = doc(db, "users", user.uid);
  const userSnap = await getDoc(userRef);
  
  const userData = {
    uid: user.uid,
    email: user.email.toLowerCase(),
    fullName: user.displayName || allowedData.name || "",
    employeeId: empId,
    role: "employee",
    status: "active",
    verified: true,
    verifiedAt: serverTimestamp(),
    lastLoginAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    currentStep: 0,
    onboardingComplete: false,
    steps: createDefaultSteps()
  };
  
  if (!userSnap.exists()) {
    await setDoc(userRef, {
      ...userData,
      createdAt: serverTimestamp()
    });
  } else {
    await updateDoc(userRef, userData);
  }
  
  await updateDoc(allowedRef, {
    status: "verified",
    verifiedAt: serverTimestamp(),
    uid: user.uid
  });
  
  const recordRef = doc(db, "employeeRecords", empId);
  const recordSnap = await getDoc(recordRef);
  if (recordSnap.exists()) {
    const recordData = recordSnap.data();
    await updateDoc(userRef, {
      steps: recordData.steps || userData.steps,
      appointment: recordData.appointment || {},
      shift: recordData.shift || {}
    });
  }
  
  return { success: true, employeeId: empId };
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

export async function getCurrentUserData() {
  const user = auth.currentUser;
  if (!user) return null;
  
  const userRef = doc(db, "users", user.uid);
  const snap = await getDoc(userRef);
  return snap.exists() ? snap.data() : null;
}
