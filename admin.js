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
        await initChat();
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
        
        const fields = {
            'profFirstName': profile.firstName || '',
            'profLastName': profile.lastName || '',
            'profDOB': profile.dob || '',
            'profPhone': profile.phone || '',
            'profAddress': profile.address || '',
            'profCity': profile.city || '',
            'profStateZip': profile.stateZip || '',
            'profEmergencyName': profile.emergencyName || '',
            'profEmergencyPhone': profile.emergencyPhone || ''
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
        emergencyName: $('profEmergencyName')?.value?.trim() || '',
        emergencyPhone: $('profEmergencyPhone')?.value?.trim() || '',
        updatedAt: serverTimestamp()
    };
    
    try {
        await updateDoc(doc(db, "employeeRecords", currentEmpId), { profile });
        
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

// ==================== SHIFT APPROVAL ====================
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
        const snap = await getDoc(doc(db, "employeeRecords", currentEmpId));
        const data = snap.exists() ? snap.data() : {};
        const shift = data.shift || {};
        
        if (!shift.position) {
            if (pendingDiv) pendingDiv.style.display = 'none';
            if (approvedDiv) approvedDiv.style.display = 'none';
            if (noneDiv) noneDiv.style.display = 'block';
            return;
        }
        
        if ($('shiftPosition')) $('shiftPosition').textContent = shift.position || 'Not selected';
        if ($('shiftTime')) $('shiftTime').textContent = shift.shift || 'Not selected';
        if ($('shiftDate')) {
            $('shiftDate').textContent = shift.selectedAt ? 
                new Date(shift.selectedAt.toDate()).toLocaleDateString() : 'Unknown';
        }
        
        if (shift.approved) {
            if (pendingDiv) pendingDiv.style.display = 'none';
            if (approvedDiv) approvedDiv.style.display = 'block';
            if (noneDiv) noneDiv.style.display = 'none';
        } else {
            if (pendingDiv) pendingDiv.style.display = 'block';
            if (approvedDiv) approvedDiv.style.display = 'none';
            if (noneDiv) noneDiv.style.display = 'none';
        }
        
    } catch (error) {
        console.error("Shift load error:", error);
    }
}

async function approveShift() {
    if (!currentEmpId) return;
    
    try {
        await updateDoc(doc(db, "employeeRecords", currentEmpId), {
            'shift.approved': true,
            'shift.approvedAt': serverTimestamp(),
            'shift.approvedBy': 'admin'
        });
        
        const usersQuery = query(collection(db, "users"), where("employeeId", "==", currentEmpId));
        const usersSnap = await getDocs(usersQuery);
        
        const promises = [];
        usersSnap.forEach((userDoc) => {
            promises.push(updateDoc(doc(db, "users", userDoc.id), {
                'shift.approved': true
            }));
        });
        await Promise.all(promises);
        
        showToast('Shift approved!', 'success');
        loadShiftData();
        
    } catch (error) {
        showToast(`Error: ${error.message}`, 'error');
    }
}

async function rejectShift() {
    if (!currentEmpId) return;
    
    try {
        await updateDoc(doc(db, "employeeRecords", currentEmpId), {
            'shift': deleteField(),
            shiftRejected: true,
            shiftRejectedAt: serverTimestamp()
        });
        
        showToast('Shift rejected. Employee must select again.', 'info');
        loadShiftData();
        
    } catch (error) {
        showToast(`Error: ${error.message}`, 'error');
    }
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

// ==================== CHAT ====================
async function initChat() {
    const chatHeader = $('chatHeader');
    const chatMessages = $('chatMessages');
    const chatInput = $('chatInput');
    const btnSendChat = $('btnSendChat');
    
    if (!currentEmpId) {
        if (chatHeader) chatHeader.textContent = 'Select an employee to start chatting';
        if (chatMessages) chatMessages.innerHTML = '<div class="empty-state">Load an employee to view conversation</div>';
        if (chatInput) chatInput.disabled = true;
        if (btnSendChat) btnSendChat.disabled = true;
        return;
    }
    
    if (chatUnsubscribe) {
        chatUnsubscribe();
        chatUnsubscribe = null;
    }
    
    try {
        const empDoc = await getDoc(doc(db, "allowedEmployees", currentEmpId));
        const empData = empDoc.exists() ? empDoc.data() : {};
        
        if (chatHeader) chatHeader.textContent = `Chat with: ${empData.name || currentEmpId}`;
        if (chatInput) {
            chatInput.disabled = false;
            chatInput.focus();
        }
        if (btnSendChat) btnSendChat.disabled = false;
        
        chatUnsubscribe = onSnapshot(doc(db, "chats", currentEmpId), (snap) => {
            const messages = snap.exists() ? (snap.data().messages || []) : [];
            renderMessages(messages);
        });
        
    } catch (error) {
        console.error("Chat init error:", error);
    }
}

function renderMessages(messages) {
    const container = $('chatMessages');
    if (!container) return;
    
    if (messages.length === 0) {
        container.innerHTML = '<div class="empty-state">No messages yet. Start the conversation!</div>';
        return;
    }
    
    container.innerHTML = messages.map(msg => `
        <div class="message ${msg.sender === 'admin' ? 'admin' : 'employee'}">
            <div class="message-text">${msg.text}</div>
            <div class="message-time">
                ${msg.timestamp?.toDate?.().toLocaleTimeString() || ''}
            </div>
        </div>
    `).join('');
    
    container.scrollTop = container.scrollHeight;
}

async function sendChatMessage() {
    const input = $('chatInput');
    const text = input?.value?.trim();
    
    if (!text || !currentEmpId) return;
    
    const message = {
        sender: 'admin',
        text,
        timestamp: serverTimestamp()
    };
    
    try {
        const chatRef = doc(db, "chats", currentEmpId);
        const snap = await getDoc(chatRef);
        
        if (snap.exists()) {
            await updateDoc(chatRef, {
                messages: arrayUnion(message),
                updatedAt: serverTimestamp()
            });
        } else {
            await setDoc(chatRef, {
                messages: [message],
                employeeId: currentEmpId,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            });
        }
        
        input.value = '';
        
    } catch (error) {
        showToast('Error sending message', 'error');
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

async function addNewEmployee() {
    const idInput = $('newEmpId');
    const nameInput = $('newEmpName');
    const emailInput = $('newEmpEmail');
    
    const empId = normalizeEmpId(idInput?.value);
    const name = nameInput?.value?.trim();
    const email = emailInput?.value?.trim();
    
    if (!empId) {
        showToast('Invalid ID format. Use: SP001', 'error');
        return;
    }
    
    if (!name) {
        showToast('Name is required', 'error');
        return;
    }
    
    try {
        const existing = await getDoc(doc(db, "allowedEmployees", empId));
        if (existing.exists()) {
            showToast('Employee ID already exists', 'error');
            return;
        }
        
        await setDoc(doc(db, "allowedEmployees", empId), {
            active: true,
            name: name,
            email: email || '',
            createdAt: serverTimestamp(),
            onboardingComplete: false
        });
        
        await setDoc(doc(db, "employeeRecords", empId), {
            employeeId: empId,
            name: name,
            email: email || '',
            createdAt: serverTimestamp(),
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
        
        if (idInput) idInput.value = '';
        if (nameInput) nameInput.value = '';
        if (emailInput) emailInput.value = '';
        
        loadAllEmployees();
        
    } catch (error) {
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
    $('btnAddEmp')?.addEventListener('click', addNewEmployee);
    $('btnLogout')?.addEventListener('click', () => {
        window.location.href = './index.html';
    });
    
    loadAllEmployees();
    
    console.log('✅ Admin Portal Ready');
}
