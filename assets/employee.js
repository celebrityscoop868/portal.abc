// ==========================================
// SunPower Employee Portal - Definitive Version
// Aligned with Admin Flow & Authentication
// ==========================================

import { auth, db, isFirebaseConfigured } from "./firebase.js";
import { onAuth } from "./auth.js";
import { uiSetText, uiToast, escapeHtml } from "./ui.js";

import { 
  doc, getDoc, setDoc, updateDoc, onSnapshot, serverTimestamp,
  collection, addDoc, query, where, orderBy, getDocs, arrayUnion
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

// ---------- Firestore refs ----------
const PUBLIC_DOC = () => doc(db, "portal", "public");
const RECORD_DOC = (empId) => doc(db, "employeeRecords", empId);
const ALLOWED_DOC = (empId) => doc(db, "allowedEmployees", empId);
const CHAT_DOC = (empId) => doc(db, "chats", empId);
const TICKETS_COL = () => collection(db, "supportTickets");

// ---------- Config ----------
const EMP_ID_RANGE = { min: 1, max: 999 };

// ---------- Global State ----------
let currentUser = null;
let currentEmpId = null;
let currentUserData = null;
let currentPublicData = null;
let currentRecordData = null;
let chatUnsubscribe = null;

// ---------- Utilities ----------
function $(id) { return document.getElementById(id); }

function normalizeEmpId(input) {
  if (!input) return "";
  let v = input.toString().toUpperCase().trim().replace(/[-_\s]/g, "");
  if (!v.startsWith("SP")) return "";
  const nums = v.slice(2);
  if (!/^\d+$/.test(nums)) return "";
  return "SP" + nums.padStart(3, '0');
}

function empIdToNumber(empId) {
  const m = String(empId || "").toUpperCase().match(/^SP(\d+)$/);
  if (!m) return null;
  return Number(m[1]);
}

function safe(v, fallback = "---") {
  return (v === undefined || v === null || v === "") ? fallback : v;
}

function fmtDate(d) {
  try {
    const x = new Date(d);
    if (isNaN(x.getTime())) return String(d || "");
    return x.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  } catch { return String(d || ""); }
}

function routeName() {
  const h = (location.hash || "#home").replace("#", "").trim().toLowerCase();
  return h || "home";
}

function setPage(title, sub, html) {
  uiSetText($("pageTitle"), title);
  uiSetText($("pageSub"), sub);
  $("pageBody").innerHTML = html;
}

// ---------- Default Data ----------
function defaultPublicContent() {
  return {
    brand: { name: "SunPower", logoText: "sunpower", accent: "#2563eb" },
    help: { 
      phone: "(800) 876-4321", 
      email: "hr@sunpowerc.energy",
      text: "We're here to help. Contact HR for payroll questions, benefits enrollment, or any workplace concerns."
    },
    site: {
      managerPhone: "(502) 467-8976",
      safetyPhone: "(615) 786-9543",
      supervisorPhone: "(615) 786-9543",
      address: ""
    },
    home: {
      news: [{
        title: "Welcome to SunPower",
        subtitle: "Your renewable energy career starts here",
        linkText: "View updates",
        route: "notifications"
      }]
    },
    footwear: {
      programTitle: "Safety Footwear Program",
      shopUrl: "https://shop.sunpowerc.energy"
    },
    globalNotifications: []
  };
}

function defaultUserDoc(user) {
  return {
    uid: user?.uid || "",
    email: user?.email || "",
    fullName: user?.displayName || "",
    role: "employee",
    status: "pending_verification",
    employeeId: "",
    steps: [
      { id: "shift_selection", label: "Shift Selection", done: false, locked: false },
      { id: "footwear", label: "Safety Footwear", done: false, locked: true },
      { id: "i9", label: "I-9 Verification Ready", done: false, locked: true },
      { id: "photo_badge", label: "Photo Badge", done: false, locked: true },
      { id: "firstday", label: "First Day Preparation", done: false, locked: true }
    ],
    currentStep: 0,
    shift: { position: "", shift: "", approved: false },
    footwear: { ack1: false, ack2: false, ack3: false, ack4: false, ack5: false },
    i9: { ack: false },
    appointment: { date: "", time: "", address: "", notes: "" },
    notifications: [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    lastLoginAt: serverTimestamp()
  };
}

// ---------- Confetti Effect ----------
function triggerConfetti() {
  const colors = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6'];
  const container = document.createElement('div');
  container.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:9999;overflow:hidden;';
  document.body.appendChild(container);

  for (let i = 0; i < 50; i++) {
    const confetti = document.createElement('div');
    confetti.style.cssText = `
      position:absolute; width:10px; height:10px;
      background:${colors[Math.floor(Math.random() * colors.length)]};
      left:${Math.random() * 100}%; top:-10px; border-radius:2px;
      animation:confetti-fall ${1 + Math.random()}s ease-out forwards;
    `;
    container.appendChild(confetti);
  }

  const style = document.createElement('style');
  style.textContent = `@keyframes confetti-fall { to { transform:translateY(100vh) rotate(720deg); opacity:0; } }`;
  document.head.appendChild(style);

  setTimeout(() => { container.remove(); style.remove(); }, 2000);
}

// ---------- Admin Check ----------
async function isAdminUser(user) {
  if (!isFirebaseConfigured()) return false;
  try {
    const ref = doc(db, "admins", user.uid);
    const snap = await getDoc(ref);
    return snap.exists();
  } catch { return false; }
}

// ---------- UI COMPONENTS ----------
function getStepStatus(stepId, userData) {
  const steps = userData?.steps || [];
  const stepIndex = steps.findIndex(s => s.id === stepId);
  const prevStep = steps[stepIndex - 1];
  
  const isPrevDone = !prevStep || prevStep.done;
  const isCurrentDone = steps.find(s => s.id === stepId)?.done;
  
  return { isDone: isCurrentDone, isAvailable: isPrevDone, isLocked: !isPrevDone };
}

function azIcon(name) {
  const icons = {
    check: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M20 6L9 17l-5-5"/></svg>`,
    lock: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>`,
    unlock: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 019.9-1"/></svg>`,
    chevronRight: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>`,
    info: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/></svg>`,
    alert: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>`,
    briefcase: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16"/></svg>`,
    user: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
    calendar: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4"/><path d="M3 10h18"/></svg>`,
    clock: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v6l4 2"/></svg>`,
    file: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/><path d="M16 13H8"/></svg>`,
    send: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`,
    message: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a4 4 0 01-4 4H8l-5 3V7a4 4 0 014-4h10a4 4 0 014 4z"/></svg>`
  };
  return icons[name] || icons.info;
}

// ---------- ROUTE RENDERERS ----------

function renderHome(publicData, recordData, userData) {
  const steps = userData?.steps || [];
  const completedCount = steps.filter(s => s.done).length;
  const totalCount = steps.length;
  const nextStep = steps.find(s => !s.done);
  const progressPercent = Math.round((completedCount / totalCount) * 100);

  setPage("Home", "Welcome to your SunPower employee portal", `
    ${nextStep ? `
      <div style="background: linear-gradient(135deg, #dbeafe, #d1fae5); border-radius: 16px; padding: 24px; margin-bottom: 20px; border: 1px solid #93c5fd;">
        <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 16px;">
          <div style="width: 56px; height: 56px; background: #fff; border-radius: 12px; display: flex; align-items: center; justify-content: center; color: #1d4ed8;">
            ${azIcon("briefcase")}
          </div>
          <div>
            <div style="font-weight: 700; font-size: 18px; color: #1e3a8a;">Complete Your Onboarding</div>
            <div style="color: #3b82f6; font-size: 14px;">${completedCount} of ${totalCount} steps completed</div>
          </div>
        </div>
        <div style="height: 8px; background: rgba(255,255,255,.5); border-radius: 999px; overflow: hidden; margin-bottom: 16px;">
          <div style="height: 100%; width: ${progressPercent}%; background: linear-gradient(90deg, #1d4ed8, #16a34a); border-radius: 999px; transition: width .3s ease;"></div>
        </div>
        <a href="#${nextStep.id === 'shift_selection' ? 'shift' : nextStep.id}" 
           style="display: inline-flex; align-items: center; gap: 8px; background: #1d4ed8; color: #fff; padding: 12px 20px; border-radius: 10px; text-decoration: none; font-weight: 600;">
          Continue: ${escapeHtml(nextStep.label)}
          ${azIcon("chevronRight")}
        </a>
      </div>
    ` : `
      <div style="background: linear-gradient(135deg, #d1fae5, #dcfce7); border-radius: 16px; padding: 24px; margin-bottom: 20px; border: 1px solid #86efac; text-align: center;">
        <div style="width: 64px; height: 64px; background: #fff; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px; color: #16a34a;">
          ${azIcon("check")}
        </div>
        <div style="font-weight: 700; font-size: 20px; color: #166534; margin-bottom: 8px;">Onboarding Complete!</div>
        <div style="color: #15803d;">You're all set for your first day at SunPower.</div>
      </div>
    `}

    <div style="display: grid; gap: 16px; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));">
      <div style="background: #fff; border-radius: 12px; padding: 20px; border: 1px solid #e5e7eb;">
        <div style="font-weight: 600; font-size: 16px; margin-bottom: 8px; color: #111827;">My Schedule</div>
        <div style="color: #6b7280; font-size: 14px; margin-bottom: 16px;">View your upcoming shifts and availability</div>
        <a href="#schedule" style="color: #1d4ed8; text-decoration: none; font-weight: 500; display: flex; align-items: center; gap: 4px;">
          View schedule ${azIcon("chevronRight")}
        </a>
      </div>
      
      <div style="background: #fff; border-radius: 12px; padding: 20px; border: 1px solid #e5e7eb;">
        <div style="font-weight: 600; font-size: 16px; margin-bottom: 8px; color: #111827;">HR Chat</div>
        <div style="color: #6b7280; font-size: 14px; margin-bottom: 16px;">Message directly with Human Resources</div>
        <a href="#chat" style="color: #1d4ed8; text-decoration: none; font-weight: 500; display: flex; align-items: center; gap: 4px;">
          Open chat ${azIcon("chevronRight")}
        </a>
      </div>
      
      <div style="background: #fff; border-radius: 12px; padding: 20px; border: 1px solid #e5e7eb;">
        <div style="font-weight: 600; font-size: 16px; margin-bottom: 8px; color: #111827;">Payroll</div>
        <div style="color: #6b7280; font-size: 14px; margin-bottom: 16px;">Access pay stubs and direct deposit</div>
        <a href="#payroll" style="color: #1d4ed8; text-decoration: none; font-weight: 500; display: flex; align-items: center; gap: 4px;">
          View payroll ${azIcon("chevronRight")}
        </a>
      </div>
    </div>
  `);
}

function renderProgress(userData, recordData) {
  const steps = userData?.steps || [];
  const completedSteps = steps.filter(s => s.done);
  const pendingSteps = steps.filter(s => !s.done);
  const progressPercent = Math.round((completedSteps.length / steps.length) * 100);
  const currentStepIndex = steps.findIndex(s => !s.done);

  const stepDescriptions = {
    shift_selection: "Select your preferred shift and position",
    footwear: "Purchase required safety footwear",
    i9: "Prepare documents for I-9 verification",
    photo_badge: "Complete photo ID at facility",
    firstday: "Final preparation for first day"
  };

  setPage("Progress", "Your onboarding journey", `
    <div style="background: linear-gradient(135deg, #dbeafe, #eff6ff); border-radius: 16px; padding: 24px; margin-bottom: 24px; border: 1px solid #bfdbfe;">
      <div style="text-align: center; margin-bottom: 20px;">
        <div style="font-size: 48px; margin-bottom: 12px;">🎯</div>
        <div style="font-weight: 700; font-size: 28px; color: #1e40af; margin-bottom: 8px;">${progressPercent}% Complete</div>
        <div style="color: #3b82f6; font-size: 14px;">
          ${pendingSteps.length > 0 ? `Next: ${pendingSteps[0].label}` : "All steps completed!"}
        </div>
      </div>
      <div style="height: 12px; background: rgba(255,255,255,.6); border-radius: 999px; overflow: hidden;">
        <div style="height: 100%; width: ${progressPercent}%; background: linear-gradient(90deg, #1d4ed8, #16a34a); border-radius: 999px;"></div>
      </div>
    </div>

    <div style="display: flex; flex-direction: column; gap: 16px;">
      ${steps.map((step, index) => {
        const isCompleted = step.done;
        const isCurrent = index === currentStepIndex;
        const isLocked = index > currentStepIndex;
        
        return `
          <div style="
            background: ${isCompleted ? '#f0fdf4' : isCurrent ? '#fff' : '#f9fafb'}; 
            border-radius: 12px; 
            padding: 20px; 
            border: 2px solid ${isCompleted ? '#86efac' : isCurrent ? '#1d4ed8' : '#e5e7eb'};
            opacity: ${isLocked ? 0.6 : 1};
          ">
            <div style="display: flex; align-items: center; gap: 16px;">
              <div style="
                width: 40px; height: 40px; border-radius: 50%;
                background: ${isCompleted ? '#16a34a' : isCurrent ? '#1d4ed8' : '#e5e7eb'};
                color: ${isCompleted || isCurrent ? '#fff' : '#9ca3af'};
                display: flex; align-items: center; justify-content: center;
              ">
                ${isCompleted ? azIcon("check") : isCurrent ? azIcon("unlock") : azIcon("lock")}
              </div>
              <div style="flex: 1;">
                <div style="font-weight: 600; font-size: 16px; color: #111827; margin-bottom: 4px;">
                  ${index + 1}. ${escapeHtml(step.label)}
                </div>
                <div style="font-size: 13px; color: #6b7280;">
                  ${stepDescriptions[step.id] || ''}
                </div>
              </div>
              <div style="
                padding: 6px 12px; border-radius: 999px; font-size: 12px; font-weight: 600;
                background: ${isCompleted ? '#dcfce7' : isCurrent ? '#dbeafe' : '#f3f4f6'};
                color: ${isCompleted ? '#166534' : isCurrent ? '#1e40af' : '#6b7280'};
              ">
                ${isCompleted ? 'Completed' : isCurrent ? 'In Progress' : 'Locked'}
              </div>
            </div>
            ${isCurrent ? `
              <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid #e5e7eb;">
                <a href="#${step.id === 'shift_selection' ? 'shift' : step.id}" 
                   style="display: inline-flex; align-items: center; gap: 8px; 
                          background: #1d4ed8; color: #fff; padding: 10px 20px; 
                          border-radius: 8px; text-decoration: none; font-weight: 500;">
                  Continue to ${escapeHtml(step.label)}
                  ${azIcon("chevronRight")}
                </a>
              </div>
            ` : ''}
          </div>
        `;
      }).join('')}
    </div>
  `);
}

// ---------- ONBOARDING PAGES ----------

function renderShiftSelection(userData, saveUserPatch) {
  const status = getStepStatus("shift_selection", userData);
  
  if (status.isDone) {
    const shift = userData?.shift || {};
    setPage("Shift Selection", "Completed", `
      <div style="background: linear-gradient(135deg, #f0fdf4, #dcfce7); border-radius: 16px; padding: 32px; text-align: center; border: 1px solid #86efac;">
        <div style="width: 80px; height: 80px; background: #fff; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px; color: #16a34a;">
          ${azIcon("check")}
        </div>
        <div style="font-weight: 700; font-size: 22px; color: #166534; margin-bottom: 8px;">Shift Selected Successfully</div>
        <div style="color: #15803d; margin-bottom: 24px;">Your preferences have been saved and sent to HR for confirmation.</div>
        
        <div style="background: #fff; border-radius: 12px; padding: 20px; text-align: left; margin-bottom: 24px;">
          <div style="font-weight: 600; margin-bottom: 12px; color: #111827;">Your Selection</div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
            <div>
              <div style="font-size: 12px; color: #6b7280; text-transform: uppercase;">Position</div>
              <div style="font-weight: 600; color: #111827; margin-top: 4px;">${escapeHtml(shift.position || 'Not selected')}</div>
            </div>
            <div>
              <div style="font-size: 12px; color: #6b7280; text-transform: uppercase;">Shift</div>
              <div style="font-weight: 600; color: #111827; margin-top: 4px;">${escapeHtml(shift.shift || 'Not selected')}</div>
            </div>
          </div>
        </div>
        
        <a href="#footwear" style="display: inline-flex; align-items: center; gap: 8px; background: #16a34a; color: #fff; padding: 14px 28px; border-radius: 10px; text-decoration: none; font-weight: 600;">
          Continue to Safety Footwear
          ${azIcon("chevronRight")}
        </a>
      </div>
    `);
    return;
  }

  const positions = [
    { key: "assembler", title: "Solar Panel Assembler", desc: "Assemble and test solar panels", pay: "$18–$23/hr" },
    { key: "material", title: "Material Handler", desc: "Receive, store, and distribute materials", pay: "$18–$22/hr" },
    { key: "qc", title: "Quality Control Inspector", desc: "Inspect panels for defects", pay: "$19–$24/hr" },
    { key: "shipping", title: "Shipping & Receiving", desc: "Prepare products for shipment", pay: "$18–$22/hr" }
  ];

  const shifts = [
    { key: "early", title: "Early Shift", hours: "6:00 AM – 2:30 PM", desc: "Morning schedule" },
    { key: "mid", title: "Mid Shift", hours: "2:00 PM – 10:30 PM", desc: "Afternoon to evening" },
    { key: "late", title: "Late Shift", hours: "10:00 PM – 6:30 AM", desc: "Overnight +$1.50/hr differential" },
    { key: "weekend", title: "Weekend Shift", hours: "Fri-Sun 12hr shifts", desc: "Work 36hrs, paid for 40hrs" }
  ];

  setPage("Shift Selection", "Choose your work preferences", `
    <div style="background: #dbeafe; border-radius: 12px; padding: 16px; margin-bottom: 20px; border: 1px solid #93c5fd;">
      <div style="display: flex; align-items: center; gap: 12px; color: #1e40af;">
        ${azIcon("info")}
        <div style="font-size: 14px;">Preferences are not final assignments. HR will confirm based on availability.</div>
      </div>
    </div>

    <div style="margin-bottom: 24px;">
      <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 16px; color: #111827;">Select Position</h3>
      <div style="display: flex; flex-direction: column; gap: 12px;">
        ${positions.map(pos => `
          <label style="display: flex; gap: 12px; align-items: flex-start; padding: 16px; border: 2px solid #e5e7eb; border-radius: 12px; cursor: pointer; transition: all 0.2s;" 
                 onmouseover="this.style.borderColor='#93c5fd'" onmouseout="this.style.borderColor='#e5e7eb'"
                 class="pos-option">
            <input type="radio" name="position" value="${pos.key}" style="margin-top: 4px; width: 18px; height: 18px; accent-color: #1d4ed8;">
            <div style="flex: 1;">
              <div style="font-weight: 600; color: #111827; margin-bottom: 4px;">${escapeHtml(pos.title)}</div>
              <div style="font-size: 13px; color: #6b7280; margin-bottom: 4px;">${escapeHtml(pos.desc)}</div>
              <div style="font-size: 13px; color: #16a34a; font-weight: 600;">${escapeHtml(pos.pay)}</div>
            </div>
          </label>
        `).join('')}
      </div>
    </div>

    <div style="margin-bottom: 24px;">
      <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 16px; color: #111827;">Select Shift</h3>
      <div style="display: flex; flex-direction: column; gap: 12px;">
        ${shifts.map(shift => `
          <label style="display: flex; gap: 12px; align-items: flex-start; padding: 16px; border: 2px solid #e5e7eb; border-radius: 12px; cursor: pointer; transition: all 0.2s;"
                 onmouseover="this.style.borderColor='#93c5fd'" onmouseout="this.style.borderColor='#e5e7eb'"
                 class="shift-option">
            <input type="radio" name="shift" value="${shift.key}" style="margin-top: 4px; width: 18px; height: 18px; accent-color: #1d4ed8;">
            <div style="flex: 1;">
              <div style="font-weight: 600; color: #111827; margin-bottom: 4px;">${escapeHtml(shift.title)}</div>
              <div style="font-size: 13px; color: #1d4ed8; font-weight: 600; margin-bottom: 4px;">${escapeHtml(shift.hours)}</div>
              <div style="font-size: 13px; color: #6b7280;">${escapeHtml(shift.desc)}</div>
            </div>
          </label>
        `).join('')}
      </div>
    </div>

    <button id="btnSaveShift" style="width: 100%; padding: 16px; background: #1d4ed8; color: #fff; border: none; border-radius: 12px; font-size: 16px; font-weight: 600; cursor: pointer;">
      Save Preferences
    </button>
  `);

  $("btnSaveShift").onclick = async () => {
    const position = document.querySelector('input[name="position"]:checked')?.value;
    const shift = document.querySelector('input[name="shift"]:checked')?.value;
    
    if (!position || !shift) {
      uiToast("Please select both a position and shift");
      return;
    }

    const steps = (userData.steps || []).map(s => 
      s.id === "shift_selection" ? { ...s, done: true } : s
    );
    
    // Unlock next step
    if (steps[1]) steps[1].locked = false;

    await saveUserPatch({ 
      shift: { position, shift, approved: false },
      steps,
      currentStep: 1
    });
    
    triggerConfetti();
    uiToast("Preferences saved!");
    location.hash = "#shift";
  };
}

function renderFootwear(userData, saveUserPatch, publicData) {
  const status = getStepStatus("footwear", userData);
  
  if (status.isLocked) {
    setPage("Safety Footwear", "Locked", renderLockedStep("Please complete Shift Selection first.", "#shift"));
    return;
  }

  if (status.isDone) {
    setPage("Safety Footwear", "Completed", `
      <div style="background: linear-gradient(135deg, #f0fdf4, #dcfce7); border-radius: 16px; padding: 32px; text-align: center; border: 1px solid #86efac;">
        <div style="width: 80px; height: 80px; background: #fff; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px; color: #16a34a;">
          ${azIcon("check")}
        </div>
        <div style="font-weight: 700; font-size: 22px; color: #166534; margin-bottom: 8px;">Safety Footwear Completed</div>
        <div style="color: #15803d; margin-bottom: 24px;">Remember to wear your safety shoes on your first day.</div>
        <a href="#i9" style="display: inline-flex; align-items: center; gap: 8px; background: #16a34a; color: #fff; padding: 14px 28px; border-radius: 10px; text-decoration: none; font-weight: 600;">
          Continue to I-9 Verification
          ${azIcon("chevronRight")}
        </a>
      </div>
    `);
    return;
  }

  const fw = userData?.footwear || {};
  const shopUrl = publicData?.footwear?.shopUrl || "#";

  setPage("Safety Footwear", "Required for all warehouse positions", `
    <div style="background: #fee2e2; border-radius: 12px; padding: 16px; margin-bottom: 20px; border: 1px solid #fca5a5;">
      <div style="display: flex; align-items: center; gap: 12px; color: #991b1b;">
        ${azIcon("alert")}
        <div style="font-size: 14px; font-weight: 600;">Mandatory: Must have safety shoes before first day</div>
      </div>
    </div>

    <div style="background: #fff; border-radius: 12px; padding: 20px; border: 1px solid #e5e7eb; margin-bottom: 20px;">
      <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Program Overview</h3>
      <p style="color: #6b7280; line-height: 1.6; margin-bottom: 16px;">
        SunPower provides a <strong>$100 reimbursement</strong> for approved safety footwear purchased through our designated vendor.
      </p>
      <div style="background: #eff6ff; border-radius: 8px; padding: 16px; border: 1px solid #bfdbfe;">
        <div style="font-weight: 600; color: #1e40af; margin-bottom: 8px;">Required Specifications:</div>
        <ul style="margin: 0; padding-left: 20px; color: #1e40af; font-size: 14px; line-height: 1.8;">
          <li>Steel toe or composite toe protection</li>
          <li>Slip-resistant outsole</li>
          <li>Electrical hazard protection (EH rated)</li>
          <li>ASTM F2413-18 compliant</li>
        </ul>
      </div>
    </div>

    <div style="background: #fff; border-radius: 12px; padding: 20px; border: 1px solid #e5e7eb; margin-bottom: 20px;">
      <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 16px;">Required Acknowledgements</h3>
      
      ${[
        { id: "ack1", text: "I understand that safety footwear is mandatory and must be worn at all times in operational areas.", checked: fw.ack1 },
        { id: "ack2", text: "I will purchase approved safety footwear before my first scheduled work day.", checked: fw.ack2 },
        { id: "ack3", text: "I understand that purchases must be made through the designated vendor to qualify for reimbursement.", checked: fw.ack3 },
        { id: "ack4", text: "I understand that reimbursement requires proof of purchase and completion of first week.", checked: fw.ack4 },
        { id: "ack5", text: "I acknowledge that failure to wear proper safety equipment may result in disciplinary action.", checked: fw.ack5 }
      ].map(ack => `
        <label style="display: flex; gap: 12px; align-items: flex-start; padding: 14px; border: 1px solid #e5e7eb; border-radius: 10px; margin-bottom: 10px; cursor: pointer; transition: all 0.2s;" 
               onmouseover="this.style.background='#f9fafb'" onmouseout="this.style.background='#fff'">
          <input type="checkbox" id="${ack.id}" ${ack.checked ? 'checked' : ''} style="width: 18px; height: 18px; margin-top: 2px; accent-color: #1d4ed8;">
          <span style="font-size: 14px; color: #374151; line-height: 1.5;">${ack.text}</span>
        </label>
      `).join('')}

      <button id="btnCompleteFootwear" style="width: 100%; padding: 16px; background: #1d4ed8; color: #fff; border: none; border-radius: 12px; font-size: 16px; font-weight: 600; cursor: pointer; margin-top: 16px; opacity: 0.5;" disabled>
        Complete Safety Footwear Requirement
      </button>
      
      <div style="text-align: center; margin-top: 12px; font-size: 12px; color: #6b7280;">
        By clicking complete, you certify that you understand and agree to all requirements above.
      </div>
    </div>

    <div style="background: #f9fafb; border-radius: 12px; padding: 20px; border: 1px solid #e5e7eb;">
      <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Purchase Your Safety Shoes</h3>
      <p style="color: #6b7280; line-height: 1.6; margin-bottom: 16px;">
        Visit our designated safety footwear vendor to browse approved styles. Use your employee ID at checkout.
      </p>
      <a href="${escapeHtml(shopUrl)}" target="_blank" rel="noopener" 
         style="display: inline-flex; align-items: center; gap: 8px; padding: 12px 24px; background: #fff; color: #1d4ed8; border: 2px solid #1d4ed8; border-radius: 10px; text-decoration: none; font-weight: 600;">
        Open Safety Footwear Store
        ${azIcon("chevronRight")}
      </a>
    </div>
  `);

  // Handle checkbox validation
  const checkboxes = ["ack1", "ack2", "ack3", "ack4", "ack5"];
  const btn = $("btnCompleteFootwear");
  
  function updateBtn() {
    const allChecked = checkboxes.every(id => $(id).checked);
    btn.disabled = !allChecked;
    btn.style.opacity = allChecked ? "1" : "0.5";
    btn.textContent = allChecked ? "Complete Safety Footwear Requirement" : "Confirm All Items Above";
  }
  
  checkboxes.forEach(id => $(id).addEventListener("change", updateBtn));
  updateBtn();

  btn.onclick = async () => {
    const acks = {};
    checkboxes.forEach(id => acks[id] = $(id).checked);
    
    const steps = (userData.steps || []).map(s => 
      s.id === "footwear" ? { ...s, done: true } : s
    );
    if (steps[2]) steps[2].locked = false;

    await saveUserPatch({ 
      footwear: acks,
      steps,
      currentStep: 2
    });
    
    triggerConfetti();
    uiToast("Safety footwear requirement completed!");
    location.hash = "#footwear";
  };
}

function renderI9(userData, saveUserPatch) {
  const status = getStepStatus("i9", userData);
  
  if (status.isLocked) {
    setPage("I-9 Verification", "Locked", renderLockedStep("Please complete Safety Footwear first.", "#footwear"));
    return;
  }

  if (status.isDone) {
    setPage("I-9 Verification", "Completed", `
      <div style="background: linear-gradient(135deg, #f0fdf4, #dcfce7); border-radius: 16px; padding: 32px; text-align: center; border: 1px solid #86efac;">
        <div style="width: 80px; height: 80px; background: #fff; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px; color: #16a34a;">
          ${azIcon("check")}
        </div>
        <div style="font-weight: 700; font-size: 22px; color: #166534; margin-bottom: 8px;">I-9 Acknowledged</div>
        <div style="color: #15803d; margin-bottom: 24px;">HR will verify your documents in person during orientation.</div>
        <a href="#photo_badge" style="display: inline-flex; align-items: center; gap: 8px; background: #16a34a; color: #fff; padding: 14px 28px; border-radius: 10px; text-decoration: none; font-weight: 600;">
          Continue to Photo Badge
          ${azIcon("chevronRight")}
        </a>
      </div>
    `);
    return;
  }

  setPage("I-9 Verification", "Employment eligibility verification", `
    <div style="background: #dbeafe; border-radius: 12px; padding: 16px; margin-bottom: 20px; border: 1px solid #93c5fd;">
      <div style="display: flex; align-items: center; gap: 12px; color: #1e40af;">
        ${azIcon("info")}
        <div style="font-size: 14px;">Federal requirement: Must be completed within <strong>3 business days</strong> of start date.</div>
      </div>
    </div>

    <div style="background: #fff; border-radius: 12px; padding: 20px; border: 1px solid #e5e7eb; margin-bottom: 20px;">
      <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 16px;">Document Requirements</h3>
      <p style="color: #6b7280; line-height: 1.6; margin-bottom: 16px;">
        You must present <strong>original, unexpired documents</strong> in person. Photocopies are not acceptable.
      </p>
      
      <div style="display: grid; gap: 12px;">
        <div style="background: #f0fdf4; border-radius: 10px; padding: 16px; border: 1px solid #86efac;">
          <div style="font-weight: 600; color: #166534; margin-bottom: 8px;">Option A: One Document (List A)</div>
          <div style="font-size: 13px; color: #15803d; line-height: 1.6;">
            Establishes <strong>both identity and employment authorization</strong>
            <ul style="margin: 8px 0 0 0; padding-left: 18px;">
              <li>U.S. Passport or Passport Card</li>
              <li>Permanent Resident Card (Form I-551)</li>
              <li>Employment Authorization Document (Form I-766)</li>
            </ul>
          </div>
        </div>
        
        <div style="background: #fffbeb; border-radius: 10px; padding: 16px; border: 1px solid #fcd34d;">
          <div style="font-weight: 600; color: #92400e; margin-bottom: 8px;">Option B: Two Documents (List B + List C)</div>
          <div style="font-size: 13px; color: #a16207; line-height: 1.6;">
            <strong>List B (Identity):</strong> Driver's license, state ID, school ID with photo<br>
            <strong>List C (Authorization):</strong> Social Security card, birth certificate
          </div>
        </div>
      </div>
    </div>

    <div style="background: #fff; border-radius: 12px; padding: 20px; border: 1px solid #e5e7eb; margin-bottom: 20px;">
      <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 16px;">Verification Process</h3>
      <div style="display: flex; flex-direction: column; gap: 16px;">
        ${[
          { num: "1", title: "Day 1: Document Presentation", desc: "Bring original documents to HR during orientation" },
          { num: "2", title: "Day 1-3: Physical Examination", desc: "HR representative examines and verifies documents" },
          { num: "3", title: "E-Verify Confirmation", desc: "Federal database verification (if applicable)" }
        ].map(step => `
          <div style="display: flex; gap: 12px;">
            <div style="width: 32px; height: 32px; background: #1d4ed8; color: #fff; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 14px; flex-shrink: 0;">${step.num}</div>
            <div>
              <div style="font-weight: 600; color: #111827; font-size: 14px;">${step.title}</div>
              <div style="font-size: 13px; color: #6b7280; margin-top: 2px;">${step.desc}</div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>

    <div style="background: #fff; border-radius: 12px; padding: 20px; border: 1px solid #e5e7eb;">
      <label style="display: flex; gap: 12px; align-items: flex-start; padding: 16px; border: 2px solid #e5e7eb; border-radius: 10px; cursor: pointer; margin-bottom: 16px;">
        <input type="checkbox" id="i9Ack" style="width: 18px; height: 18px; margin-top: 2px; accent-color: #1d4ed8;">
        <span style="font-size: 14px; color: #374151; line-height: 1.6;">
          I understand that I must bring original, unexpired documents on my first day to complete the Form I-9 verification process. I understand that failure to provide acceptable documentation within 3 business days will result in termination of employment as required by federal law.
        </span>
      </label>

      <button id="btnI9Save" style="width: 100%; padding: 16px; background: #1d4ed8; color: #fff; border: none; border-radius: 12px; font-size: 16px; font-weight: 600; cursor: pointer; opacity: 0.5;" disabled>
        Confirm I-9 Understanding
      </button>
    </div>

    <div style="background: #fee2e2; border-radius: 12px; padding: 16px; margin-top: 20px; border: 1px solid #fca5a5;">
      <div style="display: flex; align-items: center; gap: 12px; color: #991b1b; margin-bottom: 8px;">
        ${azIcon("alert")}
        <div style="font-weight: 600;">Important Notice</div>
      </div>
      <div style="font-size: 13px; color: #991b1b; line-height: 1.6;">
        Payroll activation is contingent upon successful I-9 completion. No exceptions can be made per federal regulations 8 U.S.C. § 1324a.
      </div>
    </div>
  `);

  const ack = $("i9Ack");
  const btn = $("btnI9Save");
  
  ack.addEventListener("change", () => {
    btn.disabled = !ack.checked;
    btn.style.opacity = ack.checked ? "1" : "0.5";
  });

  btn.onclick = async () => {
    if (!ack.checked) return;
    
    const steps = (userData.steps || []).map(s => 
      s.id === "i9" ? { ...s, done: true } : s
    );
    if (steps[3]) steps[3].locked = false;

    await saveUserPatch({ 
      i9: { ack: true },
      steps,
      currentStep: 3
    });
    
    triggerConfetti();
    uiToast("I-9 acknowledged successfully!");
    location.hash = "#i9";
  };
}

function renderPhotoBadge(userData) {
  const status = getStepStatus("photo_badge", userData);
  
  if (status.isLocked) {
    setPage("Photo Badge", "Locked", renderLockedStep("Please complete I-9 Verification first.", "#i9"));
    return;
  }

  setPage("Photo Badge", "Facility identification badge", `
    <div style="background: linear-gradient(135deg, #fffbeb, #fef3c7); border-radius: 16px; padding: 32px; text-align: center; border: 1px solid #fcd34d;">
      <div style="width: 80px; height: 80px; background: #fff; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px; color: #d97706;">
        ${azIcon("user")}
      </div>
      <div style="font-weight: 700; font-size: 22px; color: #92400e; margin-bottom: 8px;">Photo Badge Required</div>
      <div style="color: #b45309; margin-bottom: 24px; line-height: 1.6;">
        Your photo identification badge will be created during your first day orientation.<br>
        This step <strong>cannot be completed online</strong>.
      </div>
      
      <div style="background: #fff; border-radius: 12px; padding: 20px; text-align: left; margin-bottom: 24px;">
        <div style="font-weight: 600; color: #111827; margin-bottom: 12px;">What to Expect:</div>
        <ul style="margin: 0; padding-left: 20px; color: #374151; line-height: 2;">
          <li>Professional photo taken by HR staff</li>
          <li>Badge printed with your name, photo, and employee ID</li>
          <li>Access permissions programmed for your assigned areas</li>
          <li>Safety briefing on badge usage</li>
        </ul>
      </div>

      <div style="background: #fef3c7; border-radius: 10px; padding: 16px; margin-bottom: 24px;">
        <div style="font-weight: 600; color: #92400e; margin-bottom: 4px;">⏳ Status: Pending First Day</div>
        <div style="font-size: 14px; color: #b45309;">This step will be marked complete after you receive your badge during orientation.</div>
      </div>

      <a href="#firstday" style="display: inline-flex; align-items: center; gap: 8px; background: #d97706; color: #fff; padding: 14px 28px; border-radius: 10px; text-decoration: none; font-weight: 600;">
        View First Day Instructions
        ${azIcon("chevronRight")}
      </a>
    </div>
  `);
}

function renderFirstDay(userData, recordData) {
  const status = getStepStatus("firstday", userData);
  
  if (status.isLocked) {
    setPage("First Day", "Locked", renderLockedStep("Please complete previous onboarding steps first.", "#progress"));
    return;
  }

  const appt = recordData?.appointment || userData?.appointment || {};

  setPage("First Day Instructions", "Everything you need for a successful start", `
    <div style="background: linear-gradient(135deg, #dbeafe, #eff6ff); border-radius: 16px; padding: 32px; text-align: center; border: 1px solid #bfdbfe; margin-bottom: 24px;">
      <div style="font-size: 48px; margin-bottom: 16px;">🎉</div>
      <div style="font-weight: 700; font-size: 24px; color: #1e40af; margin-bottom: 8px;">Your First Day at SunPower</div>
      <div style="color: #3b82f6;">We're excited to have you join our team!</div>
    </div>

    <div style="background: #fff; border-radius: 12px; padding: 20px; border: 1px solid #e5e7eb; margin-bottom: 20px;">
      <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 16px; color: #111827;">📍 Appointment Details</h3>
      <div style="display: grid; gap: 16px;">
        ${[
          { icon: "calendar", label: "Date", value: appt.date || "To be confirmed by HR" },
          { icon: "clock", label: "Time", value: appt.time || "To be confirmed by HR" },
          { icon: "info", label: "Location", value: appt.address || "To be confirmed by HR" }
        ].map(item => `
          <div style="display: flex; gap: 12px; align-items: center;">
            <div style="width: 40px; height: 40px; background: #eff6ff; border-radius: 10px; display: flex; align-items: center; justify-content: center; color: #1d4ed8;">
              ${azIcon(item.icon)}
            </div>
            <div>
              <div style="font-size: 11px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">${item.label}</div>
              <div style="font-weight: 600; color: #111827; margin-top: 2px;">${escapeHtml(item.value)}</div>
            </div>
          </div>
        `).join('')}
      </div>
      ${appt.notes ? `
        <div style="margin-top: 16px; padding: 12px; background: #fffbeb; border-radius: 8px; border: 1px solid #fcd34d; color: #92400e; font-size: 13px;">
          <strong>Special Instructions:</strong> ${escapeHtml(appt.notes)}
        </div>
      ` : ''}
    </div>

    <div style="background: #fff; border-radius: 12px; padding: 20px; border: 1px solid #e5e7eb; margin-bottom: 20px;">
      <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 16px; color: #111827;">✅ What to Bring</h3>
      <div style="display: flex; flex-direction: column; gap: 12px;">
        ${[
          "Government-issued Photo ID (Driver's license, state ID, or passport)",
          "Social Security Card or Birth Certificate (original documents)",
          "Safety Footwear (steel/composite toe boots - required)",
          "Smartphone (to download SunPower Employee App)",
          "Banking Information (voided check or account details)",
          "Water Bottle & Light Snack (orientation is 4-6 hours)"
        ].map(item => `
          <div style="display: flex; gap: 12px; align-items: flex-start;">
            <div style="width: 24px; height: 24px; background: #dcfce7; border-radius: 6px; display: flex; align-items: center; justify-content: center; color: #16a34a; font-weight: 700; font-size: 12px; flex-shrink: 0;">✓</div>
            <span style="font-size: 14px; color: #374151; line-height: 1.5;">${item}</span>
          </div>
        `).join('')}
      </div>
    </div>

    <div style="background: #fff; border-radius: 12px; padding: 20px; border: 1px solid #e5e7eb; margin-bottom: 20px;">
      <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 16px; color: #111827;">🎬 First Day Agenda</h3>
      <div style="display: flex; flex-direction: column; gap: 16px;">
        ${[
          { time: "8:00 AM", title: "Check-in & Welcome", desc: "HR reception, badge photo, facility tour" },
          { time: "9:00 AM", title: "I-9 Verification", desc: "Document review and E-Verify processing" },
          { time: "10:30 AM", title: "Safety Orientation", desc: "PPE requirements, emergency procedures" },
          { time: "12:00 PM", title: "Lunch Break", desc: "Cafeteria orientation, meet your team" },
          { time: "1:00 PM", title: "Systems Setup", desc: "App download, direct deposit, benefits overview" },
          { time: "2:30 PM", title: "Department Assignment", desc: "Meet your supervisor, workstation assignment" }
        ].map(item => `
          <div style="display: flex; gap: 12px;">
            <div style="width: 70px; text-align: right; font-weight: 600; font-size: 13px; color: #6b7280; flex-shrink: 0;">${item.time}</div>
            <div style="flex: 1; padding-left: 12px; border-left: 2px solid #e5e7eb;">
              <div style="font-weight: 600; color: #111827; font-size: 14px;">${item.title}</div>
              <div style="font-size: 12px; color: #6b7280; margin-top: 2px;">${item.desc}</div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>

    <div style="background: #fee2e2; border-radius: 12px; padding: 16px; border: 1px solid #fca5a5;">
      <div style="display: flex; align-items: center; gap: 12px; color: #991b1b; margin-bottom: 8px;">
        ${azIcon("alert")}
        <div style="font-weight: 600;">Important Reminders</div>
      </div>
      <ul style="margin: 0; padding-left: 20px; color: #991b1b; font-size: 13px; line-height: 1.8;">
        <li>Arrive 15 minutes early to allow time for parking and check-in</li>
        <li>Wear comfortable business casual attire (safety gear provided)</li>
        <li>No open-toed shoes, sandals, or heels permitted in facility</li>
        <li>Bring a positive attitude and questions for your team!</li>
      </ul>
    </div>

    ${!status.isDone ? `
      <button id="btnFirstDayComplete" style="width: 100%; padding: 18px; background: #16a34a; color: #fff; border: none; border-radius: 12px; font-size: 16px; font-weight: 600; cursor: pointer; margin-top: 24px;">
        I Completed My First Day
      </button>
      <div style="text-align: center; margin-top: 12px; font-size: 12px; color: #6b7280;">
        Only click this button after you have completed your first day orientation.
      </div>
    ` : `
      <div style="background: linear-gradient(135deg, #f0fdf4, #dcfce7); border-radius: 12px; padding: 20px; text-align: center; border: 1px solid #86efac; margin-top: 24px;">
        <div style="font-weight: 700; font-size: 18px; color: #166534; margin-bottom: 4px;">✓ First Day Completed!</div>
        <div style="color: #15803d;">Welcome to the SunPower team!</div>
      </div>
    `}
  `);

  const btn = $("btnFirstDayComplete");
  if (btn) {
    btn.onclick = async () => {
      if (!confirm("Confirm that you have completed your first day orientation?")) return;
      
      const steps = (userData.steps || []).map(s => 
        s.id === "firstday" ? { ...s, done: true } : s
      );

      await saveUserPatch({ 
        steps,
        currentStep: 5,
        status: "active"
      });
      
      triggerConfetti();
      uiToast("Congratulations! Onboarding complete.");
      location.hash = "#firstday";
    };
  }
}

// Helper for locked steps
function renderLockedStep(message, linkHref) {
  return `
    <div style="background: #f9fafb; border-radius: 16px; padding: 40px 24px; text-align: center; border: 1px solid #e5e7eb;">
      <div style="width: 64px; height: 64px; background: #e5e7eb; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px; color: #9ca3af;">
        ${azIcon("lock")}
      </div>
      <div style="font-weight: 700; font-size: 18px; color: #374151; margin-bottom: 8px;">Step Locked</div>
      <div style="color: #6b7280; margin-bottom: 24px; line-height: 1.5;">${message}</div>
      <a href="${linkHref}" style="display: inline-flex; align-items: center; gap: 8px; background: #1d4ed8; color: #fff; padding: 12px 24px; border-radius: 10px; text-decoration: none; font-weight: 600;">
        Go to Previous Step
        ${azIcon("chevronRight")}
      </a>
    </div>
  `;
}

// ---------- CHAT - HR Communication ----------

function renderChat(userData, empId) {
  setPage("HR Chat", "Direct messaging with Human Resources", `
    <div style="background: #fff; border-radius: 16px; border: 1px solid #e5e7eb; overflow: hidden; display: flex; flex-direction: column; height: 60vh;">
      <div style="background: #f9fafb; padding: 16px; border-bottom: 1px solid #e5e7eb; font-weight: 600; color: #374151;">
        Chat with HR Team
      </div>
      <div id="chatMessages" style="flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 12px;">
        <div style="align-self: flex-start; max-width: 80%; padding: 12px 16px; background: #f3f4f6; border-radius: 16px; border-bottom-left-radius: 4px; color: #374151; font-size: 14px;">
          <div>Welcome to SunPower HR Chat! How can we help you today?</div>
          <div style="font-size: 11px; color: #9ca3af; margin-top: 4px;">HR Team</div>
        </div>
      </div>
      <div style="padding: 12px; border-top: 1px solid #e5e7eb; display: flex; gap: 8px;">
        <input type="text" id="chatInput" placeholder="Type your message..." maxlength="500" 
               style="flex: 1; padding: 12px; border: 1px solid #e5e7eb; border-radius: 10px; font-size: 14px; outline: none;">
        <button id="btnSendChat" style="width: 44px; height: 44px; background: #1d4ed8; color: #fff; border: none; border-radius: 10px; display: flex; align-items: center; justify-content: center; cursor: pointer;">
          ${azIcon("send")}
        </button>
      </div>
    </div>

    <div style="background: #fff; border-radius: 12px; padding: 20px; border: 1px solid #e5e7eb; margin-top: 16px;">
      <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px; color: #111827;">Chat Hours</h3>
      <div style="color: #6b7280; font-size: 14px; line-height: 1.6;">
        <strong>Monday - Friday:</strong> 8:00 AM - 6:00 PM EST<br>
        <strong>Saturday:</strong> 9:00 AM - 2:00 PM EST<br>
        <strong>Sunday:</strong> Closed<br><br>
        For urgent matters outside these hours, please call HR Emergency Line: (800) 876-4321
      </div>
    </div>
  `);

  const messagesContainer = $("chatMessages");
  const input = $("chatInput");
  const sendBtn = $("btnSendChat");

  // Load existing messages
  loadChatMessages(empId);

  const sendMessage = async () => {
    const text = input.value.trim();
    if (!text) return;

    // Add to UI immediately
    addMessageToUI(text, "employee", new Date().toLocaleTimeString());
    input.value = "";

    if (!isFirebaseConfigured()) return;

    try {
      const chatRef = CHAT_DOC(empId);
      const snap = await getDoc(chatRef);
      
      const message = {
        sender: "employee",
        text: text,
        timestamp: serverTimestamp(),
        read: false
      };

      if (snap.exists()) {
        await updateDoc(chatRef, {
          messages: arrayUnion(message),
          updatedAt: serverTimestamp()
        });
      } else {
        await setDoc(chatRef, {
          messages: [message],
          employeeId: empId,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }
    } catch (e) {
      console.error("Error sending message:", e);
      uiToast("Failed to send message. Please try again.");
    }
  };

  sendBtn.onclick = sendMessage;
  input.addEventListener("keypress", (e) => {
    if (e.key === "Enter") sendMessage();
  });
}

function addMessageToUI(text, sender, time) {
  const container = $("chatMessages");
  if (!container) return;

  const msgDiv = document.createElement("div");
  msgDiv.style.cssText = sender === "employee" 
    ? "align-self: flex-end; max-width: 80%; padding: 12px 16px; background: #dbeafe; border-radius: 16px; border-bottom-right-radius: 4px; color: #1e40af; font-size: 14px;"
    : "align-self: flex-start; max-width: 80%; padding: 12px 16px; background: #f3f4f6; border-radius: 16px; border-bottom-left-radius: 4px; color: #374151; font-size: 14px;";
  
  msgDiv.innerHTML = `
    <div>${escapeHtml(text)}</div>
    <div style="font-size: 11px; opacity: 0.7; margin-top: 4px; text-align: ${sender === 'employee' ? 'right' : 'left'};">${escapeHtml(time)}</div>
  `;
  
  container.appendChild(msgDiv);
  container.scrollTop = container.scrollHeight;
}

async function loadChatMessages(empId) {
  if (!isFirebaseConfigured() || !empId) return;

  // Unsubscribe from previous listener
  if (chatUnsubscribe) {
    chatUnsubscribe();
    chatUnsubscribe = null;
  }

  const chatRef = CHAT_DOC(empId);
  
  chatUnsubscribe = onSnapshot(chatRef, (snap) => {
    const container = $("chatMessages");
    if (!container) return;

    if (!snap.exists()) return;

    const data = snap.data();
    const messages = data.messages || [];

    // Clear and rebuild (simple approach)
    container.innerHTML = messages.map(msg => {
      const isEmployee = msg.sender === "employee";
      const time = msg.timestamp?.toDate?.() 
        ? msg.timestamp.toDate().toLocaleTimeString() 
        : "";
      
      return `
        <div style="
          align-self: ${isEmployee ? 'flex-end' : 'flex-start'}; 
          max-width: 80%; 
          padding: 12px 16px; 
          background: ${isEmployee ? '#dbeafe' : '#f3f4f6'}; 
          border-radius: 16px; 
          border-bottom-${isEmployee ? 'right' : 'left'}-radius: 4px; 
          color: ${isEmployee ? '#1e40af' : '#374151'}; 
          font-size: 14px;
        ">
          <div>${escapeHtml(msg.text)}</div>
          <div style="font-size: 11px; opacity: 0.7; margin-top: 4px; text-align: ${isEmployee ? 'right' : 'left'};">${escapeHtml(time)}</div>
        </div>
      `;
    }).join('');
    
    container.scrollTop = container.scrollHeight;
  });
}

// ---------- SCHEDULE ----------

function renderSchedule(recordData) {
  const today = new Date();
  const events = Array.isArray(recordData?.scheduleEvents) ? recordData.scheduleEvents : [];
  
  // Build calendar
  const y = today.getFullYear();
  const m = today.getMonth();
  const firstDay = new Date(y, m, 1).getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  
  let calendarHTML = '<div style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; text-align: center;">';
  
  // Headers
  ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].forEach(day => {
    calendarHTML += `<div style="padding: 8px; font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase;">${day}</div>`;
  });
  
  // Empty cells
  for (let i = 0; i < firstDay; i++) {
    calendarHTML += '<div></div>';
  }
  
  // Days
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const hasEvent = events.some(e => e.date === dateStr);
    const isToday = d === today.getDate();
    
    calendarHTML += `
      <div style="
        padding: 12px 8px; 
        border-radius: 8px; 
        font-size: 14px;
        ${isToday ? 'background: #1d4ed8; color: #fff; font-weight: 600;' : 'background: #f9fafb; color: #374151;'}
        ${hasEvent ? 'position: relative;' : ''}
      ">
        ${d}
        ${hasEvent ? `<div style="position: absolute; bottom: 4px; left: 50%; transform: translateX(-50%); width: 4px; height: 4px; background: #10b981; border-radius: 50%;"></div>` : ''}
      </div>
    `;
  }
  
  calendarHTML += '</div>';

  setPage("Schedule", "View your work schedule", `
    <div style="background: #fff; border-radius: 12px; padding: 20px; border: 1px solid #e5e7eb; margin-bottom: 20px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
        <h3 style="font-size: 16px; font-weight: 600; color: #111827;">${today.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</h3>
        <div style="display: flex; gap: 8px;">
          <button style="width: 32px; height: 32px; border: 1px solid #e5e7eb; background: #fff; border-radius: 8px; display: flex; align-items: center; justify-content: center; cursor: pointer;">‹</button>
          <button style="width: 32px; height: 32px; border: 1px solid #e5e7eb; background: #fff; border-radius: 8px; display: flex; align-items: center; justify-content: center; cursor: pointer;">›</button>
        </div>
      </div>
      ${calendarHTML}
      <div style="display: flex; gap: 16px; margin-top: 16px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #6b7280;">
        <div style="display: flex; align-items: center; gap: 6px;">
          <div style="width: 8px; height: 8px; background: #10b981; border-radius: 50%;"></div>
          <span>Scheduled</span>
        </div>
        <div style="display: flex; align-items: center; gap: 6px;">
          <div style="width: 8px; height: 8px; background: #1d4ed8; border-radius: 50%;"></div>
          <span>Today</span>
        </div>
      </div>
    </div>

    <div style="background: #fff; border-radius: 12px; padding: 20px; border: 1px solid #e5e7eb;">
      <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px; color: #111827;">Upcoming Shifts</h3>
      ${events.length > 0 ? events.slice(0, 5).map(ev => `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px solid #f3f4f6;">
          <div>
            <div style="font-weight: 500; color: #111827;">${escapeHtml(ev.title || 'Scheduled Shift')}</div>
            <div style="font-size: 13px; color: #6b7280; margin-top: 2px;">${fmtDate(ev.date)} • ${escapeHtml(ev.time || 'TBD')}</div>
          </div>
          <span style="padding: 4px 12px; background: #dbeafe; color: #1e40af; border-radius: 999px; font-size: 12px; font-weight: 500;">${escapeHtml(ev.status || 'Confirmed')}</span>
        </div>
      `).join('') : `
        <div style="text-align: center; padding: 40px 20px; color: #9ca3af;">
          <div style="font-size: 48px; margin-bottom: 12px;">📅</div>
          <div style="font-weight: 500; margin-bottom: 4px;">No scheduled shifts yet</div>
          <div style="font-size: 13px;">Your schedule will appear here after your first day</div>
        </div>
      `}
    </div>

    <div style="background: #eff6ff; border-radius: 12px; padding: 16px; border: 1px solid #bfdbfe; margin-top: 20px;">
      <div style="display: flex; align-items: center; gap: 12px; color: #1e40af;">
        ${azIcon("info")}
        <div style="font-size: 14px;">Your official schedule will be available after your first day of work.</div>
      </div>
    </div>
  `);
}

// ---------- PAYROLL ----------

function renderPayroll(recordData) {
  setPage("Payroll", "Compensation and payment information", `
    <div style="background: #f9fafb; border-radius: 16px; padding: 40px 24px; text-align: center; border: 1px solid #e5e7eb; margin-bottom: 20px;">
      <div style="font-size: 64px; margin-bottom: 16px;">💰</div>
      <div style="font-weight: 700; font-size: 20px; color: #111827; margin-bottom: 12px;">Payroll Access Coming Soon</div>
      <div style="color: #6b7280; line-height: 1.6; max-width: 400px; margin: 0 auto;">
        Your payroll information will be available after your first pay period.<br><br>
        <strong>Payment Schedule:</strong> Weekly (every Friday)<br>
        <strong>First Check:</strong> Available after completing your first week
      </div>
    </div>

    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 20px;">
      ${[
        { icon: "📄", title: "Pay Stubs", desc: "View and download" },
        { icon: "🏦", title: "Direct Deposit", desc: "Manage banking" },
        { icon: "📊", title: "Tax Forms", desc: "W-2, W-4 updates" },
        { icon: "📈", title: "Earnings History", desc: "Year-to-date totals" }
      ].map(item => `
        <div style="background: #fff; border-radius: 12px; padding: 20px; border: 1px solid #e5e7eb; text-align: center;">
          <div style="font-size: 32px; margin-bottom: 8px;">${item.icon}</div>
          <div style="font-weight: 600; color: #111827; margin-bottom: 4px;">${item.title}</div>
          <div style="font-size: 12px; color: #6b7280;">${item.desc}</div>
        </div>
      `).join('')}
    </div>

    <div style="background: #fff; border-radius: 12px; padding: 20px; border: 1px solid #e5e7eb;">
      <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px; color: #111827;">Direct Deposit Setup</h3>
      <p style="color: #6b7280; line-height: 1.6; margin-bottom: 16px;">
        Direct deposit will be configured during your first day orientation with HR. Please bring a voided check or your bank account and routing numbers to complete setup.
      </p>
      <div style="display: flex; gap: 12px; flex-wrap: wrap;">
        <div style="display: flex; align-items: center; gap: 8px; padding: 10px 16px; background: #f0fdf4; border-radius: 8px; font-size: 13px; color: #166534;">
          <span>✓</span> Voided check, OR
        </div>
        <div style="display: flex; align-items: center; gap: 8px; padding: 10px 16px; background: #f0fdf4; border-radius: 8px; font-size: 13px; color: #166534;">
          <span>✓</span> Account + routing number
        </div>
      </div>
    </div>
  `);
}

// ---------- HELP & SUPPORT ----------

function renderHelp(publicData, empId, user) {
  const help = publicData?.help || defaultPublicContent().help;
  const site = publicData?.site || defaultPublicContent().site;

  setPage("Help & Support", "Contact the SunPower HR team", `
    <div style="background: #fff; border-radius: 12px; padding: 20px; border: 1px solid #e5e7eb; margin-bottom: 20px;">
      <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 16px; color: #111827;">HR Department</h3>
      <div style="display: flex; flex-direction: column; gap: 12px;">
        <a href="tel:${help.phone.replace(/\D/g, '')}" style="display: flex; align-items: center; gap: 12px; padding: 16px; border: 1px solid #e5e7eb; border-radius: 12px; text-decoration: none; color: inherit; transition: all 0.2s;" onmouseover="this.style.background='#f9fafb'" onmouseout="this.style.background='#fff'">
          <div style="width: 40px; height: 40px; background: #eff6ff; border-radius: 10px; display: flex; align-items: center; justify-content: center; color: #1d4ed8;">
            ${azIcon("message")}
          </div>
          <div style="flex: 1;">
            <div style="font-weight: 600; color: #111827;">HR Main Line</div>
            <div style="font-size: 13px; color: #6b7280;">${help.phone}</div>
          </div>
          ${azIcon("chevronRight")}
        </a>

        <a href="mailto:${help.email}" style="display: flex; align-items: center; gap: 12px; padding: 16px; border: 1px solid #e5e7eb; border-radius: 12px; text-decoration: none; color: inherit; transition: all 0.2s;" onmouseover="this.style.background='#f9fafb'" onmouseout="this.style.background='#fff'">
          <div style="width: 40px; height: 40px; background: #eff6ff; border-radius: 10px; display: flex; align-items: center; justify-content: center; color: #1d4ed8;">
            ${azIcon("file")}
          </div>
          <div style="flex: 1;">
            <div style="font-weight: 600; color: #111827;">Email HR</div>
            <div style="font-size: 13px; color: #6b7280;">${help.email}</div>
          </div>
          ${azIcon("chevronRight")}
        </a>

        <a href="#chat" style="display: flex; align-items: center; gap: 12px; padding: 16px; border: 1px solid #e5e7eb; border-radius: 12px; text-decoration: none; color: inherit; transition: all 0.2s;" onmouseover="this.style.background='#f9fafb'" onmouseout="this.style.background='#fff'">
          <div style="width: 40px; height: 40px; background: #eff6ff; border-radius: 10px; display: flex; align-items: center; justify-content: center; color: #1d4ed8;">
            ${azIcon("message")}
          </div>
          <div style="flex: 1;">
            <div style="font-weight: 600; color: #111827;">Live Chat</div>
            <div style="font-size: 13px; color: #6b7280;">Message HR directly</div>
          </div>
          ${azIcon("chevronRight")}
        </a>
      </div>
    </div>

    <div style="background: #fff; border-radius: 12px; padding: 20px; border: 1px solid #e5e7eb; margin-bottom: 20px;">
      <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 16px; color: #111827;">Department Contacts</h3>
      <div style="display: flex; flex-direction: column; gap: 12px;">
        ${[
          { title: "Site Manager", phone: site.managerPhone, desc: "Facility operations" },
          { title: "Safety Supervisor", phone: site.safetyPhone, desc: "Safety concerns & incidents" },
          { title: "Payroll Department", phone: help.phone, desc: "Paychecks, taxes, direct deposit" }
        ].map(dept => `
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px; background: #f9fafb; border-radius: 10px;">
            <div>
              <div style="font-weight: 600; color: #111827; font-size: 14px;">${dept.title}</div>
              <div style="font-size: 12px; color: #6b7280; margin-top: 2px;">${dept.desc}</div>
            </div>
            <a href="tel:${dept.phone.replace(/\D/g, '')}" style="color: #1d4ed8; font-weight: 600; font-size: 14px; text-decoration: none;">
              ${dept.phone}
            </a>
          </div>
        `).join('')}
      </div>
    </div>

    <div style="background: #fee2e2; border-radius: 12px; padding: 16px; border: 1px solid #fca5a5; margin-bottom: 20px;">
      <div style="display: flex; align-items: center; gap: 12px; color: #991b1b; margin-bottom: 8px;">
        ${azIcon("alert")}
        <div style="font-weight: 600;">Emergency</div>
      </div>
      <p style="color: #991b1b; font-size: 14px; line-height: 1.6; margin-bottom: 12px;">
        For immediate danger or medical emergencies, call 911 first. Then notify your supervisor and HR as soon as possible.
      </p>
      <a href="tel:911" style="display: block; width: 100%; padding: 14px; background: #dc2626; color: #fff; text-align: center; border-radius: 10px; text-decoration: none; font-weight: 600;">
        Call 911 Emergency
      </a>
    </div>

    <div style="background: #fff; border-radius: 12px; padding: 20px; border: 1px solid #e5e7eb;">
      <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 16px; color: #111827;">Submit Support Ticket</h3>
      <p style="color: #6b7280; font-size: 14px; line-height: 1.6; margin-bottom: 16px;">
        For non-urgent requests, submit a ticket and we'll respond within 24 business hours.
      </p>
      
      <label style="display: block; font-size: 12px; font-weight: 600; color: #374151; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px;">Category</label>
      <select id="ticketCategory" style="width: 100%; padding: 12px; border: 1px solid #e5e7eb; border-radius: 10px; margin-bottom: 16px; font-size: 14px;">
        <option>Payroll Question</option>
        <option>Benefits Enrollment</option>
        <option>Schedule Change</option>
        <option>Safety Concern</option>
        <option>Technical Issue</option>
        <option>Other</option>
      </select>

      <label style="display: block; font-size: 12px; font-weight: 600; color: #374151; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px;">Message</label>
      <textarea id="ticketMessage" rows="4" placeholder="Describe your question or concern..." 
                style="width: 100%; padding: 12px; border: 1px solid #e5e7eb; border-radius: 10px; margin-bottom: 16px; font-size: 14px; resize: vertical;"></textarea>

      <button id="btnSubmitTicket" style="width: 100%; padding: 14px; background: #1d4ed8; color: #fff; border: none; border-radius: 10px; font-size: 16px; font-weight: 600; cursor: pointer;">
        Submit Ticket
      </button>
      <div id="ticketStatus" style="text-align: center; margin-top: 12px; font-size: 13px; color: #6b7280;"></div>
    </div>
  `);

  const btn = $("btnSubmitTicket");
  if (btn && !btn.dataset.wired) {
    btn.dataset.wired = "1";
    btn.onclick = async () => {
      const category = $("ticketCategory").value;
      const message = $("ticketMessage").value.trim();
      const status = $("ticketStatus");

      if (!message) {
        status.textContent = "Please enter a message.";
        status.style.color = "#dc2626";
        return;
      }

      if (!isFirebaseConfigured()) {
        status.textContent = "Preview mode: ticket not sent.";
        return;
      }

      try {
        await addDoc(TICKETS_COL(), {
          employeeId: empId || "",
          userUid: user?.uid || "",
          userEmail: user?.email || "",
          category,
          message,
          status: "open",
          createdAt: serverTimestamp()
        });
        
        status.textContent = "Ticket submitted! HR will respond within 24 hours.";
        status.style.color = "#16a34a";
        $("ticketMessage").value = "";
        uiToast("Ticket submitted successfully");
      } catch (e) {
        status.textContent = "Error submitting ticket. Please try again.";
        status.style.color = "#dc2626";
      }
    };
  }
}

// ---------- ROUTER ----------

function renderRoute(userData, saveUserPatch, publicData, recordData, ctx) {
  // Update active nav items
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.route === routeName());
  });

  const r = routeName();

  switch (r) {
    case "home":
      return renderHome(publicData, recordData, userData);
    case "progress":
      return renderProgress(userData, recordData);
    case "shift":
    case "shift_selection":
      return renderShiftSelection(userData, saveUserPatch);
    case "footwear":
      return renderFootwear(userData, saveUserPatch, publicData);
    case "i9":
      return renderI9(userData, saveUserPatch);
    case "photo_badge":
      return renderPhotoBadge(userData);
    case "firstday":
    case "first_day":
      return renderFirstDay(userData, recordData);
    case "schedule":
      return renderSchedule(recordData);
    case "payroll":
      return renderPayroll(recordData);
    case "chat":
      return renderChat(userData, ctx?.empId);
    case "help":
      return renderHelp(publicData, ctx?.empId, ctx?.user);
    case "more":
      // Show mobile more menu or redirect to progress
      return renderProgress(userData, recordData);
    default:
      location.hash = "#home";
      return;
  }
}

// ---------- INITIALIZATION ----------

export async function initEmployeeApp() {
  const badge = $("userBadge");
  const statusChip = $("statusShift");
  const adminBtn = $("btnAdminGo");
  const logoutBtn = $("btnLogout");

  // Logout handler
  if (logoutBtn) {
    logoutBtn.onclick = async () => {
      if (isFirebaseConfigured()) {
        const { signOut } = await import("https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js");
        await signOut(auth);
      }
      window.location.href = "./index.html";
    };
  }

  // Preview mode (no Firebase)
  if (!isFirebaseConfigured()) {
    uiSetText(badge, "PREVIEW");
    if (statusChip) {
      uiSetText(statusChip, "offline");
      statusChip.classList.remove("ok");
    }
    if (adminBtn) adminBtn.style.display = "none";

    const demoData = {
      ...defaultUserDoc({ email: "preview@demo", displayName: "Preview User", uid: "preview" }),
      employeeId: "SP001",
      status: "active"
    };
    
    const demoPublic = defaultPublicContent();
    const demoRecord = {
      appointment: { date: "2024-02-15", time: "8:00 AM", address: "123 Solar Way, Louisville, KY" },
      scheduleEvents: []
    };

    const ctx = { empId: "SP001", user: { uid: "preview", email: "preview@demo" } };
    
    const savePatch = async () => uiToast("Preview mode: changes not saved");

    if (!location.hash) location.hash = "#home";
    renderRoute(demoData, savePatch, demoPublic, demoRecord, ctx);

    window.addEventListener("hashchange", () => {
      renderRoute(demoData, savePatch, demoPublic, demoRecord, ctx);
    });

    return;
  }

  // Real Firebase mode
  onAuth(async (user) => {
    try {
      if (!user) {
        window.location.href = "./index.html";
        return;
      }

      currentUser = user;

      // Update UI
      if (statusChip) {
        uiSetText(statusChip, "online");
        statusChip.classList.add("ok");
      }

      // Check admin
      const isAdmin = await isAdminUser(user);
      if (adminBtn) adminBtn.style.display = isAdmin ? "" : "none";
      if (isAdmin) {
        adminBtn.onclick = () => window.location.href = "./admin.html";
      }

      // IMPORTANTE: La verificación ahora se hace en index.html
      // Si llegamos aquí, el usuario ya está verificado
      // Pero verificamos por si acaso
      
      const userRef = doc(db, "users", user.uid);
      const userSnap = await getDoc(userRef);
      
      if (!userSnap.exists() || !userSnap.data().verified) {
        // No debería pasar, pero redirigimos a index para verificar
        window.location.href = "./index.html";
        return;
      }

      const userData = userSnap.data();
      currentEmpId = userData.employeeId;
      uiSetText(badge, currentEmpId);

      // Setup real-time listeners
      const recordRef = RECORD_DOC(currentEmpId);
      const publicRef = PUBLIC_DOC();

      const saveUserPatch = async (patch) => {
        await updateDoc(userRef, { ...patch, updatedAt: serverTimestamp() });
      };

      const ctx = { empId: currentEmpId, user };

      // Listen to public data
      onSnapshot(publicRef, (snap) => {
        currentPublicData = snap.exists() 
          ? { ...defaultPublicContent(), ...snap.data() }
          : defaultPublicContent();
        
        if (currentUserData) {
          renderRoute(currentUserData, saveUserPatch, currentPublicData, currentRecordData, ctx);
        }
      });

      // Listen to record data (from admin)
      onSnapshot(recordRef, async (snap) => {
        currentRecordData = snap.exists() ? snap.data() : {};
        
        // Sync appointment from admin if needed
        try {
          const userSnap = await getDoc(userRef);
          const userData = userSnap.exists() ? userSnap.data() : {};
          const userAppt = userData?.appointment;
          const recAppt = currentRecordData?.appointment;
          
          if ((!userAppt?.date) && recAppt?.date) {
            await updateDoc(userRef, { 
              appointment: recAppt, 
              updatedAt: serverTimestamp() 
            });
          }
        } catch (e) { /* ignore sync errors */ }

        if (currentUserData) {
          renderRoute(currentUserData, saveUserPatch, currentPublicData, currentRecordData, ctx);
        }
      });

      // Listen to user data
      onSnapshot(userRef, (snap) => {
        if (!snap.exists()) return;
        
        const rawData = snap.data();
        const baseData = defaultUserDoc(user);
        
        // Merge steps properly
        let mergedSteps = Array.isArray(rawData.steps) ? rawData.steps : [];
        if (mergedSteps.length < baseData.steps.length) {
          mergedSteps = baseData.steps.map((s, i) => ({
            ...s,
            done: rawData.steps?.[i]?.done || false
          }));
        }

        currentUserData = {
          ...baseData,
          ...rawData,
          uid: user.uid,
          steps: mergedSteps,
          employeeId: currentEmpId
        };

        if (!location.hash) location.hash = "#home";
        renderRoute(currentUserData, saveUserPatch, currentPublicData, currentRecordData, ctx);
      });

      // Hash change handler
      window.addEventListener("hashchange", () => {
        if (currentUserData) {
          renderRoute(currentUserData, saveUserPatch, currentPublicData, currentRecordData, ctx);
        }
      });

    } catch (error) {
      console.error("Init error:", error);
      uiToast(error?.message || "Error initializing app");
    }
  });
}

// Cleanup on page unload
window.addEventListener("beforeunload", () => {
  if (chatUnsubscribe) {
    chatUnsubscribe();
    chatUnsubscribe = null;
  }
});
