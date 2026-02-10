// SunPower Admin Portal - Definitive Version
import { auth, db, isFirebaseConfigured } from "./firebase.js";
import { 
    doc, getDoc, setDoc, updateDoc, deleteDoc, 
    collection, query, where, getDocs, onSnapshot, 
    serverTimestamp, arrayUnion 
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { signOut } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

// ==================== GLOBAL STATE ====================
let currentEmpId = null;
let chatUnsubscribe = null;

// ==================== UTILITIES ====================
function $(id) { return document.getElementById(id); }

function normalizeEmpId(input) {
    if (!input) return "";
    let v = input.toString().toUpperCase().trim().replace(/[-_\s]/g, "");
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

// ==================== AUTH CHECK ====================
async function checkAdminAuth() {
    const user = auth.currentUser;
    if (!user) {
        window.location.href = './index.html';
        return false;
    }
    
    // Verify admin status
    const adminRef = doc(db, "admins", user.uid);
    const adminSnap = await getDoc(adminRef);
    
    if (!adminSnap.exists()) {
        showToast('Access denied: Admin only', 'error');
        setTimeout(() => window.location.href = './index.html', 2000);
        return false;
    }
    
    return true;
}

// ==================== EMPLOYEE MANAGEMENT ====================
async function loadCurrentEmployee() {
    const input = $('currentEmpId');
    const empId = normalizeEmpId(input?.value);
    
    if (!empId) {
        showToast('Invalid ID format. Use: SP001', 'error');
        return;
    }
    
    try {
        const allowedRef = doc(db, "allowedEmployees", empId);
        const allowedSnap = await getDoc(allowedRef);
        
        if (!allowedSnap.exists()) {
            showToast(`Employee ${empId} not found`, 'error');
            return;
        }
        
        currentEmpId = empId;
        
        // Update badge
        const badge = $('currentEmpBadge');
        if (badge) {
            const data = allowedSnap.data();
            badge.textContent = `${empId} - ${data.name || 'No name'}`;
            badge.classList.add('active');
        }
        
        input.value = empId;
        
        // Load all related data
        await Promise.all([
            loadOnboardingData(),
            loadAppointmentData(),
            loadShiftData(),
            initChat()
        ]);
        
        showToast(`Loaded ${empId} successfully!`, 'success');
        
    } catch (error) {
        showToast(`Error: ${error.message}`, 'error');
        console.error(error);
    }
}

async function createEmployee() {
    const idInput = $('newEmpId');
    const nameInput = $('newEmpName');
    const emailInput = $('newEmpEmail');
    
    const empId = normalizeEmpId(idInput?.value);
    const name = nameInput?.value?.trim();
    const email = emailInput?.value?.trim()?.toLowerCase();
    
    if (!empId) {
        showToast('Invalid ID format. Use: SP001', 'error');
        return;
    }
    if (!name) {
        showToast('Full name is required', 'error');
        return;
    }
    if (!email || !email.includes('@')) {
        showToast('Valid email is required', 'error');
        return;
    }
    
    try {
        // Check if ID exists (document ID es el employeeId)
        const existingId = await getDoc(doc(db, "allowedEmployees", empId));
        if (existingId.exists()) {
            showToast('Employee ID already exists', 'error');
            return;
        }
        
        // Check if email exists (query por campo email)
        const emailQuery = query(collection(db, "allowedEmployees"), where("email", "==", email));
        const emailSnap = await getDocs(emailQuery);
        if (!emailSnap.empty) {
            showToast('Email already registered', 'error');
            return;
        }
        
        // Create allowedEmployees entry (ID del documento = employeeId)
        await setDoc(doc(db, "allowedEmployees", empId), {
            employeeId: empId,
            name: name,
            email: email,
            active: true,
            status: "pending", // pending → verified (when employee verifies)
            createdAt: serverTimestamp(),
            createdBy: auth.currentUser?.uid || 'admin'
        });
        
        // Create employeeRecords for admin tracking
        await setDoc(doc(db, "employeeRecords", empId), {
            employeeId: empId,
            name: name,
            email: email,
            createdAt: serverTimestamp(),
            steps: [
                { id: "shift_selection", label: "Shift Selection", done: false, locked: false },
                { id: "footwear", label: "Safety Footwear", done: false, locked: true },
                { id: "i9", label: "I-9 Verification Ready", done: false, locked: true },
                { id: "photo_badge", label: "Photo Badge", done: false, locked: true },
                { id: "firstday", label: "First Day Preparation", done: false, locked: true }
            ],
            currentStep: 0,
            onboardingComplete: false,
            appointment: {},
            shift: {},
            notifications: [],
            chat: []
        });
        
        showToast(`Employee ${empId} created! Tell them to sign in with Google using ${email}`, 'success');
        
        // Clear form
        idInput.value = '';
        nameInput.value = '';
        emailInput.value = '';
        
        loadAllEmployees();
        loadIdPool();
        
    } catch (error) {
        showToast(`Error: ${error.message}`, 'error');
        console.error(error);
    }
}

async function loadAllEmployees() {
    const container = $('employeesList');
    if (!container) return;
    
    container.innerHTML = '<div class="empty-state">Loading...</div>';
    
    try {
        const snap = await getDocs(collection(db, "allowedEmployees"));
        const employees = [];
        
        snap.forEach(doc => {
            employees.push({ id: doc.id, ...doc.data() });
        });
        
        employees.sort((a, b) => {
            const numA = parseInt(a.employeeId?.replace('SP', '')) || 0;
            const numB = parseInt(b.employeeId?.replace('SP', '')) || 0;
            return numA - numB;
        });
        
        if (employees.length === 0) {
            container.innerHTML = '<div class="empty-state">No employees yet</div>';
            return;
        }
        
        container.innerHTML = '<div class="employee-list"></div>';
        const list = container.querySelector('.employee-list');
        
        employees.forEach(emp => {
            const item = document.createElement('div');
            item.className = 'employee-item';
            
            const statusClass = emp.status === 'verified' ? 'status-verified' : 
                               emp.active ? 'status-active' : 'status-inactive';
            const statusText = emp.status === 'verified' ? 'Verified' : 
                              emp.active ? 'Active' : 'Inactive';
            
            item.innerHTML = `
                <div class="employee-info">
                    <div class="employee-id">${emp.employeeId || emp.id}</div>
                    <div class="employee-name">${emp.name || 'No name'}</div>
                    ${emp.email ? `<div class="employee-email">${emp.email}</div>` : ''}
                </div>
                <div class="employee-actions">
                    <span class="status-badge ${statusClass}">${statusText}</span>
                    <button class="btn btn-secondary" onclick="window.loadEmp('${emp.employeeId || emp.id}')">Load</button>
                    <button class="btn btn-danger" onclick="window.deleteEmp('${emp.employeeId || emp.id}')">Delete</button>
                </div>
            `;
            list.appendChild(item);
        });
        
    } catch (error) {
        container.innerHTML = `<div class="empty-state">Error: ${error.message}</div>`;
    }
}

// ==================== ONBOARDING ====================
async function loadOnboardingData() {
    const container = $('onboardingStatus');
    if (!container || !currentEmpId) {
        if (container) container.innerHTML = '<div class="alert alert-warning">Load an employee to view progress</div>';
        return;
    }
    
    try {
        const recordRef = doc(db, "employeeRecords", currentEmpId);
        const recordSnap = await getDoc(recordRef);
        
        if (!recordSnap.exists()) {
            container.innerHTML = '<div class="alert alert-warning">No onboarding data found</div>';
            return;
        }
        
        const data = recordSnap.data();
        const steps = data.steps || [];
        
        let html = '<div class="step-list">';
        steps.forEach((step, idx) => {
            const isLocked = step.locked && !step.done;
            html += `
                <div class="step-item ${step.done ? 'completed' : ''}" style="${isLocked ? 'opacity: 0.5;' : ''}">
                    <input type="checkbox" class="step-checkbox" 
                           ${step.done ? 'checked' : ''} 
                           ${isLocked ? 'disabled' : ''}
                           onchange="window.toggleStep(${idx}, this.checked)">
                    <div class="step-label">
                        ${idx + 1}. ${step.label}
                        ${isLocked ? ' 🔒' : ''}
                    </div>
                    <div class="step-status">${step.done ? '✓' : '○'}</div>
                </div>
            `;
        });
        html += '</div>';
        
        if (data.onboardingComplete) {
            html = '<div class="alert alert-success" style="margin-bottom: 16px;">✅ Onboarding Complete!</div>' + html;
        }
        
        container.innerHTML = html;
        
    } catch (error) {
        container.innerHTML = `<div class="alert alert-error">Error loading data</div>`;
    }
}

async function updateStep(stepIndex, done) {
    if (!currentEmpId) return;
    
    try {
        const recordRef = doc(db, "employeeRecords", currentEmpId);
        const recordSnap = await getDoc(recordRef);
        
        if (!recordSnap.exists()) return;
        
        const data = recordSnap.data();
        const steps = [...(data.steps || [])];
        
        if (stepIndex >= steps.length) return;
        
        // Update step
        steps[stepIndex] = {
            ...steps[stepIndex],
            done: done,
            completedAt: done ? serverTimestamp() : null
        };
        
        // Unlock next step if completing current
        if (done && stepIndex < steps.length - 1) {
            steps[stepIndex + 1].locked = false;
        }
        
        // Check if all complete
        const allDone = steps.every(s => s.done);
        
        await updateDoc(recordRef, {
            steps: steps,
            currentStep: allDone ? steps.length : stepIndex + 1,
            onboardingComplete: allDone,
            updatedAt: serverTimestamp()
        });
        
        // Also update allowedEmployees
        if (allDone) {
            await updateDoc(doc(db, "allowedEmployees", currentEmpId), {
                onboardingComplete: true,
                updatedAt: serverTimestamp()
            });
        }
        
        showToast(`Step ${done ? 'completed' : 'updated'}!`, 'success');
        loadOnboardingData();
        
    } catch (error) {
        showToast(`Error: ${error.message}`, 'error');
    }
}

async function manualStepUpdate() {
    if (!currentEmpId) {
        showToast('No employee selected', 'error');
        return;
    }
    
    const stepIndex = parseInt($('stepSelect')?.value || 0);
    const action = $('stepAction')?.value;
    
    await updateStep(stepIndex, action === 'complete');
}

// ==================== APPOINTMENT ====================
async function loadAppointmentData() {
    if (!currentEmpId) return;
    
    try {
        const recordRef = doc(db, "employeeRecords", currentEmpId);
        const recordSnap = await getDoc(recordRef);
        const appt = recordSnap.exists() ? recordSnap.data().appointment || {} : {};
        
        if ($('apptDate')) $('apptDate').value = appt.date || '';
        if ($('apptTime')) $('apptTime').value = appt.time || '';
        if ($('apptLocation')) $('apptLocation').value = appt.location || '';
        if ($('apptNotes')) $('apptNotes').value = appt.notes || '';
        if ($('apptSuccess')) $('apptSuccess').style.display = 'none';
        
    } catch (error) {
        console.error("Error loading appointment:", error);
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
        location: $('apptLocation')?.value?.trim() || '',
        notes: $('apptNotes')?.value?.trim() || '',
        updatedAt: serverTimestamp(),
        updatedBy: auth.currentUser?.uid
    };
    
    try {
        await updateDoc(doc(db, "employeeRecords", currentEmpId), { appointment });
        
        // Also update user's view if they exist
        const userQuery = query(collection(db, "users"), where("employeeId", "==", currentEmpId));
        const userSnap = await getDocs(userQuery);
        
        const promises = [];
        userSnap.forEach((userDoc) => {
            promises.push(updateDoc(doc(db, "users", userDoc.id), { appointment }));
        });
        await Promise.all(promises);
        
        if ($('apptSuccess')) $('apptSuccess').style.display = 'block';
        showToast('Appointment saved!', 'success');
        
    } catch (error) {
        showToast(`Error: ${error.message}`, 'error');
    }
}

function clearAppointment() {
    ['apptDate', 'apptTime', 'apptLocation', 'apptNotes'].forEach(id => {
        const el = $(id);
        if (el) el.value = '';
    });
    if ($('apptSuccess')) $('apptSuccess').style.display = 'none';
}

// ==================== SHIFT ====================
async function loadShiftData() {
    const container = $('shiftStatus');
    if (!container || !currentEmpId) {
        if (container) container.innerHTML = '<div class="alert alert-warning">Load an employee to view shift status</div>';
        return;
    }
    
    try {
        const recordRef = doc(db, "employeeRecords", currentEmpId);
        const recordSnap = await getDoc(recordRef);
        const shift = recordSnap.exists() ? recordSnap.data().shift || {} : {};
        
        if (!shift.position) {
            container.innerHTML = `
                <div class="alert alert-warning">
                    ⚠️ Employee hasn't selected a shift yet
                </div>
            `;
            return;
        }
        
        const statusClass = shift.approved ? 'alert-success' : 'alert-info';
        const statusText = shift.approved ? '✅ Approved' : '⏳ Pending Approval';
        
        container.innerHTML = `
            <div class="alert ${statusClass}">
                <div style="margin-bottom: 12px;"><strong>${statusText}</strong></div>
                <div class="form-grid" style="margin-bottom: 16px;">
                    <div><strong>Position:</strong> ${shift.position}</div>
                    <div><strong>Shift:</strong> ${shift.shift}</div>
                    <div><strong>Selected:</strong> ${shift.selectedAt?.toDate?.().toLocaleDateString() || 'Unknown'}</div>
                </div>
                ${!shift.approved ? `
                    <div style="display: flex; gap: 12px;">
                        <button class="btn btn-success" onclick="window.approveShift()">✅ Approve</button>
                        <button class="btn btn-danger" onclick="window.rejectShift()">❌ Reject</button>
                    </div>
                ` : ''}
            </div>
        `;
        
    } catch (error) {
        container.innerHTML = '<div class="alert alert-error">Error loading shift data</div>';
    }
}

async function approveShift() {
    if (!currentEmpId) return;
    
    try {
        await updateDoc(doc(db, "employeeRecords", currentEmpId), {
            'shift.approved': true,
            'shift.approvedAt': serverTimestamp(),
            'shift.approvedBy': auth.currentUser?.uid
        });
        
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
            shift: { rejected: true, rejectedAt: serverTimestamp() }
        });
        
        showToast('Shift rejected. Employee must select again.', 'info');
        loadShiftData();
        
    } catch (error) {
        showToast(`Error: ${error.message}`, 'error');
    }
}

// ==================== CHAT ====================
async function initChat() {
    const header = $('chatHeader');
    const messages = $('chatMessages');
    const input = $('chatInput');
    const btn = $('btnSendChat');
    
    if (!currentEmpId) {
        if (header) header.textContent = 'Select an employee to start chatting';
        if (messages) messages.innerHTML = '<div class="empty-state">💬 Load an employee to view conversation</div>';
        if (input) input.disabled = true;
        if (btn) btn.disabled = true;
        return;
    }
    
    if (chatUnsubscribe) {
        chatUnsubscribe();
        chatUnsubscribe = null;
    }
    
    try {
        const allowedRef = doc(db, "allowedEmployees", currentEmpId);
        const allowedSnap = await getDoc(allowedRef);
        const empData = allowedSnap.exists() ? allowedSnap.data() : {};
        
        if (header) header.textContent = `Chat with: ${empData.name || currentEmpId}`;
        if (input) {
            input.disabled = false;
            input.focus();
        }
        if (btn) btn.disabled = false;
        
        // Setup real-time listener
        chatUnsubscribe = onSnapshot(doc(db, "chats", currentEmpId), (snap) => {
            const data = snap.exists() ? snap.data() : {};
            renderMessages(data.messages || []);
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
            <div>${msg.text}</div>
            <div class="message-time">${msg.timestamp?.toDate?.().toLocaleString() || ''}</div>
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
        text: text,
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

// ==================== ID POOL ====================
async function loadIdPool() {
    const grid = $('idPoolGrid');
    const availableCount = $('availableCount');
    const assignedCount = $('assignedCount');
    const verifiedCount = $('verifiedCount');
    
    if (!grid) return;
    
    try {
        const snap = await getDocs(collection(db, "allowedEmployees"));
        
        let available = 0, assigned = 0, verified = 0;
        
        // Generate SP001-SP100 grid
        let html = '';
        for (let i = 1; i <= 100; i++) {
            const id = 'SP' + i.toString().padStart(3, '0');
            const doc = snap.docs.find(d => d.id === id || d.data().employeeId === id);
            const data = doc ? doc.data() : null;
            
            let statusClass = 'id-available';
            let title = 'Available';
            
            if (data) {
                if (data.status === 'verified') {
                    statusClass = 'id-verified';
                    title = `Verified: ${data.name}`;
                    verified++;
                } else if (data.assignedTo || data.email) {
                    statusClass = 'id-assigned';
                    title = `Assigned: ${data.name || 'Pending'}`;
                    assigned++;
                } else {
                    available++;
                }
            } else {
                available++;
            }
            
            html += `<div class="id-item ${statusClass}" title="${title}">${id}</div>`;
        }
        
        grid.innerHTML = html;
        if (availableCount) availableCount.textContent = available;
        if (assignedCount) assignedCount.textContent = assigned;
        if (verifiedCount) verifiedCount.textContent = verified;
        
    } catch (error) {
        grid.innerHTML = '<div class="empty-state">Error loading ID pool</div>';
    }
}

// ==================== GLOBAL FUNCTIONS ====================
window.loadEmp = async function(empId) {
    const input = $('currentEmpId');
    if (input) input.value = empId;
    await loadCurrentEmployee();
};

window.deleteEmp = async function(empId) {
    if (!confirm(`Delete ${empId}? This cannot be undone.`)) return;
    
    try {
        await deleteDoc(doc(db, "allowedEmployees", empId));
        await deleteDoc(doc(db, "employeeRecords", empId));
        await deleteDoc(doc(db, "chats", empId));
        
        if (currentEmpId === empId) {
            currentEmpId = null;
            const badge = $('currentEmpBadge');
            if (badge) {
                badge.textContent = 'None selected';
                badge.classList.remove('active');
            }
        }
        
        showToast(`Employee ${empId} deleted`, 'success');
        loadAllEmployees();
        loadIdPool();
        
    } catch (error) {
        showToast(`Error: ${error.message}`, 'error');
    }
};

window.toggleStep = updateStep;
window.approveShift = approveShift;
window.rejectShift = rejectShift;

// ==================== INITIALIZATION ====================
export async function initAdminApp() {
    console.log('🚀 Admin Portal Initializing...');
    
    // Check auth first
    const isAdmin = await checkAdminAuth();
    if (!isAdmin) return;
    
    // Event listeners
    $('btnLoadEmp')?.addEventListener('click', loadCurrentEmployee);
    $('currentEmpId')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') loadCurrentEmployee();
    });
    
    $('btnCreateEmployee')?.addEventListener('click', createEmployee);
    $('btnUpdateStep')?.addEventListener('click', manualStepUpdate);
    $('btnSaveAppt')?.addEventListener('click', saveAppointment);
    $('btnClearAppt')?.addEventListener('click', clearAppointment);
    $('btnSendChat')?.addEventListener('click', sendChatMessage);
    $('chatInput')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendChatMessage();
    });
    
    $('btnLogout')?.addEventListener('click', async () => {
        await signOut(auth);
        window.location.href = './index.html';
    });
    
    // Tab-specific loaders
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const tabId = tab.dataset.tab;
            if (tabId === 'employees') loadAllEmployees();
            if (tabId === 'ids') loadIdPool();
            if (tabId === 'onboarding') loadOnboardingData();
            if (tabId === 'shift') loadShiftData();
        });
    });
    
    // Initial loads
    loadAllEmployees();
    loadIdPool();
    
    console.log('✅ Admin Portal Ready');
}
