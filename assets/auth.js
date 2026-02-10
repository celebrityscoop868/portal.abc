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
  doc, getDoc, setDoc, updateDoc, serverTimestamp, collection, query, where, getDocs
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

// ✅ PASOS DEFAULT
function createDefaultSteps() {
  return [
    { id: "shift_selection", label: "Shift Selection", done: false, locked: false },
    { id: "footwear", label: "Safety Footwear", done: false, locked: true },
    { id: "i9", label: "I-9 Verification Ready", done: false, locked: true },
    { id: "photo_badge", label: "Photo Badge", done: false, locked: true },
    { id: "firstday", label: "First Day Preparation", done: false, locked: true }
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

// ✅ VERIFICAR SI ES ADMIN (busca en colección admins por UID)
export async function isAdminUser(user) {
  if (!user || !user.uid) return false;
  
  try {
    const adminRef = doc(db, "admins", user.uid);
    const adminSnap = await getDoc(adminRef);
    return adminSnap.exists();
  } catch (error) {
    console.error("Error checking admin:", error);
    return false;
  }
}

// ✅ LOGIN EMAIL (solo para admins)
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

// ✅ BUSCAR EMPLEADO POR EMAIL en allowedEmployees
async function findAllowedEmployeeByEmail(email) {
  const emailLower = email.toLowerCase().trim();
  
  // Query por campo email
  const q = query(collection(db, "allowedEmployees"), where("email", "==", emailLower));
  const querySnap = await getDocs(q);
  
  if (!querySnap.empty) {
    const doc = querySnap.docs[0];
    return { id: doc.id, data: doc.data() };
  }
  
  return null;
}

// ✅ BUSCAR EMPLEADO POR ID en allowedEmployees
async function findAllowedEmployeeById(empId) {
  const empIdUpper = empId.toString().toUpperCase().trim();
  
  const allowedRef = doc(db, "allowedEmployees", empIdUpper);
  const allowedSnap = await getDoc(allowedRef);
  
  if (allowedSnap.exists()) {
    return { id: empIdUpper, data: allowedSnap.data() };
  }
  
  return null;
}

// ✅ GOOGLE SIGN IN - FLUJO CORREGIDO
export async function signInGoogle() {
  if (!isFirebaseConfigured()) throw new Error("Firebase not configured");
  
  await setPersistence(auth, browserLocalPersistence);
  
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  
  try {
    // 1. Autenticar con Google
    const cred = await signInWithPopup(auth, provider);
    const user = cred.user;
    
    console.log("✅ Google auth success:", user.email);
    
    // 2. Verificar si es admin primero
    const isAdmin = await isAdminUser(user);
    if (isAdmin) {
      console.log("✅ Admin user detected");
      return { user, role: 'admin', isAdmin: true };
    }
    
    // 3. Buscar si el email está en allowedEmployees
    const allowedEmployee = await findAllowedEmployeeByEmail(user.email);
    
    // 4. Si NO está en allowedEmployees → mostrar gate (no hacer signOut)
    if (!allowedEmployee) {
      console.log("⚠️ Email not in allowedEmployees:", user.email);
      return { 
        user, 
        role: 'employee', 
        needsVerification: true,
        notRegistered: true,
        email: user.email 
      };
    }
    
    const allowedData = allowedEmployee.data;
    console.log("✅ Found allowedEmployee:", allowedData);
    
    // 5. Si no está activo → mostrar gate (no rechazar)
    if (allowedData.active !== true) {
      console.log("⚠️ Employee not active");
      return { 
        user, 
        role: 'employee', 
        needsVerification: true,
        notActive: true,
        email: user.email 
      };
    }
    
    // 6. Verificar si ya existe en users (ya verificó antes)
    const userRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userRef);
    
    if (userSnap.exists()) {
      const userData = userSnap.data();
      if (userData.verified === true && userData.employeeId) {
        // Ya está verificado, entrar directo
        console.log("✅ Returning verified user");
        return { user, role: 'employee', verified: true, data: userData };
      }
    }
    
    // 7. Primer login o no verificado → mostrar gate
    console.log("⚠️ Needs verification");
    return { 
      user, 
      role: 'employee', 
      needsVerification: true,
      employeeId: allowedData.employeeId,
      email: user.email,
      name: allowedData.name || user.displayName || ""
    };
    
  } catch (error) {
    console.error("❌ Google sign in error:", error);
    throw error;
  }
}

// ✅ VERIFICAR ID DE EMPLEADO (desde el gate)
export async function verifyEmployeeId(user, inputEmpId) {
  if (!user) throw new Error("Not authenticated");
  
  const empId = inputEmpId.toString().toUpperCase().trim();
  
  // Buscar el ID en allowedEmployees
  const allowedEmployee = await findAllowedEmployeeById(empId);
  
  if (!allowedEmployee) {
    throw new Error("Employee ID not found. Please check your ID or contact HR.");
  }
  
  const allowedData = allowedEmployee.data;
  
  // Verificar que el email coincida
  if (allowedData.email && allowedData.email.toLowerCase() !== user.email.toLowerCase()) {
    throw new Error("This ID is registered to a different email address.");
  }
  
  // Verificar que esté activo
  if (allowedData.active !== true) {
    throw new Error("This account is not active. Contact HR for assistance.");
  }
  
  // Crear/actualizar documento en users
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
    updatedAt: serverTimestamp(),
    lastLoginAt: serverTimestamp(),
    currentStep: 0,
    onboardingComplete: false,
    steps: createDefaultSteps()
  };
  
  if (!userSnap.exists()) {
    // Crear nuevo usuario
    await setDoc(userRef, {
      ...userData,
      createdAt: serverTimestamp()
    });
  } else {
    // Actualizar existente
    await updateDoc(userRef, userData);
  }
  
  // Actualizar allowedEmployees
  const allowedRef = doc(db, "allowedEmployees", empId);
  await updateDoc(allowedRef, {
    status: "verified",
    verifiedAt: serverTimestamp(),
    assignedTo: user.uid,
    verifiedEmail: user.email.toLowerCase()
  });
  
  console.log("✅ Employee verified successfully:", empId);
  return { success: true, employeeId: empId, data: userData };
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

// ✅ DEBUG
export async function debugAuthState() {
  const user = auth.currentUser;
  console.log("Current user:", user?.email || "none");
  console.log("UID:", user?.uid || "none");
  return { user: user?.email || null, uid: user?.uid || null };
}
