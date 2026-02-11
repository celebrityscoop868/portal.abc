// SunPower Admin Portal - 100% FUNCIONAL
import { db, isFirebaseConfigured } from "./firebase.js";
import { 
    doc, getDoc, setDoc, updateDoc, deleteDoc,
    collection, query, where, getDocs, onSnapshot,
    serverTimestamp, arrayUnion, deleteField
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

// ==================== VARIABLES GLOBALES ====================
let currentEmpId = null;
let chatUnsubscribe = null;

// ==================== UTILIDADES ====================
function $(id) { return document.getElementById(id); }

function normalizeEmpId(input) {
    if (!input) return "";
    let v = input.toString().toUpperCase().trim().replace(/[\s-_]/g, "");
    if (!v.startsWith("SP")) return "";
    const nums = v.slice(2);
    if (!/^\d+$/.test(nums)) return "";
    return "SP" + nums.padStart(3, '0');
}

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

function showToast(message, type = 'info') {
    const container = $('toastContainer');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ==================== EMPLEADO ACTUAL ====================
async function loadCurrentEmployee() {
    const input = $('currentEmpId');
    const empId = normalizeEmpId(input?.value);
    
    if (!empId) {
        showToast('Invalid ID format. Use: SP001', 'error');
        return;
    }
    
    try {
        const empDoc = await getDoc(doc(db, "allowedEmployees", empId));
        if (!empDoc.exists()) {
            showToast(`Employee ${empId} not found`, 'error');
            return;
        }
        
        currentEmpId = empId;
        
        const badge = $('currentEmpBadge');
        if (badge) {
            badge.textContent = `Working with: ${empId}`;
            badge.classList.add('active');
        }
        
        input.value = empId;
        
        await loadProfileData();
        await loadAppointmentData();
        await loadShiftData();
        await loadNotifications();
        await loadProgressData();
        
        showToast(`Loaded ${empId} successfully!`, 'success');
        
    } catch (error) {
        showToast(`Error: ${error.message}`, 'error');
        console.error(error);
    }
}

// ==================== PERFIL ====================
async function loadProfileData() {
    if (!currentEmpId) return;
    
    try {
        const snap = await getDoc(doc(db, "employeeRecords", currentEmpId));
        const data = snap.exists() ? snap.data() : {};
        const profile = data.profile || {};
        
        // ========== DEBUG ADMIN LOAD ==========
        console.log("📥 ADMIN: Cargando profile...");
        console.log("📥 Employee ID:", currentEmpId);
        console.log("📥 ¿Documento existe?:", snap.exists());
        console.log("📥 Datos completos:", data);
        console.log("📥 Profile object:", profile);
        // ======================================
        
        const fields = {
            'profFirstName': profile.firstName || '',
            'profLastName': profile.lastName || '',
            'profDOB': profile.dob || '',
            'profPhone': profile.phone || '',
            'profAddress': profile.address || '',
            'profCity': profile.city || '',
            'profStateZip': profile.stateZip || '',
        
        };
        
        Object.entries(fields).forEach(([id, value]) => {
            const el = $(id);
            if (el) el.value = value;
        });
        
    } catch (error) {
        console.error("Profile load error:", error);
    }
}

async function saveProfile() {
    if (!currentEmpId) {
        showToast('No employee selected', 'error');
        return;
    }
    
    const profile = {
        firstName: $('profFirstName')?.value?.trim() || '',
        lastName: $('profLastName')?.value?.trim() || '',
        dob: $('profDOB')?.value || '',
        phone: $('profPhone')?.value?.trim() || '',
        address: $('profAddress')?.value?.trim() || '',
        city: $('profCity')?.value?.trim() || '',
        stateZip: $('profStateZip')?.value?.trim() || '',
        updatedAt: serverTimestamp()
    };
    
    // ========== DEBUG ADMIN SAVE ==========
    console.log("💾 ADMIN: Guardando profile...");
    console.log("💾 Employee ID:", currentEmpId);
    console.log("💾 Profile data a guardar:", profile);
    console.log("💾 Ruta Firebase: employeeRecords/" + currentEmpId);
    // ======================================
    
    try {
        await updateDoc(doc(db, "employeeRecords", currentEmpId), { profile });
        
        // ========== CONFIRMACIÓN ==========
        console.log("✅ ADMIN: Profile guardado exitosamente en employeeRecords/" + currentEmpId);
        // ==================================
        
        await updateDoc(doc(db, "allowedEmployees", currentEmpId), {
            name: `${profile.firstName} ${profile.lastName}`.trim(),
            updatedAt: serverTimestamp()
        });
        
        const usersQuery = query(collection(db, "users"), where("employeeId", "==", currentEmpId));
        const usersSnap = await getDocs(usersQuery);
        
        const promises = [];
        usersSnap.forEach((userDoc) => {
            promises.push(updateDoc(doc(db, "users", userDoc.id), {
                fullName: `${profile.firstName} ${profile.lastName}`.trim()
            }));
        });
        await Promise.all(promises);
        
        showToast('Profile saved!', 'success');
        loadAllEmployees();
        
    } catch (error) {
        console.error("❌ ADMIN Error:", error);
        showToast(`Error: ${error.message}`, 'error');
    }
}

// ==================== CITA ====================
async function loadAppointmentData() {
    if (!currentEmpId) return;
    
    try {
        const snap = await getDoc(doc(db, "employeeRecords", currentEmpId));
        const data = snap.exists() ? snap.data() : {};
        const appt = data.appointment || {};
        
        if ($('apptDate')) $('apptDate').value = appt.date || '';
        if ($('apptTime')) $('apptTime').value = appt.time || '';
        if ($('apptAddress')) $('apptAddress').value = appt.address || '';
        if ($('apptNotes')) $('apptNotes').value = appt.notes || '';
        if ($('apptSuccess')) $('apptSuccess').style.display = 'none';
        
    } catch (error) {
        console.error("Appointment load error:", error);
    }
}

async function saveAppointment() {
    if (!currentEmpId) {
        showToast('No employee selected', 'error');
        return;
    }
    
    const appointment = {
        date: $('apptDate')?.value || '',
        time: $('apptTime')?.value || '',
        address: $('apptAddress')?.value?.trim() || '',
        notes: $('apptNotes')?.value?.trim() || '',
        updatedAt: serverTimestamp()
    };
    
    try {
        await updateDoc(doc(db, "employeeRecords", currentEmpId), { appointment });
        
        const usersQuery = query(collection(db, "users"), where("employeeId", "==", currentEmpId));
        const usersSnap = await getDocs(usersQuery);
        
        if (usersSnap.empty) {
            await setDoc(doc(db, "users", currentEmpId), {
                employeeId: currentEmpId,
                appointment,
                createdAt: serverTimestamp()
            });
        } else {
            const promises = [];
            usersSnap.forEach((userDoc) => {
                promises.push(updateDoc(doc(db, "users", userDoc.id), { appointment }));
            });
            await Promise.all(promises);
        }
        
        const successMsg = $('apptSuccess');
        if (successMsg) successMsg.style.display = 'block';
        
        showToast('Appointment saved!', 'success');
        
    } catch (error) {
        showToast(`Error: ${error.message}`, 'error');
    }
}

function clearAppointment() {
    if ($('apptDate')) $('apptDate').value = '';
    if ($('apptTime')) $('apptTime').value = '';
    if ($('apptAddress')) $('apptAddress').value = '';
    if ($('apptNotes')) $('apptNotes').value = '';
    if ($('apptSuccess')) $('apptSuccess').style.display = 'none';
}

// ==================== SHIFT APPROVAL - CORREGIDO ====================
async function loadShiftData() {
    const pendingDiv = $('shiftPending');
    const approvedDiv = $('shiftApproved');
    const noneDiv = $('shiftNone');
    
    if (!currentEmpId) {
        if (pendingDiv) pendingDiv.style.display = 'none';
        if (approvedDiv) approvedDiv.style.display = 'none';
        if (noneDiv) noneDiv.style.display = 'block';
        return;
    }
    
    try {
        // Buscar en USERS collection donde employeeId == currentEmpId
        const usersQuery = query(collection(db, "users"), where("employeeId", "==", currentEmpId));
        const usersSnap = await getDocs(usersQuery);
        
        let shift = null;
        let userDocId = null;
        
        if (!usersSnap.empty) {
            const userDoc = usersSnap.docs[0];
            userDocId = userDoc.id;
            const userData = userDoc.data();
            shift = userData.shift || {};
        }
        
        // Si no hay en users, buscar en employeeRecords como fallback
        if (!shift || !shift.position) {
            const recordSnap = await getDoc(doc(db, "employeeRecords", currentEmpId));
            const recordData = recordSnap.exists() ? recordSnap.data() : {};
            shift = recordData.shift || {};
        }
        
        // Guardar userDocId para usarlo en approveShift
        window.currentUserDocId = userDocId;
        
        if (!shift || !shift.position) {
            if (pendingDiv) pendingDiv.style.display = 'none';
            if (approvedDiv) approvedDiv.style.display = 'none';
            if (noneDiv) noneDiv.style.display = 'block';
            
            if ($('shiftPosition')) $('shiftPosition').textContent = 'Not selected';
            if ($('shiftTime')) $('shiftTime').textContent = 'Not selected';
            if ($('shiftDate')) $('shiftDate').textContent = '--';
            return;
        }
        
        // Mostrar datos del shift
        if ($('shiftPosition')) $('shiftPosition').textContent = formatPosition(shift.position);
        if ($('shiftTime')) $('shiftTime').textContent = formatShift(shift.shift);
        if ($('shiftDate')) {
            const dateText = shift.submittedAt ? 
                new Date(shift.submittedAt.toDate?.() || shift.submittedAt).toLocaleDateString() : 
                (shift.updatedAt ? new Date(shift.updatedAt.toDate?.() || shift.updatedAt).toLocaleDateString() : 'Unknown');
            $('shiftDate').textContent = dateText;
        }
        
        // Mostrar estado
        if (shift.approved === true) {
            if (pendingDiv) pendingDiv.style.display = 'none';
            if (approvedDiv) approvedDiv.style.display = 'block';
            if (noneDiv) noneDiv.style.display = 'none';
        } else if (shift.status === 'pending' || (shift.position && shift.shift)) {
            if (pendingDiv) pendingDiv.style.display = 'block';
            if (approvedDiv) approvedDiv.style.display = 'none';
            if (noneDiv) noneDiv.style.display = 'none';
        } else {
            if (pendingDiv) pendingDiv.style.display = 'none';
            if (approvedDiv) approvedDiv.style.display = 'none';
            if (noneDiv) noneDiv.style.display = 'block';
        }
        
    } catch (error) {
        console.error("Shift load error:", error);
        showToast('Error loading shift data', 'error');
    }
}

async function approveShift() {
    if (!currentEmpId) {
        showToast('No employee selected', 'error');
        return;
    }
    
    try {
        // Aprobar en USERS collection
        const usersQuery = query(collection(db, "users"), where("employeeId", "==", currentEmpId));
        const usersSnap = await getDocs(usersQuery);
        
        if (!usersSnap.empty) {
            const userDoc = usersSnap.docs[0];
            await updateDoc(doc(db, "users", userDoc.id), {
                'shift.approved': true,
                'shift.approvedAt': serverTimestamp(),
                'shift.approvedBy': 'admin',
                'shift.status': 'approved',
                updatedAt: serverTimestamp()
            });
        }
        
        // También actualizar en employeeRecords para mantener sincronización
        try {
            await updateDoc(doc(db, "employeeRecords", currentEmpId), {
                'shift.approved': true,
                'shift.approvedAt': serverTimestamp(),
                'shift.approvedBy': 'admin',
                'shift.status': 'approved',
                updatedAt: serverTimestamp()
            });
        } catch (e) {
            console.log("Could not update employeeRecords, but user was updated");
        }
        
        showToast('Shift approved!', 'success');
        loadShiftData();
        
    } catch (error) {
        showToast(`Error: ${error.message}`, 'error');
        console.error(error);
    }
}

async function rejectShift() {
    if (!currentEmpId) {
        showToast('No employee selected', 'error');
        return;
    }
    
    try {
        // Rechazar en USERS collection
        const usersQuery = query(collection(db, "users"), where("employeeId", "==", currentEmpId));
        const usersSnap = await getDocs(usersQuery);
        
        if (!usersSnap.empty) {
            const userDoc = usersSnap.docs[0];
            await updateDoc(doc(db, "users", userDoc.id), {
                'shift': deleteField(),
                shiftRejected: true,
                shiftRejectedAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            });
        }
        
        // También actualizar en employeeRecords
        try {
            await updateDoc(doc(db, "employeeRecords", currentEmpId), {
                'shift': deleteField(),
                shiftRejected: true,
                shiftRejectedAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            });
        } catch (e) {
            console.log("Could not update employeeRecords");
        }
        
        showToast('Shift rejected. Employee must select again.', 'info');
        loadShiftData();
        
    } catch (error) {
        showToast(`Error: ${error.message}`, 'error');
        console.error(error);
    }
}

// Helper functions para formatear
function formatPosition(key) {
    const positions = {
        assembler: "Solar Panel Assembler",
        material: "Material Handler",
        qc: "Quality Control Inspector",
        shipping: "Shipping & Receiving"
    };
    return positions[key] || key || 'Not selected';
}

function formatShift(key) {
    const shifts = {
        early: "Early Shift (6AM - 2:30PM)",
        mid: "Mid Shift (2PM - 10:30PM)",
        late: "Late Shift (10PM - 6:30AM)",
        weekend: "Weekend Shift (Fri-Sun)"
    };
    return shifts[key] || key || 'Not selected';
}
// ==================== PROGRESO / STEPS ====================
async function loadProgressData() {
    if (!currentEmpId) return;
    
    try {
        const snap = await getDoc(doc(db, "employeeRecords", currentEmpId));
        const data = snap.exists() ? snap.data() : {};
        const steps = data.steps || [];
        
        const container = $('progressSteps');
        if (!container) return;
        
        if (steps.length === 0) {
            container.innerHTML = '<div class="empty-state">No progress data available</div>';
            return;
        }
        
        container.innerHTML = steps.map(step => `
            <div class="step-item ${step.done ? 'completed' : ''}" data-step-id="${step.id}">
                <div class="step-checkbox">
                    <input type="checkbox" ${step.done ? 'checked' : ''} 
                           onchange="window.toggleStep('${step.id}', this.checked)">
                </div>
                <div class="step-label">${step.label}</div>
                <div class="step-status">${step.done ? '✓' : '○'}</div>
            </div>
        `).join('');
        
    } catch (error) {
        console.error("Progress load error:", error);
    }
}

async function toggleStep(stepId, done) {
    if (!currentEmpId) return;
    
    try {
        const snap = await getDoc(doc(db, "employeeRecords", currentEmpId));
        const data = snap.exists() ? snap.data() : {};
        const steps = data.steps || [];
        
        const updatedSteps = steps.map(step => 
            step.id === stepId ? { ...step, done } : step
        );
        
        await updateDoc(doc(db, "employeeRecords", currentEmpId), {
            steps: updatedSteps,
            updatedAt: serverTimestamp()
        });
        
        // Check if all steps completed
        const allDone = updatedSteps.every(s => s.done);
        if (allDone) {
            await updateDoc(doc(db, "allowedEmployees", currentEmpId), {
                onboardingComplete: true,
                updatedAt: serverTimestamp()
            });
        }
        
        loadProgressData();
        showToast(`Step ${done ? 'completed' : 'updated'}!`, 'success');
        
    } catch (error) {
        showToast(`Error: ${error.message}`, 'error');
    }
}

// ==================== NOTIFICACIONES ====================
async function loadNotifications() {
    if (!currentEmpId) return;
    
    try {
        const snap = await getDoc(doc(db, "employeeRecords", currentEmpId));
        const data = snap.exists() ? snap.data() : {};
        const notifications = data.notifications || [];
        
        const container = $('notificationsList');
        if (!container) return;
        
        if (notifications.length === 0) {
            container.innerHTML = '<div class="empty-state">No notifications sent yet</div>';
            return;
        }
        
        // Sort by date desc
        const sorted = notifications.sort((a, b) => {
            const dateA = a.createdAt?.toDate?.() || 0;
            const dateB = b.createdAt?.toDate?.() || 0;
            return dateB - dateA;
        });
        
        container.innerHTML = sorted.map(notif => `
            <div class="notification-item ${notif.type} ${notif.read ? 'read' : 'unread'}">
                <div class="notification-header">
                    <span class="notification-type">${notif.type}</span>
                    <span class="notification-date">${notif.createdAt?.toDate?.().toLocaleDateString() || 'Unknown'}</span>
                </div>
                <div class="notification-title">${notif.title}</div>
                <div class="notification-body">${notif.body}</div>
            </div>
        `).join('');
        
    } catch (error) {
        console.error("Notifications load error:", error);
    }
}

async function sendNotification() {
    if (!currentEmpId) {
        showToast('No employee selected', 'error');
        return;
    }
    
    const title = $('notifTitle')?.value?.trim();
    const body = $('notifBody')?.value?.trim();
    const type = $('notifType')?.value || 'info';
    
    if (!title || !body) {
        showToast('Title and message required', 'error');
        return;
    }
    
    const notification = {
        id: generateId(),
        type,
        title,
        body,
        createdAt: serverTimestamp(),
        read: false,
        from: 'admin'
    };
    
    try {
        await updateDoc(doc(db, "employeeRecords", currentEmpId), {
            notifications: arrayUnion(notification)
        });
        
        const usersQuery = query(collection(db, "users"), where("employeeId", "==", currentEmpId));
        const usersSnap = await getDocs(usersQuery);
        
        const promises = [];
        usersSnap.forEach((userDoc) => {
            promises.push(updateDoc(doc(db, "users", userDoc.id), {
                notifications: arrayUnion(notification)
            }));
        });
        await Promise.all(promises);
        
        if ($('notifTitle')) $('notifTitle').value = '';
        if ($('notifBody')) $('notifBody').value = '';
        
        showToast('Notification sent!', 'success');
        loadNotifications();
        
    } catch (error) {
        showToast(`Error: ${error.message}`, 'error');
    }
}


// ==================== GESTIÓN DE IDs ====================
async function loadAllEmployees() {
    const container = $('allEmployeesList');
    if (!container) return;
    
    container.innerHTML = '<div class="loading">Loading...</div>';
    
    try {
        const snap = await getDocs(collection(db, "allowedEmployees"));
        const employees = [];
        
        snap.forEach(doc => {
            employees.push({ id: doc.id, ...doc.data() });
        });
        
        employees.sort((a, b) => {
            const numA = parseInt(a.id.replace('SP', '')) || 0;
            const numB = parseInt(b.id.replace('SP', '')) || 0;
            return numA - numB;
        });
        
        if (employees.length === 0) {
            container.innerHTML = '<div class="empty-state">No employees registered yet</div>';
            return;
        }
        
        container.innerHTML = '<div class="employee-list"></div>';
        const list = container.querySelector('.employee-list');
        
        employees.forEach(emp => {
            const item = document.createElement('div');
            item.className = 'employee-item';
            
            const isActive = emp.active !== false;
            
            item.innerHTML = `
                <div class="employee-info">
                    <div class="employee-id">${emp.id}</div>
                    <div class="employee-name">${emp.name || 'No name'}</div>
                    ${emp.email ? `<div class="employee-email">${emp.email}</div>` : ''}
                </div>
                <div class="employee-actions">
                    <span class="status-badge ${isActive ? 'status-active' : 'status-inactive'}">
                        ${isActive ? 'Active' : 'Inactive'}
                    </span>
                    <button class="btn btn-secondary" onclick="window.loadEmpFromList('${emp.id}')">
                        Load
                    </button>
                    <button class="btn btn-danger" onclick="window.deleteEmployee('${emp.id}')">
                        Delete
                    </button>
                </div>
            `;
            list.appendChild(item);
        });
        
    } catch (error) {
        container.innerHTML = `<div class="error">Error: ${error.message}</div>`;
    }
}

window.addNewEmployee = async function() {
    const idInput = $('newEmpId');
    const nameInput = $('newEmpName');
    const emailInput = $('newEmpEmail');
    
    const rawId = idInput ? idInput.value : '';
    const name = nameInput ? nameInput.value.trim() : '';
    const email = emailInput ? emailInput.value.trim() : '';
    
    const empId = normalizeEmpId(rawId);
    
    if (!empId) {
        showToast('Invalid ID format. Use: SP001', 'error');
        return;
    }
    
    if (!name) {
        showToast('Name is required', 'error');
        return;
    }
    
    try {
        // Verificar si ya existe
        const existing = await getDoc(doc(db, "allowedEmployees", empId));
        if (existing.exists()) {
            showToast('Employee ID already exists', 'error');
            return;
        }
        
        // Crear timestamp local (más confiable que serverTimestamp)
        const now = new Date().toISOString();
        
        // Guardar en allowedEmployees
        await setDoc(doc(db, "allowedEmployees", empId), {
            active: true,
            name: name,
            email: email || '',
            createdAt: now,
            onboardingComplete: false
        });
        
        // Guardar en employeeRecords
        await setDoc(doc(db, "employeeRecords", empId), {
            employeeId: empId,
            name: name,
            email: email || '',
            createdAt: now,
            profile: {},
            appointment: {},
            notifications: [],
            shift: {},
            steps: [
                { id: "shift_selection", label: "Shift Selection", done: false },
                { id: "footwear", label: "Safety Footwear", done: false },
                { id: "i9", label: "I-9 Documents", done: false },
                { id: "badge", label: "Photo Badge", done: false },
                { id: "firstday", label: "First Day Preparation", done: false }
            ]
        });
        
        showToast(`Employee ${empId} created!`, 'success');
        
        // Limpiar inputs
        if (idInput) idInput.value = '';
        if (nameInput) nameInput.value = '';
        if (emailInput) emailInput.value = '';
        
        // Recargar lista
        loadAllEmployees();
        
    } catch (error) {
        console.error("Error creating employee:", error);
        showToast(`Error: ${error.message}`, 'error');
    }
}
// Funciones globales para onclick
window.loadEmpFromList = async function(empId) {
    const input = $('currentEmpId');
    if (input) input.value = empId;
    
    await loadCurrentEmployee();
    
    const firstTab = document.querySelector('[data-tab="profile"]');
    if (firstTab) firstTab.click();
};

window.deleteEmployee = async function(empId) {
    if (!confirm(`Are you sure you want to delete ${empId}?`)) return;
    
    try {
        await deleteDoc(doc(db, "allowedEmployees", empId));
        await deleteDoc(doc(db, "employeeRecords", empId));
        await deleteDoc(doc(db, "chats", empId));
        
        if (currentEmpId === empId) {
            currentEmpId = null;
            const badge = $('currentEmpBadge');
            if (badge) {
                badge.classList.remove('active');
                badge.textContent = 'None selected';
            }
        }
        
        showToast(`Employee ${empId} deleted`, 'success');
        loadAllEmployees();
        
    } catch (error) {
        showToast(`Error: ${error.message}`, 'error');
    }
};

window.toggleStep = toggleStep;

// ==================== NAVEGACIÓN ====================
function initTabs() {
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const tabId = tab.dataset.tab;
            
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
            const section = $(`tab-${tabId}`);
            if (section) section.classList.add('active');
            
            if (tabId === 'manage') loadAllEmployees();
            if (tabId === 'shift') loadShiftData();
            if (tabId === 'progress') loadProgressData();
            if (tabId === 'notifications') loadNotifications();
        });
    });
}

// ==================== INICIALIZACIÓN ====================
export function initAdminApp() {
    console.log('🚀 Admin Portal Initializing...');
    
    initTabs();
    
    $('btnLoadEmp')?.addEventListener('click', loadCurrentEmployee);
    $('currentEmpId')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') loadCurrentEmployee();
    });
    
    $('btnSaveProfile')?.addEventListener('click', saveProfile);
    $('btnSaveAppt')?.addEventListener('click', saveAppointment);
    $('btnClearAppt')?.addEventListener('click', clearAppointment);
    $('btnApproveShift')?.addEventListener('click', approveShift);
    $('btnRejectShift')?.addEventListener('click', rejectShift);
    $('btnSendNotif')?.addEventListener('click', sendNotification);
    $('btnSendChat')?.addEventListener('click', sendChatMessage);
    $('chatInput')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendChatMessage();
    });
   const btnAddEmp = document.getElementById('btnAddEmp');
if (btnAddEmp) btnAddEmp.addEventListener('click', addNewEmployee);
else console.error('btnAddEmp no encontrado');
    $('btnLogout')?.addEventListener('click', () => {
        window.location.href = './index.html';
    });
    
    loadAllEmployees();
    
    console.log('✅ Admin Portal Ready');
}
