// ===============================
// SunPower Employee Portal 
// ===============================

import { uiSetText, uiToast, escapeHtml } from "./ui.js";
import { isFirebaseConfigured } from "./firebase.js";
import { onAuth } from "./auth.js";

import {
  doc, getDoc, setDoc, updateDoc, onSnapshot,
  serverTimestamp, collection, addDoc, query, where, orderBy, getDocs
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

// Import db from firebase.js
import { db } from "./firebase.js";

// ---------- Firestore refs ----------
const PUBLIC_DOC = () => doc(db, "portal", "public");
const RECORD_DOC = (empId) => doc(db, "employeeRecords", empId);
const TICKETS_COL = () => collection(db, "supportTickets");
const CHAT_COL = (empId) => collection(db, "employeeRecords", empId, "chatMessages");

// ---------- Config ----------
const EMP_ID_RANGE = { min: 23, max: 200 };
const AUTO_CREATE_ALLOWED_ID = true;

// ---------- Route helpers ----------
function routeName() {
  const h = (location.hash || "#home").replace("#", "").trim().toLowerCase();
  return h || "home";
}

function setPage(title, sub, html) {
  uiSetText(document.getElementById("pageTitle"), title);
  uiSetText(document.getElementById("pageSub"), sub);
  document.getElementById("pageBody").innerHTML = html;
}

function safe(v, fallback = "—") {
  return (v === undefined || v === null || v === "") ? fallback : v;
}

function normalizeEmpId(input) {
  if (!input) return "";
  let v = input.toString().toUpperCase().trim();
  v = v.replace(/[\s-_]/g, "");
  if (!v.startsWith("SP")) return "";
  const nums = v.slice(2);
  if (!/^\d+$/.test(nums)) return "";
  return "SP" + nums;
}

function empIdToNumber(empId) {
  const m = String(empId || "").toUpperCase().match(/^SP(\d{1,6})$/);
  if (!m) return null;
  return Number(m[1]);
}

function fmtDate(d) {
  try {
    const x = new Date(d);
    if (isNaN(x.getTime())) return String(d || "");
    return x.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  } catch {
    return String(d || "");
  }
}

function fmtMonthTitle(year, monthIndex) {
  const d = new Date(year, monthIndex, 1);
  return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function telLink(phone) {
  const digits = String(phone || "").replace(/[^\d+]/g, "");
  return digits ? `tel:${digits}` : "tel:0";
}

function clamp(n, a, b) {
  n = Number(n);
  if (isNaN(n)) return a;
  return Math.max(a, Math.min(b, n));
}

function nowISODate() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function ymd(d) {
  try {
    const x = (d instanceof Date) ? d : new Date(d);
    if (isNaN(x.getTime())) return "";
    const y = x.getFullYear();
    const m = String(x.getMonth() + 1).padStart(2, "0");
    const day = String(x.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  } catch {
    return "";
  }
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
      position:absolute;
      width:10px;
      height:10px;
      background:${colors[Math.floor(Math.random() * colors.length)]};
      left:${Math.random() * 100}%;
      top:-10px;
      border-radius:2px;
      animation:confetti-fall ${1 + Math.random()}s ease-out forwards;
    `;
    container.appendChild(confetti);
  }

  const style = document.createElement('style');
  style.textContent = `
    @keyframes confetti-fall {
      to { transform:translateY(100vh) rotate(720deg); opacity:0; }
    }
  `;
  document.head.appendChild(style);

  setTimeout(() => {
    container.remove();
    style.remove();
  }, 2000);
}

// ---------- Default docs ----------
function defaultPublicContent() {
  return {
    brand: {
      name: "SunPower Corporation",
      logoText: "sunpower c",
      accent: "#2563eb"
    },
    help: {
      phone: "(800) 985-9032",
      email: "recruiter.flex@sunpowerc.energy",
      text: "We're here to help. Contact HR for payroll questions, benefits enrollment, or any workplace concerns."
    },
    site: {
      managerPhone: "(502) 748-9823",
      safetyPhone: "(615) 786-9548",
      supervisorPhone: "(615) 786-9553",
      address: ""
    },
    home: {
      news: [
        { title: "Welcome to SunPower", subtitle: "Your renewable energy career starts here", linkText: "View updates", route: "notifications" }
      ]
    },
    footwear: {
      programTitle: "Safety Footwear Program",
      shopUrl: "https://zensitez.com"
    },
    globalNotifications: []
  };
}

function defaultUserDoc(user) {
  return {
    email: user?.email || "",
    fullName: user?.displayName || "",
    role: "employee",
    status: "active",
    stage: "shift_selection",
    appointment: { date: "", time: "", address: "", notes: "" },

    steps: [
      { id: "shift_selection", label: "Shift Selection", done: false },
      { id: "footwear", label: "Safety Footwear", done: false },
      { id: "i9", label: "I-9 Verification Ready", done: false },
      { id: "photo_badge", label: "Photo Badge", done: false },
      { id: "firstday", label: "First Day Preparation", done: false }
    ],

    shift: { position: "", shift: "", shiftStartDate: "", supervisor: "", approved: false, status: "pending" },
    shiftChangeRequests: [],
    footwear: { ack1: false, ack2: false, ack3: false, ack4: false, ack5: false },
    i9: { ack: false },

    employeeId: "",
    notifications: [],

    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    lastLoginAt: serverTimestamp()
  };
}

async function ensureUserDocExists(user) {
  if (!isFirebaseConfigured()) return;

  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);

  const patch = {
    email: user?.email || "",
    fullName: user?.displayName || "",
    updatedAt: serverTimestamp(),
    lastLoginAt: serverTimestamp()
  };

  if (!snap.exists()) {
    await setDoc(ref, { ...patch, role: "employee", status: "active", createdAt: serverTimestamp() }, { merge: true });
  } else {
    await setDoc(ref, patch, { merge: true });
  }
}

// ---------- VERIFICACIÓN DE EMPLEADO ----------
async function ensureEmployeeId(user) {
  const userRef = doc(db, "users", user.uid);
  const snap = await getDoc(userRef);
  const data = snap.exists() ? snap.data() : {};

  if (data?.employeeId) return data.employeeId;

  let empId = prompt("Enter your Employee ID (example: SP023):");
  empId = normalizeEmpId(empId);

  if (!empId) throw new Error("Employee ID required. Format: SP001, SP023, etc.");

  const allowedRef = doc(db, "allowedEmployees", empId);
  const allowedSnap = await getDoc(allowedRef);

  if (!allowedSnap.exists()) {
    throw new Error(`Employee ID ${empId} NOT FOUND. Contact HR to register your ID in the admin portal first.`);
  }

  const empData = allowedSnap.data();

  if (empData.active !== true) {
    throw new Error(`Employee ID ${empId} is INACTIVE. Contact HR.`);
  }

  if (empData.uid && empData.uid !== "" && empData.uid !== user.uid) {
    throw new Error(`Employee ID ${empId} is already registered to another account.`);
  }

  await setDoc(userRef, { 
    employeeId: empId, 
    updatedAt: serverTimestamp() 
  }, { merge: true });

  await setDoc(allowedRef, {
    uid: user.uid,
    email: user.email,
    registeredAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  }, { merge: true });

  return empId;
}

// ... (resto del código de employee.js se mantiene igual, solo se removió la duplicación de Firebase)

// ===============================
// INIT
// ===============================
export async function initEmployeeApp() {
  const badge = document.getElementById("userBadge");
  const statusChip = document.getElementById("statusShift");
  
  ensureChromeOnce();
  setActiveTabsAndSidebar();

  if (!isFirebaseConfigured()) {
    uiSetText(badge, "Preview");
    if (statusChip) uiSetText(statusChip, "offline");
    
    const demoUser = defaultUserDoc({ email: "preview@demo", displayName: "Preview User", uid: "preview" });
    const demoPublic = defaultPublicContent();
    const demoRecord = {
      findShiftsText: "5 shifts available",
      vtoText: "No VTO available",
      filtersCount: 2,
      lastClockedIn: "—",
      maxHours: { max: 60, scheduledMinutes: 0 },
      punchesToday: [],
      scheduleEvents: [],
      punches: [],
      missedPunch: false,
      availableShifts: [],
      profile: {
        fullName: "Preview User",
        phone: "(555) 123-4567",
        address: "123 Demo Street",
        dateOfBirth: "01/01/1990",
        emergencyContact: "Jane Doe (555) 987-6543"
      }
    };

    const ctx = { empId: "PREVIEW", user: { uid: "preview", email: "preview@demo" } };

    if (!location.hash) location.hash = "#home";

    renderRoute(demoUser, async () => {}, demoPublic, demoRecord, ctx);
    setActiveTabsAndSidebar();

    window.addEventListener("hashchange", () => {
      renderRoute(demoUser, async () => {}, demoPublic, demoRecord, ctx);
      setActiveTabsAndSidebar();
    });

    window.addEventListener("resize", () => {
      applyChromeVisibility();
      setActiveTabsAndSidebar();
    });

    return;
  }

  onAuth(async (user) => {
    try {
      if (!user) { window.location.href = "./index.html"; return; }

      if (statusChip) {
        uiSetText(statusChip, "online");
        statusChip.classList.add("ok");
      }
     
      await ensureUserDocExists(user);

      let empId;
      try {
        empId = await ensureEmployeeId(user);
      } catch (idError) {
        alert(idError.message);
        window.location.href = "./index.html";
        return;
      }
      uiSetText(badge, empId);

      const userRef = doc(db, "users", user.uid);
      const recordRef = RECORD_DOC(empId);
      const publicRef = PUBLIC_DOC();

      const saveUserPatch = async (patch) => {
        const promises = [];
        promises.push(updateDoc(recordRef, { ...patch, updatedAt: serverTimestamp() }));
        
        if (patch.footwear || patch.steps || patch.shift) {
          const userPatch = {};
          if (patch.footwear) userPatch.footwear = patch.footwear;
          if (patch.steps) userPatch.steps = patch.steps;
          if (patch.shift) userPatch.shift = patch.shift;
          userPatch.updatedAt = serverTimestamp();
          promises.push(updateDoc(userRef, userPatch));
        }
        
        await Promise.all(promises);
      };
      
      let currentUserData = null;
      let currentPublicData = defaultPublicContent();
      let currentRecordData = {};
      const ctx = { empId, user };

      const rerender = () => {
        if (!currentUserData) return;
        ensureChromeOnce();
        applyChromeVisibility();
        renderRoute(currentUserData, saveUserPatch, currentPublicData, currentRecordData, ctx);
        setActiveTabsAndSidebar();
      };

      onSnapshot(publicRef, (snap) => {
        currentPublicData = snap.exists()
          ? { ...defaultPublicContent(), ...snap.data() }
          : defaultPublicContent();
        rerender();
      });

      onSnapshot(recordRef, async (snap) => {
        currentRecordData = snap.exists() ? (snap.data() || {}) : {};
        try {
          const u = await getDoc(userRef);
          const ud = u.exists() ? u.data() : {};
          const userHasAppt = !!(ud?.appointment && (ud.appointment.date || ud.appointment.time || ud.appointment.address));
          const recAppt = currentRecordData?.appointment || null;
          const recHasAppt = !!(recAppt && (recAppt.date || recAppt.time || recAppt.address));
          if (!userHasAppt && recHasAppt) {
            await setDoc(userRef, { appointment: recAppt, updatedAt: serverTimestamp() }, { merge: true });
          }
        } catch {}
        rerender();
      });

      onSnapshot(userRef, async (snap) => {
        if (!snap.exists()) return;
        
        const recordSnap = await getDoc(recordRef);
        const recordData = recordSnap.exists() ? recordSnap.data() : {};
        
        const d = snap.data() || {};
        const base = defaultUserDoc(user);

        const fwSource = recordData?.footwear || d?.footwear || {};
        const footwearMerged = {
          visitedStore: !!fwSource.visitedStore,
          visitedAt: fwSource.visitedAt || null,
          ack1: !!fwSource.ack1,
          ack2: !!fwSource.ack2,
          ack3: !!fwSource.ack3,
          ack4: !!fwSource.ack4,
          ack5: !!fwSource.ack5
        };

        const shiftSource = recordData?.shift || d?.shift || {};
        const shiftMerged = {
          position: shiftSource.position || "",
          shift: shiftSource.shift || "",
          status: shiftSource.status || "",
          approved: !!shiftSource.approved,
          shiftStartDate: shiftSource.shiftStartDate || "",
          supervisor: shiftSource.supervisor || ""
        };
        
        let mergedSteps = Array.isArray(d.steps) ? d.steps : [];
        const oldSteps = Array.isArray(recordData.steps) ? recordData.steps : 
                         Array.isArray(d.steps) ? d.steps : [];

        const idMapping = {
          "documents": "photo_badge",
          "badge": "photo_badge",
          "first_day": "firstday"
        };

        mergedSteps = base.steps.map(s => {
          let o = oldSteps.find(x => x.id === s.id);
          if (!o) {
            const oldId = Object.keys(idMapping).find(key => idMapping[key] === s.id);
            if (oldId) {
              o = oldSteps.find(x => x.id === oldId);
            }
          }
          if (o) {
            return { ...s, done: !!o.done, label: s.label };
          }
          return s;
        });

        currentUserData = {
          ...base,
          ...d,
          uid: user.uid,
          steps: mergedSteps,
          appointment: (d.appointment && typeof d.appointment === "object") ? d.appointment : base.appointment,
          shift: shiftMerged,
          footwear: footwearMerged,
          i9: (d.i9 && typeof d.i9 === "object") ? d.i9 : base.i9,
          notifications: Array.isArray(d.notifications) ? d.notifications : base.notifications,
          shiftChangeRequests: Array.isArray(d.shiftChangeRequests) ? d.shiftChangeRequests : []
        };

        if (!location.hash) location.hash = "#home";
        rerender();
      });

      window.addEventListener("hashchange", rerender);
      window.addEventListener("resize", () => {
        applyChromeVisibility();
        setActiveTabsAndSidebar();
      });

    } catch (e) {
      console.error(e);
      uiToast(e?.message || String(e));
    }
  });

  (function() {
    console.log('🔧 Configurando scroll correcto...');
    
    let meta = document.querySelector('meta[name="viewport"]');
    if (meta) {
      meta.content = 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no';
    }
    
    const fixCSS = `
    html, body {
        overflow-x: hidden !important;
        overflow-y: auto !important;
        max-width: 100% !important;
        width: 100% !important;
    }
    .content {
        overflow-y: auto !important;
        overflow-x: hidden !important;
        -webkit-overflow-scrolling: touch !important;
    }
    .azCard, .azMoreItem, .azRow2, .azHero, .azCalWrap,
    .benefit-card, .profile-card, .chat-container {
        max-width: 100% !important;
        overflow-x: hidden !important;
    }
    .progress-timeline, .azMoreGrid, .benefits-grid {
        width: 100% !important;
        overflow-x: hidden !important;
        overflow-y: visible !important;
    }
    input, textarea, select {
        font-size: 16px !important;
        max-height: 44px !important;
    }
    `;
    
    const style = document.createElement('style');
    style.textContent = fixCSS;
    document.head.appendChild(style);
    
    document.addEventListener('gesturestart', function(e) {
      e.preventDefault();
    }, { passive: false });
    
    document.addEventListener('touchmove', function(e) {
      if (Math.abs(e.touches[0].clientX - window.touchStartX) > 10) {
        e.preventDefault();
      }
    }, { passive: false });
    
    function fixScrollAreas() {
      const scrollAreas = document.querySelectorAll('.content, .chat-messages, .azMoreGrid, .progress-timeline');
      scrollAreas.forEach(area => {
        area.style.overflowY = 'auto';
        area.style.overflowX = 'hidden';
        area.style.webkitOverflowScrolling = 'touch';
      });
      
      const progressItems = document.querySelectorAll('.progress-item');
      progressItems.forEach(item => {
        item.style.minWidth = '0';
        item.style.width = '100%';
      });
    }
    
    setTimeout(fixScrollAreas, 100);
    window.addEventListener('resize', fixScrollAreas);
    
    console.log('✅ Scroll configurado: Vertical ✓ | Horizontal ✗');
  })();

}
