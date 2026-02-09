import { auth, db, isFirebaseConfigured } from "./firebase.js";

import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  setPersistence,
  browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  doc, getDoc, setDoc, updateDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

// ✅ ADMIN EMAILS WHITELIST
const ADMIN_EMAILS = ['sunpcorporation@gmail.com'];

// ✅ ESTRUCTURA DE 8 PASOS (se crea cuando empleado verifica su ID)
function createDefaultSteps() {
  return [
    { 
      id: "application", 
      label: "Application", 
      done: true, 
      completedAt: serverTimestamp(),
      locked: false 
    },
    { 
      id: "documents", 
      label: "Documents", 
      done: false,
      locked: false 
    },
    { 
      id: "i9", 
      label: "I-9 Verification", 
      done: false,
      locked: true 
    },
    { 
      id: "ppe", 
      label: "PPE Acknowledgment", 
      done: false,
      locked: true 
    },
    { 
      id: "safety_store", 
      label: "Safety Store", 
      done: false,
      locked: true 
    },
    { 
      id: "shift_selection", 
      label: "Shift Selection", 
      done: false,
      locked: true 
    },
    { 
      id: "photo_badge", 
      label: "Photo Badge", 
      done: false,
      locked: true 
    },
    { 
      id: "first_day", 
      label: "First Day", 
      done: false,
      locked: true 
    }
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

// ✅ LOGIN PRINCIPAL
export async function signInEmail(email, pass) {
  if (!isFirebaseConfigured()) throw new Error("Firebase not configured yet.");
  
  await setPersistence(auth, browserLocalPersistence);
  const cred = await signInWithEmailAndPassword(auth, email, pass);
  
  // Verificar si es admin
  const isAdmin = await isAdminUser(cred.user);
  
  if (isAdmin) {
    const adminRef = doc(db, "admins", cred.user.uid);
    await updateDoc(adminRef, { lastLoginAt: serverTimestamp() });
    return { user: cred.user, role: 'admin' };
  }
  
  // Es empleado - verificar estado
  const userRef = doc(db, "users", cred.user.uid);
  const snap = await getDoc(userRef);
  
  if (!snap.exists()) {
    throw new Error("Account not found. Contact HR.");
  }
  
  const userData = snap.data();
  
  // Actualizar lastLoginAt
  await updateDoc(userRef, { lastLoginAt: serverTimestamp() });
  
  // Verificar si está suspendido
  if (userData.status === "suspended") {
    throw new Error("Account suspended. Contact HR.");
  }
  
  return { 
    user: cred.user, 
    role: 'employee',
    status: userData.status,
    verified: userData.verified,
    employeeId: userData.employeeId
  };
}

// ✅ CREAR CUENTA DE EMPLEADO (SOLO ADMIN)
export async function createEmployeeAccount(email, password, fullName) {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error("Not authenticated");
  
  const isAdmin = await isAdminUser(currentUser);
  if (!isAdmin) throw new Error("Only admins can create accounts");
  
  // Crear usuario en Firebase Auth
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  
  // Crear documento en users (sin steps aún, sin employeeId)
  const userRef = doc(db, "users", cred.user.uid);
  await setDoc(userRef, {
    email: email,
    fullName: fullName || "",
    role: "employee",
    status: "pending",        // Pendiente hasta verificar ID
    verified: false,          // No verificado hasta ingresar ID
    employeeId: null,         // Admin lo asigna después
    currentStep: 0,
    onboardingComplete: false,
    steps: [],                // Vacío hasta verificación
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    lastLoginAt: serverTimestamp()
  });
  
  return cred.user;
}

// ✅ REGISTRO PÚBLICO - DESHABILITADO
export async function registerEmail(email, pass) {
  throw new Error("Self-registration is disabled. Contact HR for account creation.");
}

// ✅ GOOGLE SIGN IN - DESHABILITADO
export async function signInGoogle() {
  throw new Error("Google Sign In is disabled. Use your company credentials.");
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

// ✅ OBTENER RUTA DE REDIRECCIÓN
export async function getRedirectRoute(user) {
  if (!user) return './index.html';
  
  const isAdmin = await isAdminUser(user);
  if (isAdmin) return './admin.html';
  
  const userRef = doc(db, "users", user.uid);
  const snap = await getDoc(userRef);
  
  if (!snap.exists()) return './index.html';
  
  const data = snap.data();
  
  // Si no tiene ID asignado, esperando asignación
  if (!data.employeeId) {
    return './employee.html#wait';
  }
  
  // Si tiene ID pero no verificado, ir a verificación
  if (!data.verified) {
    return './employee.html#verify';
  }
  
  // Si onboarding completo
  if (data.onboardingComplete) {
    return './employee.html#home';
  }
  
  // Ir al paso actual
  return `./employee.html#progress`;
}

// ✅ VERIFICAR ID DE EMPLEADO (empleado ingresa ID asignado por admin)
export async function verifyEmployeeId(inputEmployeeId) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not authenticated");
  
  const userRef = doc(db, "users", user.uid);
  const userSnap = await getDoc(userRef);
  
  if (!userSnap.exists()) throw new Error("User not found");
  
  const userData = userSnap.data();
  
  // Verificar que coincida con el ID asignado por admin
  if (userData.employeeId !== inputEmployeeId) {
    throw new Error("Incorrect Employee ID. Please check with HR.");
  }
  
  // Verificar que el ID esté activo en allowedEmployees
  const allowedRef = doc(db, "allowedEmployees", inputEmployeeId);
  const allowedSnap = await getDoc(allowedRef);
  
  if (!allowedSnap.exists()) {
    throw new Error("Employee ID not recognized.");
  }
  
  const allowedData = allowedSnap.data();
  if (!allowedData.active) {
    throw new Error("This Employee ID is inactive.");
  }
  
  // Activar usuario y crear steps
  await updateDoc(userRef, {
    verified: true,
    status: "active",
    currentStep: 1,
    steps: createDefaultSteps(),
    updatedAt: serverTimestamp()
  });
  
  return true;
}

// ✅ OBTENER DATOS DEL USUARIO ACTUAL
export async function getCurrentUserData() {
  const user = auth.currentUser;
  if (!user) return null;
  
  const userRef = doc(db, "users", user.uid);
  const snap = await getDoc(userRef);
  return snap.exists() ? snap.data() : null;
}

// ✅ ACTUALIZAR PASO DEL ONBOARDING (con gating)
export async function updateOnboardingStep(stepIndex, stepData) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not authenticated");
  
  const userRef = doc(db, "users", user.uid);
  const snap = await getDoc(userRef);
  
  if (!snap.exists()) throw new Error("User not found");
  
  const data = snap.data();
  const steps = data.steps || [];
  
  if (stepIndex < 0 || stepIndex >= 8) throw new Error("Invalid step");
  
  // GATING: Verificar paso anterior (excepto paso 0)
  if (stepIndex > 0 && !steps[stepIndex - 1]?.done) {
    throw new Error("Complete the previous step first.");
  }
  
  // Actualizar paso
  steps[stepIndex] = { 
    ...steps[stepIndex], 
    ...stepData, 
    done: true,
    locked: false,
    completedAt: serverTimestamp()
  };
  
  // Desbloquear siguiente
  if (stepIndex < 7) {
    steps[stepIndex + 1].locked = false;
  }
  
  // Calcular progreso
  const completedSteps = steps.filter(s => s.done).length;
  const onboardingComplete = completedSteps === 8;
  const currentStep = onboardingComplete ? 8 : stepIndex + 1;
  
  await updateDoc(userRef, {
    steps: steps,
    currentStep: currentStep,
    onboardingComplete: onboardingComplete,
    updatedAt: serverTimestamp()
  });
  
  return { onboardingComplete, currentStep };
}

// ✅ ASIGNAR ID DE EMPLEADO (SOLO ADMIN)
export async function assignEmployeeId(targetUserId, employeeId) {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error("Not authenticated");
  
  const isAdmin = await isAdminUser(currentUser);
  if (!isAdmin) throw new Error("Admin only");
  
  // Verificar ID disponible
  const allowedRef = doc(db, "allowedEmployees", employeeId);
  const allowedSnap = await getDoc(allowedRef);
  
  if (!allowedSnap.exists()) {
    throw new Error("ID not found in pool.");
  }
  
  const allowedData = allowedSnap.data();
  if (allowedData.assignedTo) {
    throw new Error("ID already assigned.");
  }
  
  // Asignar a usuario
  const userRef = doc(db, "users", targetUserId);
  const userSnap = await getDoc(userRef);
  
  if (!userSnap.exists()) {
    throw new Error("User not found");
  }
  
  await updateDoc(userRef, {
    employeeId: employeeId,
    updatedAt: serverTimestamp()
  });
  
  await updateDoc(allowedRef, {
    assignedTo: targetUserId,
    assignedAt: serverTimestamp(),
    status: "assigned"
  });
  
  return true;
}

// ✅ OBTENER LISTA DE USUARIOS (SOLO ADMIN)
export async function getAllUsers() {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error("Not authenticated");
  
  const isAdmin = await isAdminUser(currentUser);
  if (!isAdmin) throw new Error("Admin only");
  
  // Nota: En producción, usar Cloud Function para esto
  // Por ahora, retornar vacío o implementar paginación
  return [];
}

// ✅ SUSPENDER/ACTIVAR USUARIO (SOLO ADMIN)
export async function setUserStatus(targetUserId, status) {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error("Not authenticated");
  
  const isAdmin = await isAdminUser(currentUser);
  if (!isAdmin) throw new Error("Admin only");
  
  const userRef = doc(db, "users", targetUserId);
  await updateDoc(userRef, {
    status: status,
    updatedAt: serverTimestamp()
  });
  
  return true;
}
