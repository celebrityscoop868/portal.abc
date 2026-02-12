// ===============================
// Admin Portal Logic
// ===============================

import { db, isFirebaseConfigured } from "./firebase.js";
import { auth, signOutNow } from "./auth.js";
import {
  doc, getDoc, setDoc, updateDoc, onSnapshot, deleteDoc,
  serverTimestamp, collection, addDoc, query, where, orderBy, getDocs
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

let currentEmpId = null;
let currentEmpData = null;

// Helper functions
function normalizeEmpId(input) {
  if (!input) return "";
  let v = input.toString().toUpperCase().trim();
  v = v.replace(/[\s-_]/g, "");
  if (!v.startsWith("SP")) return "";
  const nums = v.slice(2);
  if (!/^\d+$/.test(nums)) return "";
  return "SP" + nums;
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('show');
  }, 10);

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ✅ VERIFICACIÓN DE ADMIN - NUEVA FUNCIÓN
async function checkAdminAccess() {
  return new Promise((resolve, reject) => {
    auth.onAuthStateChanged(async (user) => {
      if (!user) {
        reject(new Error('Not authenticated'));
        return;
      }

      try {
        // Verificar si es admin por email
        const adminsQuery = query(
          collection(db, "admins"), 
          where("email", "==", user.email)
        );
        const adminsSnap = await getDocs(adminsQuery);
        
        if (!adminsSnap.empty) {
          const adminDoc = adminsSnap.docs[0];
          const adminData = adminDoc.data();
          if (adminData.role === "admin" || adminData.isAdmin === true) {
            resolve(true);
            return;
          }
        }
        
        reject(new Error('Not authorized as admin'));
      } catch (e) {
        reject(e);
      }
    });
  });
}

// Load employee data
async function loadEmployee(empId) {
  if (!isFirebaseConfigured()) {
    showToast('Firebase not configured', 'error');
    return;
  }

  currentEmpId = normalizeEmpId(empId);
  if (!currentEmpId) {
    showToast('Invalid Employee ID format', 'error');
    return;
  }

  const badge = document.getElementById('currentEmpBadge');
  badge.textContent = currentEmpId;
  badge.classList.add('active');

  // Load from Firestore
  const ref = doc(db, "employeeRecords", currentEmpId);
  const snap = await getDoc(ref);

  if (snap.exists()) {
    currentEmpData = snap.data();
    populateFields(currentEmpData);
    showToast(`Loaded ${currentEmpId}`, 'success');
  } else {
    // Create new record
    currentEmpData = {
      employeeId: currentEmpId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };
    await setDoc(ref, currentEmpData);
    populateFields(currentEmpData);
    showToast(`Created new record for ${currentEmpId}`, 'info');
  }

  // Setup real-time listener
  onSnapshot(ref, (doc) => {
    if (doc.exists()) {
      currentEmpData = doc.data();
      populateFields(currentEmpData);
    }
  });
}

function populateFields(data) {
  // Profile
  document.getElementById('profFirstName').value = data.profile?.firstName || '';
  document.getElementById('profLastName').value = data.profile?.lastName || '';
  document.getElementById('profDOB').value = data.profile?.dob || '';
  document.getElementById('profPhone').value = data.profile?.phone || '';
  document.getElementById('profAddress').value = data.profile?.address || '';
  document.getElementById('profCity').value = data.profile?.city || '';
  document.getElementById('profStateZip').value = data.profile?.stateZip || '';

  // Appointment
  document.getElementById('apptDate').value = data.appointment?.date || '';
  document.getElementById('apptTime').value = data.appointment?.time || '';
  document.getElementById('apptAddress').value = data.appointment?.address || '';
  document.getElementById('apptNotes').value = data.appointment?.notes || '';

  // Shift
  updateShiftUI(data.shift);
}

function updateShiftUI(shift) {
  const pendingDiv = document.getElementById('shiftPending');
  const approvedDiv = document.getElementById('shiftApproved');
  const noneDiv = document.getElementById('shiftNone');

  if (!shift || !shift.position) {
    pendingDiv.style.display = 'none';
    approvedDiv.style.display = 'none';
    noneDiv.style.display = 'block';
    return;
  }

  if (shift.approved) {
    pendingDiv.style.display = 'none';
    approvedDiv.style.display = 'block';
    noneDiv.style.display = 'none';
  } else {
    pendingDiv.style.display = 'block';
    approvedDiv.style.display = 'none';
    noneDiv.style.display = 'none';

    document.getElementById('shiftPosition').textContent = shift.position;
    document.getElementById('shiftTime').textContent = shift.shift;
    document.getElementById('shiftDate').textContent = shift.submittedAt ?
      new Date(shift.submittedAt.toDate()).toLocaleDateString() : 'Pending';
  }
}

// Save functions
async function saveProfile() {
  if (!currentEmpId) return;

  const ref = doc(db, "employeeRecords", currentEmpId);
  const profile = {
    firstName: document.getElementById('profFirstName').value,
    lastName: document.getElementById('profLastName').value,
    dob: document.getElementById('profDOB').value,
    phone: document.getElementById('profPhone').value,
    address: document.getElementById('profAddress').value,
    city: document.getElementById('profCity').value,
    stateZip: document.getElementById('profStateZip').value
  };

  await updateDoc(ref, {
    profile,
    updatedAt: serverTimestamp()
  });
  showToast('Profile saved', 'success');
}

async function saveAppointment() {
  if (!currentEmpId) return;

  const ref = doc(db, "employeeRecords", currentEmpId);
  const appointment = {
    date: document.getElementById('apptDate').value,
    time: document.getElementById('apptTime').value,
    address: document.getElementById('apptAddress').value,
    notes: document.getElementById('apptNotes').value
  };

  await updateDoc(ref, {
    appointment,
    updatedAt: serverTimestamp()
  });

  document.getElementById('apptSuccess').style.display = 'block';
  setTimeout(() => {
    document.getElementById('apptSuccess').style.display = 'none';
  }, 3000);

  showToast('Appointment saved', 'success');
}

async function approveShift(approved) {
  if (!currentEmpId) return;

  const ref = doc(db, "employeeRecords", currentEmpId);
  await updateDoc(ref, {
    'shift.approved': approved,
    'shift.status': approved ? 'approved' : 'rejected',
    'shift.approvedAt': serverTimestamp(),
    updatedAt: serverTimestamp()
  });

  showToast(approved ? 'Shift approved' : 'Change requested', 'success');
}

async function sendNotification() {
  if (!currentEmpId) return;

  const title = document.getElementById('notifTitle').value;
  const body = document.getElementById('notifBody').value;
  const type = document.getElementById('notifType').value;

  if (!title || !body) {
    showToast('Please fill in all fields', 'error');
    return;
  }

  const ref = doc(db, "employeeRecords", currentEmpId);
  const notification = {
    title,
    body,
    type,
    createdAt: serverTimestamp(),
    read: false
  };

  // Import arrayUnion dynamically
  const { arrayUnion } = await import("https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js");
  
  await updateDoc(ref, {
    notifications: arrayUnion(notification),
    updatedAt: serverTimestamp()
  });

  showToast('Notification sent', 'success');
  document.getElementById('notifTitle').value = '';
  document.getElementById('notifBody').value = '';
}

// ID Pool Management
async function loadIdPool() {
  const list = document.getElementById('allEmployeesList');
  list.innerHTML = '<div style="text-align:center;padding:20px;">Loading...</div>';

  const q = query(collection(db, "allowedEmployees"), orderBy("employeeId"));
  const snap = await getDocs(q);

  if (snap.empty) {
    list.innerHTML = '<div style="text-align:center;padding:20px;color:#6b7280;">No employees registered</div>';
    return;
  }

  let html = '<div style="display:flex;flex-direction:column;gap:8px;">';
  snap.forEach(doc => {
    const d = doc.data();
    html += `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:12px;border:1px solid #e5e7eb;border-radius:8px;">
        <div>
          <div style="font-weight:600;">${d.employeeId}</div>
          <div style="font-size:12px;color:#6b7280;">${d.fullName || 'No name'} ${d.email ? `• ${d.email}` : ''}</div>
        </div>
        <div style="display:flex;gap:8px;">
          <span style="padding:4px 8px;border-radius:4px;font-size:12px;font-weight:500;background:${d.active ? '#dcfce7;color:#166534' : '#fee2e2;color:#991b1b'}">
            ${d.active ? 'Active' : 'Inactive'}
          </span>
        </div>
      </div>
    `;
  });
  html += '</div>';
  list.innerHTML = html;
}

// Add new employee to allowed list
window.addNewEmployee = async function() {
  const empId = normalizeEmpId(document.getElementById('newEmpId').value);
  const fullName = document.getElementById('newEmpName').value.trim();
  const email = document.getElementById('newEmpEmail').value.trim();

  if (!empId) {
    showToast('Invalid Employee ID format (SP###)', 'error');
    return;
  }

  if (!fullName) {
    showToast('Please enter a name', 'error');
    return;
  }

  // Check if exists
  const existing = await getDoc(doc(db, "allowedEmployees", empId));
  if (existing.exists()) {
    showToast('Employee ID already exists', 'error');
    return;
  }

  await setDoc(doc(db, "allowedEmployees", empId), {
    employeeId: empId,
    fullName,
    email: email || null,
    active: true,
    createdAt: serverTimestamp()
  });

  showToast('Employee added successfully', 'success');
  document.getElementById('newEmpId').value = '';
  document.getElementById('newEmpName').value = '';
  document.getElementById('newEmpEmail').value = '';

  loadIdPool();
};

// Tab switching
function setupTabs() {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));

      tab.classList.add('active');
      const tabId = tab.dataset.tab;
      document.getElementById(`tab-${tabId}`)?.classList.add('active');

      if (tabId === 'manage') {
        loadIdPool();
      }
    });
  });
}

// Initialize
export async function initAdminApp() {
  try {
    // Verificar acceso de admin primero
    await checkAdminAccess();
  } catch (e) {
    showToast('Access denied: ' + e.message, 'error');
    // Redirigir a login después de 2 segundos
    setTimeout(() => {
      window.location.href = './index.html';
    }, 2000);
    return;
  }

  // Setup event listeners
  document.getElementById('btnLoadEmp')?.addEventListener('click', () => {
    const id = document.getElementById('currentEmpId').value;
    loadEmployee(id);
  });

  document.getElementById('btnSaveProfile')?.addEventListener('click', saveProfile);
  document.getElementById('btnSaveAppt')?.addEventListener('click', saveAppointment);
  document.getElementById('btnClearAppt')?.addEventListener('click', () => {
    document.getElementById('apptDate').value = '';
    document.getElementById('apptTime').value = '';
    document.getElementById('apptAddress').value = '';
    document.getElementById('apptNotes').value = '';
  });

  document.getElementById('btnApproveShift')?.addEventListener('click', () => approveShift(true));
  document.getElementById('btnRejectShift')?.addEventListener('click', () => approveShift(false));
  document.getElementById('btnSendNotif')?.addEventListener('click', sendNotification);

  setupTabs();

  // Check auth
  if (!isFirebaseConfigured()) {
    showToast('Warning: Firebase not configured', 'error');
    return;
  }
}
