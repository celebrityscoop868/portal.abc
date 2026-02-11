// ===============================
// SunPower Employee Portal - Complete Optimized Version
// Professional HR Portal for Solar Manufacturing Workforce
// ===============================

import { uiSetText, uiToast, escapeHtml } from "./ui.js";
import { db, isFirebaseConfigured } from "./firebase.js";
import { onAuth } from "./auth.js";

import {
  doc, getDoc, setDoc, updateDoc, onSnapshot,
  serverTimestamp, collection, addDoc, query, where, orderBy, getDocs
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

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
      name: "SunPower",
      logoText: "sunpower",
      accent: "#2563eb"
    },
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
      news: [
        { title: "Welcome to SunPower", subtitle: "Your renewable energy career starts here", linkText: "View updates", route: "notifications" }
      ]
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

// ---------- VERIFICACIÓN DE EMPLEADO (SIN ADMIN_EMAILS) ----------
async function ensureEmployeeId(user) {
  const userRef = doc(db, "users", user.uid);
  const snap = await getDoc(userRef);
  const data = snap.exists() ? snap.data() : {};

  // Si ya tiene ID asignado, retornarlo
  if (data?.employeeId) return data.employeeId;

  // Pedir ID al usuario
  let empId = prompt("Enter your Employee ID (example: SP023):");
  empId = normalizeEmpId(empId);

  if (!empId) throw new Error("Employee ID required. Format: SP001, SP023, etc.");

  // ✅ VALIDACIÓN ESTRICTA: Verificar que exista en allowedEmployees
  const allowedRef = doc(db, "allowedEmployees", empId);
  const allowedSnap = await getDoc(allowedRef);

  // ❌ SI NO EXISTE EN ADMIN: Error inmediato
  if (!allowedSnap.exists()) {
    throw new Error(`Employee ID ${empId} NOT FOUND. Contact HR to register your ID in the admin portal first.`);
  }

  const empData = allowedSnap.data();

  // ❌ SI ESTÁ INACTIVO: Error
  if (empData.active !== true) {
    throw new Error(`Employee ID ${empId} is INACTIVE. Contact HR.`);
  }

  // ❌ SI YA ESTÁ VINCULADO A OTRO USUARIO: Error
  if (empData.uid && empData.uid !== "" && empData.uid !== user.uid) {
    throw new Error(`Employee ID ${empId} is already registered to another account.`);
  }

  // ✅ TODO OK: Guardar en user y actualizar allowedEmployees con el UID
  await setDoc(userRef, { 
    employeeId: empId, 
    updatedAt: serverTimestamp() 
  }, { merge: true });

  // Vincular el UID en allowedEmployees para evitar re-uso
  await setDoc(allowedRef, {
    uid: user.uid,
    email: user.email,
    registeredAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  }, { merge: true });

  return empId;
}

// ===============================
// A-to-Z CHROME (NO HAMBURGER, NO EMOJIS)
// ===============================
function isMobile() {
  return window.matchMedia("(max-width: 920px)").matches;
}

function azIcon(name) {
  const common = `width="18" height="18" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`;
  const icons = {
    home: `<svg ${common}><path d="M3 10.5 12 3l9 7.5"/><path d="M5 10v10h14V10"/></svg>`,
    schedule: `<svg ${common}><rect x="3" y="4" width="18" height="18" rx="3"/><path d="M8 2v4M16 2v4"/><path d="M3 10h18"/></svg>`,
    pay: `<svg ${common}><rect x="3" y="7" width="18" height="14" rx="3"/><path d="M3 11h18"/><path d="M7 15h4"/></svg>`,
    benefits: `<svg ${common}><path d="M12 22s7-4 7-10V6l-7-3-7 3v6c0 6 7 10 7 10Z"/></svg>`,
    more: `<svg ${common}><path d="M4 6h16M4 12h16M4 18h16"/></svg>`,
    bell: `<svg ${common}><path d="M18 8a6 6 0 10-12 0c0 7-3 7-3 7h18s-3 0-3-7"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>`,
    chat: `<svg ${common}><path d="M21 15a4 4 0 01-4 4H8l-5 3V7a4 4 0 014-4h10a4 4 0 014 4z"/></svg>`,
    chevR: `<svg ${common}><path d="M9 18l6-6-6-6"/></svg>`,
    chevL: `<svg ${common}><path d="M15 18l-6-6 6-6"/></svg>`,
    dots: `<svg ${common}><path d="M5 12h.01M12 12h.01M19 12h.01"/></svg>`,
    search: `<svg ${common}><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>`,
    clock: `<svg ${common}><circle cx="12" cy="12" r="9"/><path d="M12 7v6l4 2"/></svg>`,
    check: `<svg ${common}><path d="M20 6L9 17l-5-5"/></svg>`,
    info: `<svg ${common}><circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/></svg>`,
    alert: `<svg ${common}><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>`,
    sun: `<svg ${common}><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>`,
    moon: `<svg ${common}><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>`,
    star: `<svg ${common}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
    briefcase: `<svg ${common}><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16"/></svg>`,
    user: `<svg ${common}><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
    file: `<svg ${common}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/></svg>`,
    edit: `<svg ${common}><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`,
    calendar: `<svg ${common}><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>`,
    lock: `<svg ${common}><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>`,
    unlock: `<svg ${common}><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 019.9-1"/></svg>`,
    checkCircle: `<svg ${common}><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
    send: `<svg ${common}><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`,
    message: `<svg ${common}><path d="M21 15a4 4 0 01-4 4H8l-5 3V7a4 4 0 014-4h10a4 4 0 014 4z"/></svg>`,
    building: `<svg ${common}><path d="M3 21h18M5 21V7l8-4 8 4v14M8 21v-5a2 2 0 014 0v5"/></svg>`,
    shield: `<svg ${common}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
    dollar: `<svg ${common}><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>`,
    heart: `<svg ${common}><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>`,
    award: `<svg ${common}><circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/></svg>`,
    zap: `<svg ${common}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
    camera: `<svg ${common}><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>`,
    mapPin: `<svg ${common}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>`,
    boot: `<svg ${common}><path d="M18 17H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h8l6 4v6a2 2 0 0 1-2 2z"/><path d="M6 11h12"/></svg>`,
    fileCheck: `<svg ${common}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M9 15l2 2 4-4"/></svg>`
  };
  return icons[name] || icons.dots;
}

function ensureChromeOnce() {
  const btnMenu = document.getElementById("btnMenu");
  if (btnMenu) btnMenu.style.display = "none";

  const sidebar = document.getElementById("sidebar");
  if (sidebar) sidebar.style.display = isMobile() ? "none" : "";

  if (document.getElementById("azTabs")) {
    applyChromeVisibility();
    const ov = document.getElementById("azMoreOverlay");
    const sh = document.getElementById("azMoreSheet");
    if (ov) { ov.style.display = "none"; ov.style.pointerEvents = "none"; }
    if (sh) sh.classList.remove("open");
    return;
  }

  const style = document.createElement("style");
  style.id = "azStyle";
  style.textContent = `
    body.portal.has-tabs .content{ padding-bottom: 92px; }

    #azTabs{
      position:fixed; left:0; right:0; bottom:0;
      height:72px; z-index:5000;
      background: rgba(255,255,255,.98);
      border-top:1px solid rgba(229,234,242,.95);
      display:none;
      padding-bottom: env(safe-area-inset-bottom);
      backdrop-filter: blur(10px);
    }
    #azTabs .az-wrap{
      max-width:980px; margin:0 auto;
      height:72px;
      display:grid;
      grid-template-columns: repeat(5, 1fr);
      align-items:center;
      gap:6px;
      padding:8px 10px;
    }
    .az-tab{
      display:flex; flex-direction:column; align-items:center; justify-content:center;
      gap:6px;
      border-radius:14px;
      padding:8px 6px;
      border:1px solid transparent;
      user-select:none;
      -webkit-tap-highlight-color: transparent;
      touch-action: manipulation;
      color: rgba(11,18,32,.85);
      font-weight:900;
      font-size:11px;
      background:transparent;
    }
    .az-ico{
      width:28px;height:28px;
      border-radius:999px;
      display:flex;align-items:center;justify-content:center;
      background: rgba(2,6,23,.04);
      color: rgba(2,6,23,.78);
    }
    .az-ico svg{ width:18px; height:18px; }
    .az-tab.active{ color: rgba(29,78,216,1); }
    .az-tab.active .az-ico{ background: rgba(29,78,216,.10); color: rgba(29,78,216,1); }

    #azMoreOverlay{
      position:fixed; inset:0;
      background:rgba(0,0,0,.45);
      display:none;
      pointer-events:none;
      z-index:6000;
    }
    #azMoreSheet{
      position:fixed; left:0; right:0; bottom:0;
      background:rgba(255,255,255,.98);
      border-top-left-radius:20px; border-top-right-radius:20px;
      border:1px solid rgba(229,234,242,.95);
      box-shadow: 0 18px 55px rgba(2,6,23,.18);
      transform: translateY(110%);
      transition: transform .22s ease;
      z-index:6100;
      max-height: 85vh;
      overflow:auto;
      padding-bottom: env(safe-area-inset-bottom);
    }
    #azMoreSheet.open{ transform: translateY(0); }

    .azMoreHead{
      padding:14px 14px 10px;
      display:flex;align-items:center;justify-content:space-between;
      gap:10px;
      border-bottom:1px solid rgba(229,234,242,.95);
      position:sticky; top:0; background:rgba(255,255,255,.98);
      backdrop-filter: blur(10px);
      z-index:1;
    }
    .azMoreTitle{ font-weight:1000; font-size:14px; }
    .azMoreGrid{ padding:12px 14px 16px; display:grid; grid-template-columns: 1fr; gap:10px; }
    .azMoreItem{
      display:flex; align-items:center; justify-content:space-between;
      gap:10px;
      padding:12px;
      border-radius:16px;
      border:1px solid rgba(229,234,242,.95);
      background:#fff;
      box-shadow: 0 10px 24px rgba(15,23,42,.05);
      font-weight:1000;
      text-decoration:none;
      color: inherit;
    }
    .azMoreItem .sub{ font-size:12px; font-weight:800; color: var(--muted); margin-top:4px; }
    .azMoreArrow{ display:flex; align-items:center; justify-content:center; width:18px; height:18px; color: rgba(2,6,23,.45); }
    .azMoreArrow svg{ width:18px; height:18px; }

    .azTopRow{ display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:10px; }
    .azTopIcons{ display:flex; gap:10px; }
    .azIconBtn{
      width:34px; height:34px;
      border-radius:999px;
      border:1px solid rgba(229,234,242,.95);
      background:#fff;
      display:flex;align-items:center;justify-content:center;
      box-shadow: 0 10px 22px rgba(15,23,42,.05);
      color: rgba(2,6,23,.70);
      text-decoration:none;
    }
    .azIconBtn svg{ width:18px; height:18px; }

    .azHero{
      border-radius:18px;
      overflow:hidden;
      border:1px solid rgba(229,234,242,.95);
      background: linear-gradient(180deg, rgba(2,6,23,.06), rgba(2,6,23,.02));
      box-shadow: 0 14px 30px rgba(15,23,42,.06);
    }
    .azHeroInner{ padding:12px; }
    .azHeroTitle{ font-weight:1000; font-size:13px; color: rgba(2,6,23,.78); }
    .azHeroSub{ margin-top:6px; font-weight:900; font-size:12px; color: rgba(2,6,23,.55); }
    .azHeroPills{ display:flex; gap:8px; margin-top:10px; flex-wrap:wrap; }
    .azPill{
      padding:7px 10px;
      border-radius:999px;
      border:1px solid rgba(229,234,242,.95);
      background: rgba(255,255,255,.92);
      font-weight:900;
      font-size:12px;
      color: rgba(2,6,23,.72);
      display:inline-flex;
      align-items:center;
      gap:8px;
      text-decoration:none;
    }

    .azRow2{ display:grid; grid-template-columns: 1fr 1fr; gap:10px; }
    .azCard{
      border-radius:16px;
      border:1px solid rgba(229,234,242,.95);
      background:#fff;
      box-shadow: 0 14px 30px rgba(15,23,42,.06);
      padding:12px;
    }
    .azCardTitle{ font-weight:1000; font-size:13px; }
    .azCardSub{ margin-top:6px; font-weight:900; font-size:12px; color: var(--muted); line-height:1.25; }
    .azCardLink{
      margin-top:10px;
      display:inline-flex;
      align-items:center;
      gap:6px;
      font-weight:1000;
      font-size:12px;
      color: rgba(29,78,216,1);
      text-decoration:none;
    }
    .azCardLink svg{ width:16px; height:16px; }

    .azWide{ margin-top:10px; }
    .azBar{
      height:10px; border-radius:999px;
      background: rgba(2,6,23,.08);
      overflow:hidden;
      border:1px solid rgba(229,234,242,.95);
      margin-top:10px;
    }
    .azBar > div{ height:100%; background: rgba(29,78,216,.45); width:0%; }

    .azTabsTop{
      display:flex; gap:18px; align-items:center;
      border-bottom:1px solid rgba(229,234,242,.95);
      margin: 4px 0 12px;
      padding-bottom:8px;
      overflow:auto;
      -webkit-overflow-scrolling: touch;
    }
    .azTabsTop a{
      text-decoration:none;
      font-weight:1000;
      font-size:13px;
      color: rgba(2,6,23,.55);
      padding:8px 0;
      border-bottom:3px solid transparent;
      white-space:nowrap;
    }
    .azTabsTop a.active{
      color: rgba(2,6,23,.85);
      border-bottom-color: rgba(29,78,216,.85);
    }

    .azCalWrap{
      border-radius:16px;
      border:1px solid rgba(229,234,242,.95);
      background:#fff;
      box-shadow: 0 14px 30px rgba(15,23,42,.06);
      overflow:hidden;
    }
    .azCalHead{
      display:flex; justify-content:space-between; align-items:center;
      padding:12px;
      border-bottom:1px solid rgba(229,234,242,.95);
    }
    .azCalMonth{ font-weight:1000; font-size:14px; }
    .azCalNav{ display:flex; gap:8px; }
    .azCalBtn{
      width:34px;height:34px;border-radius:999px;
      border:1px solid rgba(229,234,242,.95);
      background:#fff;
      display:flex;align-items:center;justify-content:center;
      color: rgba(2,6,23,.70);
      box-shadow: 0 10px 22px rgba(15,23,42,.05);
    }
    .azCalGrid{
      display:grid;
      grid-template-columns: repeat(7, 1fr);
      gap:0;
      padding:10px;
    }
    .azCalDow{
      font-weight:1000;
      font-size:11px;
      color: rgba(2,6,23,.45);
      padding:8px 6px;
      text-align:center;
    }
    .azDay{
      height:44px;
      display:flex;
      align-items:center;
      justify-content:center;
      position:relative;
      font-weight:1000;
      font-size:12px;
      color: rgba(2,6,23,.75);
      border-radius:10px;
      margin:2px;
      cursor:pointer;
      user-select:none;
    }
    .azDay.muted{ color: rgba(2,6,23,.28); font-weight:900; }
    .azDay.sel{ outline:2px solid rgba(29,78,216,.65); outline-offset:1px; }
    .azDay.today{ border:1px solid rgba(2,6,23,.18); }
    .azDay .dot{
      position:absolute; bottom:6px; left:50%; transform:translateX(-50%);
      width:5px;height:5px;border-radius:99px;background: rgba(2,6,23,.25);
    }
    .azLegend{
      display:flex; gap:14px; flex-wrap:wrap;
      padding:10px 12px 12px;
      border-top:1px solid rgba(229,234,242,.95);
      color: rgba(2,6,23,.55);
      font-weight:900;
      font-size:12px;
    }

    .azQuickGrid{
      display:grid;
      grid-template-columns: repeat(3, 1fr);
      gap:10px;
      margin-top:10px;
    }
    .azQuick{
      border-radius:14px;
      border:1px solid rgba(229,234,242,.95);
      background:#fff;
      box-shadow: 0 10px 22px rgba(15,23,42,.05);
      padding:12px;
      font-weight:1000;
      min-height:70px;
      display:flex;
      flex-direction:column;
      justify-content:space-between;
      color: rgba(2,6,23,.82);
      text-decoration:none;
    }
    .azQuickTop{ display:flex; align-items:center; justify-content:space-between; gap:8px; }
    .azQuickIcon{
      width:34px;height:34px;border-radius:12px;
      background: rgba(2,6,23,.05);
      display:flex;align-items:center;justify-content:center;
      color: rgba(2,6,23,.70);
    }
    .azQuickIcon svg{ width:18px;height:18px; }
    .azQuickSub{ margin-top:8px; font-weight:900; font-size:12px; color: rgba(2,6,23,.50); }

    .azPunchRow{
      display:flex; justify-content:space-between; align-items:center;
      padding:10px 0;
      border-top:1px solid rgba(229,234,242,.95);
      font-weight:1000;
    }
    .azPunchRow:first-child{ border-top:none; }
    .azPunchLeft{ display:flex; flex-direction:column; gap:4px; }
    .azPunchType{ font-size:12px; color: rgba(2,6,23,.65); }
    .azPunchTime{ font-size:14px; color: rgba(2,6,23,.85); }

    /* Chat Styles */
    .chat-container{
      border-radius:16px;
      border:1px solid rgba(229,234,242,.95);
      background:#fff;
      box-shadow: 0 14px 30px rgba(15,23,42,.06);
      overflow:hidden;
      display:flex;
      flex-direction:column;
      height:60vh;
    }
    .chat-messages{
      flex:1;
      overflow-y:auto;
      padding:16px;
      display:flex;
      flex-direction:column;
      gap:12px;
    }
    .chat-message{
      max-width:80%;
      padding:12px 16px;
      border-radius:16px;
      font-size:13px;
      line-height:1.4;
    }
    .chat-message.employee{
      align-self:flex-end;
      background:rgba(29,78,216,.10);
      color:rgba(2,6,23,.85);
      border-bottom-right-radius:4px;
    }
    .chat-message.admin{
      align-self:flex-start;
      background:rgba(2,6,23,.05);
      color:rgba(2,6,23,.85);
      border-bottom-left-radius:4px;
    }
    .chat-time{
      font-size:10px;
      color:rgba(2,6,23,.50);
      margin-top:4px;
    }
    .chat-input-area{
      padding:12px;
      border-top:1px solid rgba(229,234,242,.95);
      display:flex;
      gap:8px;
    }
    .chat-input{
      flex:1;
      padding:12px;
      border:1px solid rgba(229,234,242,.95);
      border-radius:12px;
      font-size:14px;
      outline:none;
    }
    .chat-send{
      width:44px;
      height:44px;
      border-radius:12px;
      background:rgba(29,78,216,1);
      color:#fff;
      border:none;
      display:flex;
      align-items:center;
      justify-content:center;
      cursor:pointer;
    }

    /* Benefits Grid */
    .benefits-grid{
      display:grid;
      grid-template-columns:1fr;
      gap:16px;
    }
    .benefit-card{
      border-radius:16px;
      border:1px solid rgba(229,234,242,.95);
      background:#fff;
      box-shadow: 0 14px 30px rgba(15,23,42,.06);
      padding:20px;
    }
    .benefit-header{
      display:flex;
      align-items:center;
      gap:12px;
      margin-bottom:16px;
    }
    .benefit-icon{
      width:48px;
      height:48px;
      border-radius:12px;
      display:flex;
      align-items:center;
      justify-content:center;
      font-size:24px;
    }
    .benefit-title{
      font-weight:1000;
      font-size:16px;
      color:rgba(2,6,23,.85);
    }
    .benefit-list{
      list-style:none;
      padding:0;
      margin:0;
    }
    .benefit-list li{
      padding:10px 0;
      border-bottom:1px solid rgba(229,234,242,.95);
      font-size:13px;
      color:rgba(2,6,23,.70);
      line-height:1.5;
      display:flex;
      align-items:flex-start;
      gap:8px;
    }
    .benefit-list li:last-child{
      border-bottom:none;
    }
    .benefit-list li::before{
      content:"•";
      color:rgba(29,78,216,.60);
      font-weight:1000;
    }

    /* Profile Card */
    .profile-card{
      border-radius:20px;
      border:1px solid rgba(229,234,242,.95);
      background:linear-gradient(135deg, rgba(29,78,216,.06), rgba(22,163,74,.04));
      box-shadow: 0 14px 30px rgba(15,23,42,.06);
      padding:24px;
      text-align:center;
    }
    .profile-avatar{
      width:80px;
      height:80px;
      border-radius:999px;
      background:#fff;
      margin:0 auto 16px;
      display:flex;
      align-items:center;
      justify-content:center;
      font-size:32px;
      box-shadow: 0 10px 30px rgba(15,23,42,.10);
    }
    .profile-name{
      font-weight:1000;
      font-size:18px;
      color:rgba(2,6,23,.85);
      margin-bottom:4px;
    }
    .profile-id{
      font-weight:900;
      font-size:14px;
      color:rgba(2,6,23,.60);
      margin-bottom:16px;
    }
    .profile-info{
      text-align:left;
      background:#fff;
      border-radius:12px;
      padding:16px;
      margin-top:16px;
    }
    .profile-row{
      display:flex;
      justify-content:space-between;
      padding:8px 0;
      border-bottom:1px solid rgba(229,234,242,.95);
      font-size:13px;
    }
    .profile-row:last-child{
      border-bottom:none;
    }
    .profile-label{
      color:rgba(2,6,23,.60);
      font-weight:900;
    }
    .profile-value{
      color:rgba(2,6,23,.85);
      font-weight:1000;
    }

    /* W-4 Section */
    .w4-info{
      background:linear-gradient(135deg, rgba(245,158,11,.08), rgba(245,158,11,.02));
      border:1px solid rgba(245,158,11,.20);
      border-radius:16px;
      padding:20px;
      margin-bottom:20px;
    }
    .w4-title{
      font-weight:1000;
      font-size:16px;
      color:rgba(146,64,14,1);
      margin-bottom:8px;
      display:flex;
      align-items:center;
      gap:8px;
    }
    .w4-text{
      font-size:13px;
      color:rgba(146,64,14,.80);
      line-height:1.6;
    }

    /* Progress Timeline */
    .progress-timeline{
      position:relative;
      padding-left:32px;
    }
    .progress-timeline::before{
      content:'';
      position:absolute;
      left:11px;
      top:8px;
      bottom:8px;
      width:2px;
      background:rgba(229,234,242,.95);
    }
    .progress-item{
      position:relative;
      padding-bottom:24px;
    }
    .progress-item:last-child{
      padding-bottom:0;
    }
    .progress-item-icon{
      position:absolute;
      left:-32px;
      top:0;
      width:24px;
      height:24px;
      border-radius:999px;
      display:flex;
      align-items:center;
      justify-content:center;
      z-index:1;
    }
    .progress-item.completed .progress-item-icon{
      background:rgba(22,163,74,1);
      color:#fff;
    }
    .progress-item.current .progress-item-icon{
      background:rgba(29,78,216,1);
      color:#fff;
      animation:pulse-ring 2s infinite;
    }
    .progress-item.locked .progress-item-icon{
      background:rgba(229,234,242,.95);
      color:rgba(2,6,23,.40);
    }
    @keyframes pulse-ring{
      0%{box-shadow:0 0 0 0 rgba(29,78,216,.4);}
      70%{box-shadow:0 0 0 8px rgba(29,78,216,0);}
      100%{box-shadow:0 0 0 0 rgba(29,78,216,0);}
    }
    .progress-item-card{
      background:#fff;
      border:1px solid rgba(229,234,242,.95);
      border-radius:16px;
      padding:16px;
      margin-left:8px;
      box-shadow:0 4px 12px rgba(15,23,42,.04);
    }
    .progress-item.completed .progress-item-card{
      border-color:rgba(22,163,74,.25);
      background:rgba(22,163,74,.02);
    }
    .progress-item.current .progress-item-card{
      border-color:rgba(29,78,216,.30);
      box-shadow:0 8px 24px rgba(29,78,216,.08);
    }
    .progress-item-header{
      display:flex;
      align-items:center;
      justify-content:space-between;
      margin-bottom:8px;
    }
    .progress-item-title{
      font-weight:1000;
      font-size:14px;
      color:rgba(2,6,23,.85);
    }
    .progress-item-status{
      font-weight:900;
      font-size:11px;
      padding:4px 10px;
      border-radius:999px;
      text-transform:uppercase;
      letter-spacing:0.3px;
    }
    .progress-item.completed .progress-item-status{
      background:rgba(22,163,74,.12);
      color:rgba(22,163,74,1);
    }
    .progress-item.current .progress-item-status{
      background:rgba(29,78,216,.12);
      color:rgba(29,78,216,1);
    }
    .progress-item.locked .progress-item-status{
      background:rgba(2,6,23,.06);
      color:rgba(2,6,23,.50);
    }

    @media (max-width: 420px){
      .azRow2{ grid-template-columns: 1fr; }
      .azQuickGrid{ grid-template-columns: repeat(2,1fr); }
    }
  `;
  document.head.appendChild(style);

  const tabs = document.createElement("div");
  tabs.id = "azTabs";
  tabs.innerHTML = `
    <div class="az-wrap">
      <a class="az-tab" data-route="home" href="#home">
        <div class="az-ico">${azIcon("home")}</div>
        <div>Home</div>
      </a>
      <a class="az-tab" data-route="schedule" href="#schedule">
        <div class="az-ico">${azIcon("schedule")}</div>
        <div>Schedule</div>
      </a>
      <a class="az-tab" data-route="payroll" href="#payroll">
        <div class="az-ico">${azIcon("pay")}</div>
        <div>Pay</div>
      </a>
      <a class="az-tab" data-route="timeoff" href="#timeoff">
        <div class="az-ico">${azIcon("benefits")}</div>
        <div>Benefits</div>
      </a>
      <button class="az-tab" id="azMoreBtn" type="button">
        <div class="az-ico">${azIcon("more")}</div>
        <div>More</div>
      </button>
    </div>
  `;
  document.body.appendChild(tabs);

  const overlay = document.createElement("div");
  overlay.id = "azMoreOverlay";
  document.body.appendChild(overlay);

  const sheet = document.createElement("div");
  sheet.id = "azMoreSheet";
  sheet.innerHTML = `
    <div class="azMoreHead">
      <div>
        <div class="azMoreTitle">More</div>
        <div class="small muted" style="font-weight:900;margin-top:2px;">All portal modules</div>
      </div>
      <button class="btn sm ghost" id="azMoreClose" type="button">Close</button>
    </div>

    <div class="azMoreGrid">
      <a class="azMoreItem" href="#profile">
        <div>
          <div>My Profile</div>
          <div class="sub">Personal information & documents</div>
        </div>
        <div class="azMoreArrow">${azIcon("chevR")}</div>
      </a>

      <a class="azMoreItem" href="#progress">
        <div>
          <div>Progress</div>
          <div class="sub">Onboarding checklist & status</div>
        </div>
        <div class="azMoreArrow">${azIcon("chevR")}</div>
      </a>

      <a class="azMoreItem" href="#shift">
        <div>
          <div>Shift Selection</div>
          <div class="sub">Choose your preference</div>
        </div>
        <div class="azMoreArrow">${azIcon("chevR")}</div>
      </a>

      <a class="azMoreItem" href="#footwear">
        <div>
          <div>Safety Footwear</div>
          <div class="sub">Program + acknowledgement</div>
        </div>
        <div class="azMoreArrow">${azIcon("chevR")}</div>
      </a>

      <a class="azMoreItem" href="#i9">
        <div>
          <div>I-9 Verification</div>
          <div class="sub">Employment eligibility</div>
        </div>
        <div class="azMoreArrow">${azIcon("chevR")}</div>
      </a>

      <a class="azMoreItem" href="#photo_badge">
        <div>
          <div>Photo Badge</div>
          <div class="sub">Complete at facility</div>
        </div>
        <div class="azMoreArrow">${azIcon("chevR")}</div>
      </a>

      <a class="azMoreItem" href="#firstday">
        <div>
          <div>First Day</div>
          <div class="sub">Instructions & preparation</div>
        </div>
        <div class="azMoreArrow">${azIcon("chevR")}</div>
      </a>

      <a class="azMoreItem" href="#chat">
        <div>
          <div>HR Chat</div>
          <div class="sub">Message with HR directly</div>
        </div>
        <div class="azMoreArrow">${azIcon("chevR")}</div>
      </a>

      <a class="azMoreItem" href="#schedule">
        <div>
          <div>My Schedule</div>
          <div class="sub">View calendar and shifts</div>
        </div>
        <div class="azMoreArrow">${azIcon("chevR")}</div>
      </a>

      <a class="azMoreItem" href="#payroll">
        <div>
          <div>Payroll</div>
          <div class="sub">Pay stubs and tax forms</div>
        </div>
        <div class="azMoreArrow">${azIcon("chevR")}</div>
      </a>

      <a class="azMoreItem" href="#timeoff">
        <div>
          <div>Time Off & Benefits</div>
          <div class="sub">PTO, health insurance, perks</div>
        </div>
        <div class="azMoreArrow">${azIcon("chevR")}</div>
      </a>

      <a class="azMoreItem" href="#hours">
        <div>
          <div>My Hours</div>
          <div class="sub">Weekly summary</div>
        </div>
        <div class="azMoreArrow">${azIcon("chevR")}</div>
      </a>

      <a class="azMoreItem" href="#deposit">
        <div>
          <div>Direct Deposit</div>
          <div class="sub">Setup banking information</div>
        </div>
        <div class="azMoreArrow">${azIcon("chevR")}</div>
      </a>

      <a class="azMoreItem" href="#w4">
        <div>
          <div>Tax Forms (W-4)</div>
          <div class="sub">After first week</div>
        </div>
        <div class="azMoreArrow">${azIcon("chevR")}</div>
      </a>

      <a class="azMoreItem" href="#notifications">
        <div>
          <div>Notifications</div>
          <div class="sub">Company updates</div>
        </div>
        <div class="azMoreArrow">${azIcon("chevR")}</div>
      </a>

      <a class="azMoreItem" href="#help">
        <div>
          <div>Help & Support</div>
          <div class="sub">Contact HR team</div>
        </div>
        <div class="azMoreArrow">${azIcon("chevR")}</div>
      </a>
    </div>
  `;
  document.body.appendChild(sheet);
  
  const azMoreOpen = () => {
    const ov = document.getElementById("azMoreOverlay");
    const sh = document.getElementById("azMoreSheet");
    if (!ov || !sh) return;
    ov.style.display = "block";
    ov.style.pointerEvents = "auto";
    sh.classList.add("open");
  };

  const azMoreClose = () => {
    const ov = document.getElementById("azMoreOverlay");
    const sh = document.getElementById("azMoreSheet");
    if (!ov || !sh) return;
    sh.classList.remove("open");
    ov.style.display = "none";
    ov.style.pointerEvents = "none";
  };

  azMoreClose();

  document.addEventListener("click", (e) => {
    const btn = e.target.closest("#azMoreBtn");
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    azMoreOpen();
  }, true);

  document.addEventListener("click", (e) => {
    const closeBtn = e.target.closest("#azMoreClose");
    if (!closeBtn) return;
    e.preventDefault();
    e.stopPropagation();
    azMoreClose();
  }, true);

  document.addEventListener("click", (e) => {
    if (e.target && e.target.id === "azMoreOverlay") {
      e.preventDefault();
      e.stopPropagation();
      azMoreClose();
    }
  }, true);

  document.addEventListener("click", (e) => {
    const link = e.target.closest("#azMoreSheet a");
    if (!link) return;
    azMoreClose();
  }, true);

  applyChromeVisibility();
  window.addEventListener("resize", applyChromeVisibility);
}

function applyChromeVisibility() {
  const tabs = document.getElementById("azTabs");
  if (!tabs) return;

  const sidebar = document.getElementById("sidebar");
  if (sidebar) sidebar.style.display = isMobile() ? "none" : "";

  if (isMobile()) {
    tabs.style.display = "block";
    document.body.classList.add("has-tabs");
  } else {
    tabs.style.display = "none";
    document.body.classList.remove("has-tabs");

    const overlay = document.getElementById("azMoreOverlay");
    const sheet = document.getElementById("azMoreSheet");
    if (overlay) { overlay.style.display = "none"; overlay.style.pointerEvents = "none"; }
    if (sheet) sheet.classList.remove("open");
  }
}

function setActiveTabsAndSidebar() {
  const r = routeName();

  const tabKey =
    (r === "home" || r === "progress") ? "home" :
    (r.startsWith("schedule")) ? "schedule" :
    (r === "payroll") ? "payroll" :
    (r === "timeoff" || r === "benefits") ? "timeoff" :
    "more";
}

// ===============================
// UI blocks
// ===============================
function sectionHeader(title, right = "") {
  return `
    <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px;">
      <div style="font-weight:1000;font-size:14px;letter-spacing:.2px;">${escapeHtml(title)}</div>
      ${right ? `<div class="small muted" style="font-weight:900;">${escapeHtml(right)}</div>` : ""}
    </div>
  `;
}

function azCard(title, sub, linkText, href) {
  return `
    <div class="azCard">
      <div class="azCardTitle">${escapeHtml(title)}</div>
      <div class="azCardSub">${escapeHtml(sub)}</div>
      ${href ? `
        <a class="azCardLink" href="${escapeHtml(href)}">
          <span>${escapeHtml(linkText || "View more")}</span>
          ${azIcon("chevR")}
        </a>
      ` : `
        <div class="azCardSub" style="margin-top:10px;">${escapeHtml(linkText || "")}</div>
      `}
    </div>
  `;
}

// ===============================
// HOME - Professional Welcome
// ===============================
function renderHome(publicData, recordData, userData) {
  const news = Array.isArray(publicData?.home?.news) ? publicData.home.news : defaultPublicContent().home.news;

  const punches = Array.isArray(recordData?.punchesToday) ? recordData.punchesToday : [];
  const punchesCount = punches.length;

  const maxHours = clamp(recordData?.maxHours?.max || 60, 1, 120);
  const scheduledMin = clamp(recordData?.maxHours?.scheduledMinutes || 0, 0, 100000);
  const remainingMin = Math.max(0, (maxHours * 60) - scheduledMin);

  const pct = clamp((scheduledMin / (maxHours * 60)) * 100, 0, 100);

  // Get next pending step for home display
  const stepsRaw = userData?.steps || [];
  const shiftApproved = (recordData?.shift?.approved === true) || (userData?.shift?.approved === true);
  const steps = stepsRaw.map(s => {
    if (s.id === "shift_selection" && shiftApproved && !s.done) {
      return { ...s, done: true };
    }
    return s;
  });
  const nextStep = steps.find(s => !s.done);
  const completedCount = steps.filter(s => s.done).length;
  const totalCount = steps.length;
  setPage(
    "Home",
    "Welcome to your SunPower employee portal",
    `
      <div class="azTopRow">
        <div style="display:flex;align-items:center;gap:10px;">
          <div style="font-weight:1000;color:rgba(2,6,23,.75);">SunPower</div>
        </div>
        <div class="azTopIcons">
          <a class="azIconBtn" href="#help" aria-label="Help">${azIcon("info")}</a>
          <a class="azIconBtn" href="#notifications" aria-label="Notifications">${azIcon("bell")}</a>
        </div>
      </div>

      ${nextStep ? `
        <div class="azCard" style="background:linear-gradient(135deg,rgba(29,78,216,.06),rgba(22,163,74,.06));border-color:rgba(29,78,216,.20);">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
            <div style="width:40px;height:40px;border-radius:999px;background:rgba(29,78,216,.10);display:flex;align-items:center;justify-content:center;color:rgba(29,78,216,1);">
              ${azIcon("briefcase")}
            </div>
            <div>
              <div class="azCardTitle">Complete Your Onboarding</div>
              <div class="azCardSub">${completedCount} of ${totalCount} steps done</div>
            </div>
          </div>
          <div style="height:8px;background:rgba(2,6,23,.08);border-radius:999px;overflow:hidden;margin-bottom:12px;">
            <div style="height:100%;width:${(completedCount/totalCount)*100}%;background:linear-gradient(90deg,rgba(29,78,216,.6),rgba(22,163,74,.6));border-radius:999px;transition:width .3s ease;"></div>
          </div>
          <a class="azCardLink" href="#${nextStep.id === 'shift_selection' ? 'shift' : nextStep.id}">
            <span>Continue: ${escapeHtml(nextStep.label)}</span>
            ${azIcon("chevR")}
          </a>
        </div>
        <div style="height:10px"></div>
      ` : `
        <div class="azCard" style="background:linear-gradient(135deg,rgba(22,163,74,.08),rgba(22,163,74,.02));border-color:rgba(22,163,74,.25);">
          <div style="display:flex;align-items:center;gap:12px;">
            <div style="width:40px;height:40px;border-radius:999px;background:rgba(22,163,74,.10);display:flex;align-items:center;justify-content:center;color:rgba(22,163,74,1);">
              ${azIcon("checkCircle")}
            </div>
            <div>
              <div class="azCardTitle">Onboarding Complete</div>
              <div class="azCardSub">You're all set for your first day!</div>
            </div>
          </div>
        </div>
        <div style="height:10px"></div>
      `}

      <div class="azHero">
        <div class="azHeroInner">
          <div class="azHeroTitle">${escapeHtml(news?.[0]?.title || "Welcome to SunPower")}</div>
          <div class="azHeroSub">${escapeHtml(news?.[0]?.subtitle || "Your renewable energy career starts here")}</div>
          <div class="azHeroPills">
            <a class="azPill" href="#notifications">
              <span>View updates</span>
              ${azIcon("chevR")}
            </a>
            <span class="azPill">Safety First</span>
            <span class="azPill">Green Energy</span>
          </div>
        </div>
      </div>

      <div style="height:10px"></div>

      <div class="azRow2">
        <!-- Time Off DESHABILITADO -->
        <div class="azCard" style="background-color: #f5f5f5; color: #757575; border-color: #e0e0e0; opacity: 0.7; cursor: not-allowed; pointer-events: none;">
          <div class="azCardTitle" style="color: #616161;">
            <span style="opacity: 0.6; margin-right: 6px;"> </span>Time Off
          </div>
          <div class="azCardSub" style="color: #9e9e9e;">
            Request vacation and personal days
          </div>
          <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 10px; padding-top: 10px; border-top: 1px solid #e0e0e0; color: #9e9e9e; font-size: 14px;">
            <span>Available after first day</span>
            <span style="opacity: 0.5;">🔒</span>
          </div>
        </div>
        
        ${azCard(
          "My Schedule",
          "View your upcoming shifts and availability",
          "View schedule",
          "#schedule"
        )}
      </div>

      <!-- Payroll & Compensation DESHABILITADO -->
      <div class="azWide">
        <div class="azCard" style="background-color: #f5f5f5; color: #757575; border-color: #e0e0e0; opacity: 0.7; cursor: not-allowed; pointer-events: none;">
          <div class="azCardTitle" style="color: #616161;">
            <span style="opacity: 0.6; margin-right: 6px;"> </span>Payroll & Compensation
          </div>
          <div class="azCardSub" style="color: #9e9e9e;">
            Access pay stubs, tax forms, and direct deposit information
          </div>
          <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 10px; padding-top: 10px; border-top: 1px solid #e0e0e0; color: #9e9e9e; font-size: 14px;">
            <span>Available after first day</span>
            <span style="opacity: 0.5;">🔒</span>
          </div>
        </div>
      </div>

      <!-- Benefits & Perks DESHABILITADO -->
      <div class="azWide">
        <div class="azCard" style="background-color: #f5f5f5; color: #757575; border-color: #e0e0e0; opacity: 0.7; cursor: not-allowed; pointer-events: none;">
          <div class="azCardTitle" style="color: #616161;">
            <span style="opacity: 0.6; margin-right: 6px;"> </span>Benefits & Perks
          </div>
          <div class="azCardSub" style="color: #9e9e9e;">
            Health insurance, 401(k), and employee wellness programs
          </div>
          <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 10px; padding-top: 10px; border-top: 1px solid #e0e0e0; color: #9e9e9e; font-size: 14px;">
            <span>Available after first day</span>
            <span style="opacity: 0.5;">🔒</span>
          </div>
        </div>
      </div>

      <div class="azWide">
        <div class="azCard">
          <div class="azCardTitle">Work Schedule Overview</div>
          <div class="azCardSub">
            ${escapeHtml(Math.floor(scheduledMin / 60))}h ${escapeHtml(String(scheduledMin % 60).padStart(2,"0"))}m scheduled this week
          </div>
          <div class="azBar"><div style="width:${pct.toFixed(0)}%"></div></div>
        </div>
      </div>

      <div style="height:8px"></div>
    `
  );
}
// ===============================
// PROFILE - Personal Information (desde admin)
// ===============================
function renderProfile(userData, recordData) {
  // ========== DEBUG ==========
  console.log("🔄 RENDER PROFILE INICIADO");
  console.log("🔹 userData (auth):", userData);
  console.log("🔹 recordData (admin):", recordData);
  console.log("🔹 ¿Tiene profile?:", recordData?.profile);
  console.log("🔹 Employee ID:", userData?.employeeId);
  console.log("🔹 User ID:", userData?.uid);
  // ===========================
  
  // Obtener datos del admin (si existen)
  const adminProfile = recordData?.profile || {};
  
  // Nombre: Primero del admin, luego del user
  const firstName = adminProfile.firstName || "";
  const lastName = adminProfile.lastName || "";
  const fullName = firstName && lastName 
    ? `${firstName} ${lastName}`.trim()
    : userData?.fullName || "Employee";
    
  const empId = userData?.employeeId || "—";
  
  // Datos de contacto del admin
  const phone = adminProfile.phone || "Not provided";
  const address = adminProfile.address || "Not provided";
  const cityStateZip = adminProfile.city && adminProfile.stateZip 
    ? `${adminProfile.city}, ${adminProfile.stateZip}`
    : adminProfile.city || adminProfile.stateZip || "Not provided";
  const dob = adminProfile.dob || "Not provided";
  
  // Datos del usuario (login)
  const userEmail = userData?.email || "—";
  const position = userData?.shift?.position || "Pending assignment";
  const shift = userData?.shift?.shift || "Pending selection";
  
  setPage(
    "My Profile",
    "Personal information and contact details",
    `
      <div class="profile-card">
        <div class="profile-avatar">${azIcon("user")}</div>
        <div class="profile-name">${escapeHtml(fullName)}</div>
        <div class="profile-id">Employee ID: ${escapeHtml(empId)}</div>
        
        <div class="profile-info">
          <!-- Información personal -->
          <div class="profile-row">
            <span class="profile-label">Full Name</span>
            <span class="profile-value">${escapeHtml(fullName)}</span>
          </div>
          <div class="profile-row">
            <span class="profile-label">Email</span>
            <span class="profile-value">${escapeHtml(userEmail)}</span>
          </div>
          <div class="profile-row">
            <span class="profile-label">Phone</span>
            <span class="profile-value">${escapeHtml(phone)}</span>
          </div>
          <div class="profile-row">
            <span class="profile-label">Address</span>
            <span class="profile-value">${escapeHtml(address)}</span>
          </div>
          <div class="profile-row">
            <span class="profile-label">City / State / ZIP</span>
            <span class="profile-value">${escapeHtml(cityStateZip)}</span>
          </div>
          <div class="profile-row">
            <span class="profile-label">Date of Birth</span>
            <span class="profile-value">${escapeHtml(dob)}</span>
          </div>
          
          <!-- Información laboral -->
          <div class="profile-row">
            <span class="profile-label">Position</span>
            <span class="profile-value">${escapeHtml(position)}</span>
          </div>
          <div class="profile-row">
            <span class="profile-label">Shift</span>
            <span class="profile-value">${escapeHtml(shift)}</span>
          </div>
          <div class="profile-row">
            <span class="profile-label">Status</span>
            <span class="profile-value">${escapeHtml(userData?.status || "Active")}</span>
          </div>
        </div>
      </div>

      <div class="azCard" style="margin-top:16px;">
        ${sectionHeader("Important Notice")}
        <div class="muted" style="line-height:1.6;">
          To update your personal information, please contact HR directly. 
          For security reasons, profile changes must be verified before updating in our system.
        </div>
        <a class="btn ghost" href="#help" style="display:block;width:100%;text-align:center;margin-top:12px;border-radius:16px;">
          Contact HR to Update Information
        </a>
      </div>
    `
  );
}

// ============================================
// HR CHAT ASSISTANT - CLEAN VERSION
// Employee Onboarding Assistant
// ============================================

// Global function to add messages to UI
function addMessageToUI(text, sender, time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })) {
  const messagesDiv = document.getElementById("chatMessages");
  if (!messagesDiv) return;
  
  const messageDiv = document.createElement("div");
  messageDiv.className = `chat-message ${sender}`;
  messageDiv.innerHTML = `
    <div>${text}</div>
    <div class="chat-time">${time}</div>
  `;
  
  messagesDiv.appendChild(messageDiv);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function renderChat(userData, empId) {
  // COHERENT AUTO-RESPONSES - EVERY QUESTION MATCHES CORRECTLY
  const autoResponses = [
    // ============ GREETINGS ============
    { pattern: /hello|hi|hey|good morning|good afternoon/i, response: 'Hello! Welcome to SunPower HR Assistant. How can I help you today?' },
    { pattern: /how are you/i, response: 'I\'m here to help! What do you need to know about your onboarding?' },
    { pattern: /thank you|thanks/i, response: 'You\'re welcome! Let me know if you have other questions.' },
    
    // ============ FIRST DAY ============
    { pattern: /first day|orientation|onboarding/i, response: 'FIRST DAY INFO:<br>• Arrive at 8:15 AM<br>• Bring ID and Social Security card<br>• Safety shoes required<br>• Lunch provided<br>• Orientation in Conference Room B' },
    { pattern: /what to bring|documents/i, response: 'BRING THESE DOCUMENTS:<br>1. Government ID (passport or driver\'s license)<br>2. Social Security card<br>3. Bank info for direct deposit<br>4. Signed offer letter if you have it' },
    { pattern: /where to go|location/i, response: 'Go to the Main Entrance, Building A. Check in at Security. They\'ll direct you to orientation.' },
    { pattern: /what time|start time/i, response: 'Orientation starts at 8:30 AM. Arrive by 8:15 AM to check in.' },
    { pattern: /parking/i, response: 'Park in Employee Lot B. Get parking pass at Security Desk.' },
    { pattern: /lunch|food/i, response: 'Lunch is provided in the cafeteria on your first day.' },
    { pattern: /dress code|what to wear/i, response: 'Wear business casual. No jeans. Safety shoes required.' },
    
    // ============ APP ============
    { pattern: /app|application|download app/i, response: 'Download "SunPower Connect" from your app store. Login details will be emailed to you before your start date.' },
    { pattern: /login|password|forgot password/i, response: 'If you can\'t login:<br>1. Use "Forgot Password"<br>2. Contact IT: 502-555-7890<br>3. Your initial password is in your welcome email' },
    { pattern: /clock in|clock out|time clock/i, response: 'Use the app to clock in/out. GPS must be enabled. Clock in within 100 yards of the building.' },
    
    // ============ BENEFITS ============
    { pattern: /benefits|insurance|medical|dental|vision/i, response: 'BENEFITS START DAY 1:<br>• Medical insurance (3 plans)<br>• Dental insurance<br>• Vision insurance<br>• 401(k) with company match<br>• PTO accrual' },
    { pattern: /cost|premium|how much for benefits/i, response: 'BENEFIT COSTS PER PAYCHECK:<br>• Medical: $50-150<br>• Dental: $8-20<br>• Vision: $3-10<br>• Company pays 80% of premiums' },
    { pattern: /pto|vacation|time off/i, response: 'You earn 4 hours of PTO per pay period. Can use after 90 days.' },
    { pattern: /401k|retirement/i, response: '401(k) starts Day 1. Company matches 50% of your contribution up to 6% of your pay.' },
    
    // ============ SCHEDULES ============
    { pattern: /schedule|hours|shift|work hours/i, response: 'SHIFT SCHEDULES:<br>• Early: 6:00 AM - 2:30 PM<br>• Mid: 2:00 PM - 10:30 PM<br>• Night: 10:00 PM - 6:30 AM (+$1.50/hr extra)<br><br>Your shift is in your offer letter.' },
    { pattern: /overtime|ot pay|overtime pay/i, response: 'OVERTIME PAY:<br>• 1.5x regular pay after 40 hours/week<br>• Sunday work: 2x pay<br>• Holiday work: 2.5x pay' },
    { pattern: /weekend|saturday|sunday/i, response: 'Weekend work sometimes required. Saturday: 1.5x pay. Sunday: 2x pay.' },
    { pattern: /breaks|lunch break|break time/i, response: 'BREAKS:<br>• 15-minute morning break (paid)<br>• 30-minute lunch (unpaid)<br>• 15-minute afternoon break (paid)' },
    
    // ============ FOOTWEAR ============
    { pattern: /footwear|shoes|safety shoes|boots/i, response: 'SAFETY SHOES REQUIRED:<br>• Steel/composite toe<br>• Slip-resistant<br>• Required Day 1<br>• $150 reimbursement<br>• Buy from approved vendors' },
    { pattern: /reimbursement|shoe reimbursement/i, response: '$150 safety shoe reimbursement. Submit receipt in app within 30 days. Paid on next paycheck.' },
    
    // ============ PAYROLL ============
    { pattern: /pay|payment|paycheck|when paid/i, response: 'PAYDAY:<br>• Every Friday<br>• First check: second Friday<br>• Direct deposit required<br>• Access pay stubs in app' },
    { pattern: /direct deposit|bank account/i, response: 'Set up direct deposit Day 1. Bring account and routing numbers.' },
    { pattern: /how much will i make|salary|pay rate/i, response: 'Your pay rate is in your offer letter. For exact amounts, contact HR at 502 306 5521.' },
    
    // ============ CONTACT HR ============
    { pattern: /contact hr|talk to human|speak with someone/i, response: 'CONTACT HR:<br>Phone: <strong>502 306 5521</strong><br>Email: hr@sunpower.com<br>Hours: Mon-Fri 7AM-6PM' },
    
    // ============ SPECIFIC REDIRECTS ============
    { pattern: /specific salary|exact pay amount/i, response: 'For exact pay questions, contact HR: 502 306 5521' },
    { pattern: /complaint|harassment|issue with/i, response: 'For complaints or serious issues, call HR immediately: 502 306 5521' },
  ];
  
  // QUICK QUESTIONS
  const quickQuestions = [
    { text: "First Day", q: "What do I need for my first day?" },
    { text: "App", q: "How do I download the employee app?" },
    { text: "Benefits", q: "What benefits do I get?" },
    { text: "Schedule", q: "What are the work schedules?" },
    { text: "Overtime Pay", q: "How much is overtime pay?" },
    { text: "Safety Shoes", q: "What are the safety shoe requirements?" },
    { text: "Payday", q: "When do I get paid?" },
    { text: "Contact HR", q: "I need to speak with HR" },
  ];

  setPage(
    "HR Assistant",
    "Your 24/7 Onboarding Guide",
    `
      <div class="chat-container">
        <div class="chat-messages" id="chatMessages">
          <div class="chat-message admin">
            <div><strong>Hello! Welcome to SunPower HR Assistant.</strong></div>
            <div class="chat-time">I can answer questions about: First Day, App, Benefits, Schedules, Safety, Payroll, and more. Ask me anything!</div>
          </div>
        </div>
        <div class="chat-input-area">
          <input type="text" class="chat-input" id="chatInput" placeholder="Type your question here..." maxlength="500" autocomplete="off">
          <button class="chat-send" id="chatSendBtn">${azIcon("send")}</button>
        </div>
      </div>
      
      <div class="azCard" style="margin-top:16px;">
        ${sectionHeader("Quick Questions")}
        <div class="quick-questions" id="quickQuestions">
          ${quickQuestions.map(q => `
            <button class="btn sm ghost quick-question" data-q="${escapeHtml(q.q)}">
              ${escapeHtml(q.text)}
            </button>
          `).join('')}
        </div>
        
        <div style="margin-top:16px;padding:12px;background:#f0f9ff;border-radius:8px;border-left:4px solid #0369a1;">
          <div style="font-weight:600;color:#075985;">Need HR Directly?</div>
          <div style="font-size:14px;color:#334155;margin-top:4px;">
            For personal pay, documents, or urgent issues:
            <div style="margin-top:6px;font-weight:500;color:#0f766e;">Phone: 502 306 5521</div>
          </div>
        </div>
      </div>
    `
  );

  // Setup
  const sendBtn = document.getElementById("chatSendBtn");
  const input = document.getElementById("chatInput");
  
  // Simple response function - NO MIXUPS
  const getAutoResponse = (question) => {
    const qLower = question.toLowerCase().trim();
    
    // Check each pattern - FIRST MATCH WINS
    for (const rule of autoResponses) {
      if (rule.pattern.test(qLower)) {
        return rule.response;
      }
    }
    
    // Default for unknown
    return `I can help with questions about first day, app, benefits, schedules, safety, or payroll. Try asking about those topics, or contact HR at 502 306 5521 for specific help.`;
  };
  
  // Typing indicator
  const showTypingIndicator = () => {
    const messagesDiv = document.getElementById("chatMessages");
    if (!messagesDiv) return null;
    
    const indicator = document.createElement("div");
    indicator.className = "chat-message admin typing";
    indicator.innerHTML = `
      <div style="display:flex;gap:4px;align-items:center;">
        <div class="typing-dot"></div>
        <div class="typing-dot" style="animation-delay:0.2s"></div>
        <div class="typing-dot" style="animation-delay:0.4s"></div>
      </div>
    `;
    
    messagesDiv.appendChild(indicator);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
    return indicator;
  };
  
  // Send message
  const sendMessage = async () => {
    const text = input.value.trim();
    if (!text) return;
    
    // Add user message
    addMessageToUI(text, "employee");
    input.value = "";
    
    // Show typing
    const typingIndicator = showTypingIndicator();
    
    // Wait 1 second
    setTimeout(() => {
      // Remove typing
      if (typingIndicator) typingIndicator.remove();
      
      // Get CORRECT response
      const response = getAutoResponse(text);
      
      // Show response
      addMessageToUI(response, "admin");
      
      // If asking for HR contact, show button
      if (text.toLowerCase().includes('hr') || text.toLowerCase().includes('human') || text.toLowerCase().includes('contact')) {
        setTimeout(() => {
          const hrDiv = document.createElement("div");
          hrDiv.className = "chat-message admin";
          hrDiv.innerHTML = `
            <button class="btn primary" style="width:100%;" onclick="addMessageToUI('Call HR at: <strong>502 306 5521</strong>', 'admin')">
              Call HR Now: 502 306 5521
            </button>
          `;
          document.getElementById("chatMessages").appendChild(hrDiv);
        }, 300);
      }
    }, 1000);
  };

  // Events
  sendBtn.onclick = sendMessage;
  input.addEventListener("keypress", (e) => {
    if (e.key === "Enter") sendMessage();
  });
  
  // Quick questions
  setTimeout(() => {
    document.querySelectorAll('.quick-question').forEach(btn => {
      btn.addEventListener('click', () => {
        const question = btn.dataset.q;
        input.value = question;
        sendMessage();
      });
    });
  }, 100);
  
  // Typing animation
  const style = document.createElement('style');
  style.textContent = `
    .typing-dot {
      width: 8px;
      height: 8px;
      background-color: #64748b;
      border-radius: 50%;
      animation: typingBounce 1.4s infinite ease-in-out;
    }
    @keyframes typingBounce {
      0%, 60%, 100% { transform: translateY(0); }
      30% { transform: translateY(-5px); }
    }
  `;
  document.head.appendChild(style);
}
// ===============================
// SCHEDULE: Tabs + Calendar
// ===============================
function scheduleSubtabFromRoute(r) {
  if (r === "schedule-timecard") return "timecard";
  if (r === "schedule-findshifts") return "findshifts";
  return "myschedule";
}

function scheduleTopTabsHtml(active) {
  const tab = (key, label, href) => `
    <a href="${href}" class="${active === key ? "active" : ""}">
      ${escapeHtml(label)}
    </a>
  `;
  return `
    <div class="azTabsTop">
      ${tab("myschedule","My Schedule","#schedule")}
      ${tab("timecard","Timecard","#schedule-timecard")}
      ${tab("findshifts","Find Shifts","#schedule-findshifts")}
    </div>
  `;
}

function buildEventsIndex(recordData) {
  const events = Array.isArray(recordData?.scheduleEvents) ? recordData.scheduleEvents : [];
  const idx = new Map();
  for (const ev of events) {
    const key = ymd(ev?.date);
    if (!key) continue;
    if (!idx.has(key)) idx.set(key, []);
    idx.get(key).push(ev);
  }
  return idx;
}

function renderCalendarMonth(recordData, state) {
  const y = state.y;
  const m = state.m;
  const selected = state.selectedYmd;

  const first = new Date(y, m, 1);
  const startDow = first.getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();

  const prevDays = startDow;
  const totalCells = 42;
  const prevMonthDays = new Date(y, m, 0).getDate();

  const today = ymd(new Date());

  const eventsIdx = buildEventsIndex(recordData);

  const cells = [];
  for (let i = 0; i < totalCells; i++) {
    const dayNum = i - prevDays + 1;
    let cellDate;
    let label;
    let muted = false;

    if (dayNum <= 0) {
      const d = prevMonthDays + dayNum;
      cellDate = new Date(y, m - 1, d);
      label = d;
      muted = true;
    } else if (dayNum > daysInMonth) {
      const d = dayNum - daysInMonth;
      cellDate = new Date(y, m + 1, d);
      label = d;
      muted = true;
    } else {
      cellDate = new Date(y, m, dayNum);
      label = dayNum;
    }

    const key = ymd(cellDate);
    const hasEvent = eventsIdx.has(key);

    const isSel = (key && key === selected);
    const isToday = (key && key === today);

    cells.push(`
      <div class="azDay ${muted ? "muted" : ""} ${isSel ? "sel" : ""} ${isToday ? "today" : ""}"
           data-ymd="${escapeHtml(key)}">
        ${escapeHtml(String(label))}
        ${hasEvent ? `<span class="dot"></span>` : ``}
      </div>
    `);
  }

  const dow = ["SUN","MON","TUE","WED","THU","FRI","SAT"].map(x => `<div class="azCalDow">${x}</div>`).join("");

  return `
    <div class="azCalWrap">
      <div class="azCalHead">
        <div class="azCalMonth">${escapeHtml(fmtMonthTitle(y,m))}</div>
        <div class="azCalNav">
          <button class="azCalBtn" id="calPrev" type="button" aria-label="Previous month">${azIcon("chevL")}</button>
          <button class="azCalBtn" id="calNext" type="button" aria-label="Next month">${azIcon("chevR")}</button>
        </div>
      </div>

      <div class="azCalGrid">
        ${dow}
        ${cells.join("")}
      </div>

      <div class="azLegend">
        <div style="display:flex;align-items:center;gap:6px;">
          <span style="width:8px;height:8px;border-radius:999px;background:rgba(29,78,216,.60);"></span>
          <span>Scheduled</span>
        </div>
        <div style="display:flex;align-items:center;gap:6px;">
          <span style="width:8px;height:8px;border-radius:999px;background:rgba(2,6,23,.25);"></span>
          <span>Has activity</span>
        </div>
      </div>
    </div>
  `;
}

function renderMySchedule(recordData) {
  const today = new Date();
  const state = {
    y: today.getFullYear(),
    m: today.getMonth(),
    selectedYmd: ymd(today)
  };

  setPage(
    "Schedule",
    "View your work schedule and upcoming shifts",
    `
      ${scheduleTopTabsHtml("myschedule")}

      ${renderCalendarMonth(recordData, state)}

      <div style="height:12px"></div>

      <div class="azCard" id="dayDetailsCard">
        <div class="azCardTitle">Day Details</div>
        <div class="azCardSub" id="dayDetailsSub">Select a day to view your schedule.</div>
        <div id="dayDetailsBody" style="margin-top:10px;"></div>
      </div>

      <div class="azCard" style="margin-top:12px;">
        <div class="azCardTitle">Schedule Information</div>
        <div class="azCardSub" style="line-height:1.6;">
          Your official schedule will be available after your first day. 
          During onboarding, your shift preference has been recorded and will be 
          confirmed by your supervisor. Check back after completing your first week 
          to see your regular schedule.
        </div>
      </div>
    `
  );

  const eventsIdx = buildEventsIndex(recordData);

  function renderDayDetails(key) {
    const cardSub = document.getElementById("dayDetailsSub");
    const body = document.getElementById("dayDetailsBody");
    if (!cardSub || !body) return;

    const list = eventsIdx.get(key) || [];
    uiSetText(cardSub, key ? fmtDate(key) : "Select a day to view your schedule.");

    if (!key) {
      body.innerHTML = `<div class="muted">No day selected.</div>`;
      return;
    }

    if (!list.length) {
      body.innerHTML = `
        <div class="muted" style="line-height:1.45;">
          No scheduled shifts for this date. Your schedule will be available 
          after your first day of employment.
        </div>
      `;
      return;
    }

    body.innerHTML = list.map(ev => {
      const start = safe(ev.start, "—");
      const end = safe(ev.end, "—");
      const loc = safe(ev.location, "");
      const site = safe(ev.site, "");
      const role = safe(ev.role, "");
      const status = safe(ev.status, "Scheduled");
      return `
        <div class="azCard" style="box-shadow:none;border-radius:14px;margin-top:10px;">
          <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;">
            <div>
              <div class="azCardTitle">${escapeHtml(`${start} - ${end}`)}</div>
              <div class="azCardSub">${escapeHtml([role, site].filter(Boolean).join(" • ") || "Scheduled shift")}</div>
              ${loc ? `<div class="azCardSub" style="margin-top:8px;">${escapeHtml(loc)}</div>` : ""}
            </div>
            <div class="azCardSub" style="font-weight:1000;color:rgba(2,6,23,.60);">${escapeHtml(status)}</div>
          </div>
        </div>
      `;
    }).join("");
  }

  function rerenderCalendar() {
    const newHtml = renderCalendarMonth(recordData, state);
    const old = document.querySelector(".azCalWrap");
    if (old) old.outerHTML = newHtml;
    wireCalendar();
    renderDayDetails(state.selectedYmd);
  }

  function wireCalendar() {
    const prev = document.getElementById("calPrev");
    const next = document.getElementById("calNext");
    if (prev) prev.onclick = () => {
      state.m -= 1;
      if (state.m < 0) { state.m = 11; state.y -= 1; }
      rerenderCalendar();
    };
    if (next) next.onclick = () => {
      state.m += 1;
      if (state.m > 11) { state.m = 0; state.y += 1; }
      rerenderCalendar();
    };

    document.querySelectorAll(".azDay").forEach(el => {
      el.addEventListener("click", () => {
        const key = el.getAttribute("data-ymd") || "";
        state.selectedYmd = key;

        document.querySelectorAll(".azDay").forEach(x => x.classList.remove("sel"));
        el.classList.add("sel");

        renderDayDetails(key);
      });
    });
  }

  wireCalendar();
  renderDayDetails(state.selectedYmd);
}

function renderTimecard(recordData) {
  setPage(
    "Schedule",
    "Time tracking and attendance",
    `
      ${scheduleTopTabsHtml("timecard")}

      <div class="azCard">
        <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center;">
          <div>
            <div class="azCardTitle">Timecard</div>
            <div class="azCardSub">${escapeHtml(fmtDate(nowISODate()))}</div>
          </div>
        </div>

        <div style="margin-top:16px;padding:20px;background:rgba(229,234,242,.40);border-radius:12px;text-align:center;">
          <div style="width:64px;height:64px;border-radius:999px;background:rgba(2,6,23,.05);display:flex;align-items:center;justify-content:center;margin:0 auto 16px;color:rgba(2,6,23,.40);">
            ${azIcon("clock")}
          </div>
          <div style="font-weight:1000;font-size:16px;color:rgba(2,6,23,.85);margin-bottom:8px;">Time Tracking Coming Soon</div>
          <div style="font-size:13px;color:rgba(2,6,23,.60);line-height:1.5;">
            Your timecard will be activated after your first day of work.<br>
            Clock in/out functionality will be available through this portal 
            and the SunPower mobile app.
          </div>
        </div>

        <div style="margin-top:16px;">
          <div class="azCardTitle" style="margin-bottom:12px;">Quick Actions</div>
          <div class="azQuickGrid">
            <div class="azQuick" style="cursor:default;opacity:.7;">
              <div class="azQuickTop">
                <div class="azQuickIcon">${azIcon("clock")}</div>
              </div>
              <div>Clock In</div>
              <div class="azQuickSub">Available after first day</div>
            </div>
            <div class="azQuick" style="cursor:default;opacity:.7;">
              <div class="azQuickTop">
                <div class="azQuickIcon">${azIcon("calendar")}</div>
              </div>
              <div>View History</div>
              <div class="azQuickSub">No records yet</div>
            </div>
            <div class="azQuick" href="#help">
              <div class="azQuickTop">
                <div class="azQuickIcon">${azIcon("alert")}</div>
              </div>
              <div>Report Issue</div>
              <div class="azQuickSub">Contact HR</div>
            </div>
          </div>
        </div>
      </div>

      <div class="azCard" style="margin-top:12px;">
        <div class="azCardTitle">Attendance Policies</div>
        <div class="azCardSub" style="line-height:1.6;">
          <strong>Punctuality is essential.</strong> Please arrive 10 minutes before 
          your scheduled shift. Your supervisor will explain the clock-in process 
          during your first day orientation. For questions about attendance, 
          contact HR at (800) 876-4321.
        </div>
      </div>
    `
  );
}

function renderFindShifts(recordData) {
  const list = Array.isArray(recordData?.availableShifts) ? recordData.availableShifts : [];

  setPage(
    "Schedule",
    "Find available shifts and overtime opportunities",
    `
      ${scheduleTopTabsHtml("findshifts")}

      <div class="azCard">
        <div class="azCardTitle">Available Shifts</div>
        <div class="azCardSub">Browse and request additional shifts</div>

        <div style="margin-top:16px;padding:20px;background:rgba(229,234,242,.40);border-radius:12px;text-align:center;">
          <div style="width:64px;height:64px;border-radius:999px;background:rgba(2,6,23,.05);display:flex;align-items:center;justify-content:center;margin:0 auto 16px;color:rgba(2,6,23,.40);">
            ${azIcon("calendar")}
          </div>
          <div style="font-weight:1000;font-size:16px;color:rgba(2,6,23,.85);margin-bottom:8px;">Shift Bidding Opens After First Week</div>
          <div style="font-size:13px;color:rgba(2,6,23,.60);line-height:1.5;">
            You'll be able to view and request additional shifts after completing 
            your first week. This feature allows you to pick up overtime or swap 
            shifts with approval from your supervisor.
          </div>
        </div>

        <div style="margin-top:16px;">
          <div class="azCardTitle" style="margin-bottom:12px;">Your Current Assignment</div>
          <div class="azCard" style="background:rgba(29,78,216,.04);border-color:rgba(29,78,216,.20);">
            <div class="azCardTitle">Pending Confirmation</div>
            <div class="azCardSub" style="margin-top:8px;">
              Your shift preference has been recorded and is pending supervisor approval. 
              You will receive a notification once your regular schedule is confirmed.
            </div>
          </div>
        </div>
      </div>
    `
  );
}

// ===============================
// PROGRESS - Onboarding Steps
// ===============================
function renderProgress(userData, recordData) {
  const steps = Array.isArray(userData?.steps) ? userData.steps : [];
  const appt = recordData?.appointment || userData?.appointment || {};
  
  const shiftApproved = userData?.shift?.approved === true;
const displaySteps = steps.map(s => {
  if (s.id === "shift_selection" && shiftApproved && !s.done) {
    return { ...s, done: true };
  }
  return s;
});
const completedSteps = displaySteps.filter(s => s.done);
  const pendingSteps = displaySteps.filter(s => !s.done);
  const nextStep = pendingSteps[0];
  const progressPercent = Math.round((completedSteps.length / displaySteps.length) * 100);
  
  const currentStepIndex = displaySteps.findIndex(s => !s.done);

  const stepsTimeline = displaySteps.map((s, index) => {
    const isCompleted = s.done;
    const isCurrent = index === currentStepIndex;
    const isLocked = index > currentStepIndex;
    
    const statusText = isCompleted ? "Completed" : isCurrent ? "In Progress" : "Locked";
    const iconSvg = isCompleted ? azIcon("check") : isCurrent ? azIcon("unlock") : azIcon("lock");
    
    const descriptions = {
      shift_selection: "Select your preferred shift and position for warehouse operations",
      footwear: "Purchase required safety footwear before your first day",
      i9: "Prepare original documents for I-9 verification on day 1",
      photo_badge: "Complete photo ID badge at facility (in-person)",
      firstday: "Final preparation for your first day at the facility"
    };
    
    const metaInfo = isCompleted ? "Done" : isCurrent ? "Action required" : `Complete ${displaySteps[index-1]?.label || 'previous step'} first`;

    return `
      <div class="progress-item ${isCompleted ? 'completed' : isCurrent ? 'current' : 'locked'}">
        <div class="progress-item-icon">${iconSvg}</div>
        <div class="progress-item-card">
          <div class="progress-item-header">
            <div class="progress-item-title">${escapeHtml(s.label)}</div>
            <div class="progress-item-status">${statusText}</div>
          </div>
          <div class="azCardSub" style="margin-top:6px;">${descriptions[s.id] || ''}</div>
          <div class="azCardSub" style="margin-top:8px;font-size:11px;">
            ${azIcon(isCompleted ? "checkCircle" : isCurrent ? "info" : "lock")} ${metaInfo}
          </div>
        </div>
      </div>
    `;
  }).join("");

  setPage(
    "Progress",
    "Your onboarding journey",
    `
      <div class="azCard" style="background:linear-gradient(135deg,rgba(29,78,216,.08),rgba(22,163,74,.04));border-color:rgba(29,78,216,.20);padding:24px;">
        <div style="text-align:center;margin-bottom:20px;">
          <div style="font-size:48px;margin-bottom:12px;">🎯</div>
          <div style="font-weight:1000;font-size:24px;color:rgba(2,6,23,.85);margin-bottom:8px;">${progressPercent}% Complete</div>
          <div style="font-size:14px;color:rgba(2,6,23,.60);">
            ${nextStep ? `Next: ${nextStep.label}. Complete all steps to finish onboarding.` : 'All steps completed! Ready for your first day.'}
          </div>
        </div>
        
        <div style="height:12px;background:rgba(255,255,255,.50);border-radius:999px;overflow:hidden;">
          <div style="height:100%;width:${progressPercent}%;background:linear-gradient(90deg,rgba(29,78,216,.8),rgba(22,163,74,.8));border-radius:999px;transition:width .3s ease;"></div>
        </div>

        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:20px;">
          <div style="text-align:center;">
            <div style="font-weight:1000;font-size:28px;color:rgba(29,78,216,1);">${completedSteps.length}</div>
            <div style="font-size:11px;color:rgba(2,6,23,.60);text-transform:uppercase;letter-spacing:0.5px;">Done</div>
          </div>
          <div style="text-align:center;">
            <div style="font-weight:1000;font-size:28px;color:rgba(245,158,11,1);">${pendingSteps.length}</div>
            <div style="font-size:11px;color:rgba(2,6,23,.60);text-transform:uppercase;letter-spacing:0.5px;">Pending</div>
          </div>
          <div style="text-align:center;">
            <div style="font-weight:1000;font-size:28px;color:rgba(2,6,23,.40);">${displaySteps.length}</div>
            <div style="font-size:11px;color:rgba(2,6,23,.60);text-transform:uppercase;letter-spacing:0.5px;">Total</div>
          </div>
        </div>
      </div>

      <div class="azCard" style="margin-top:16px;">
        ${sectionHeader("Onboarding Steps")}
        <div class="progress-timeline">
          ${stepsTimeline}
        </div>
      </div>

      ${nextStep ? `
        <a class="btn primary" href="#${nextStep.id === 'shift_selection' ? 'shift' : nextStep.id}" style="display:block;width:100%;text-align:center;border-radius:16px;padding:16px;margin-top:20px;">
          Continue to ${escapeHtml(nextStep.label)}
        </a>
      ` : ''}

      <div class="azCard" style="margin-top:16px;background:rgba(2,6,23,.03);">
        <div class="azCardTitle">Day Appointment</div>
        <div style="margin-top:12px;display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <div>
            <div style="font-size:11px;color:rgba(2,6,23,.50);text-transform:uppercase;letter-spacing:0.5px;">Location</div>
            <div style="font-weight:1000;font-size:13px;color:rgba(2,6,23,.85);margin-top:4px;">${safe(appt.address, "To be assigned")}</div>
          </div>
          <div>
            <div style="font-size:11px;color:rgba(2,6,23,.50);text-transform:uppercase;letter-spacing:0.5px;">Start Time</div>
            <div style="font-weight:1000;font-size:13px;color:rgba(2,6,23,.85);margin-top:4px;">${safe(appt.time, "TBD")}</div>
          </div>
          <div>
            <div style="font-size:11px;color:rgba(2,6,23,.50);text-transform:uppercase;letter-spacing:0.5px;">Start Date</div>
            <div style="font-weight:1000;font-size:13px;color:rgba(2,6,23,.85);margin-top:4px;">${safe(appt.date, "TBD")}</div>
          </div>
          <div>
            <div style="font-size:11px;color:rgba(2,6,23,.50);text-transform:uppercase;letter-spacing:0.5px;">Info</div>
            <div style="font-weight:1000;font-size:13px;color:rgba(2,6,23,.85);margin-top:4px;">HR Onboarding</div>
          </div>
        </div>
      </div>
    `
  );
}

// ===============================
// SEQUENTIAL ONBOARDING
// ===============================

function getStepStatus(stepId, userData) {
  const steps = userData?.steps || [];
  const stepIndex = steps.findIndex(s => s.id === stepId);
  const prevStep = steps[stepIndex - 1];
  
  const isPrevDone = !prevStep || prevStep.done;
  const isCurrentDone = steps.find(s => s.id === stepId)?.done;
  
  return {
    isDone: isCurrentDone,
    isAvailable: isPrevDone,
    isLocked: !isPrevDone
  };
}

// ===============================
// SHIFT SELECTION
// ===============================

function renderShiftSelection(userData, saveUserPatch) {
  // Asegurar que shift existe con valores por defecto
  const shift = userData?.shift || { 
    position: "", 
    shift: "", 
    status: "", 
    approved: false 
  };
  
const stepsRaw = userData?.steps || [];
const shiftApproved = userData?.shift?.approved === true;
const steps = stepsRaw.map(s => {
  if (s.id === "shift_selection" && shiftApproved && !s.done) {
    return { ...s, done: true };
  }
  return s;
});
  
  console.log("Shift data:", shift);
  console.log("Position:", shift.position);
  console.log("Shift:", shift.shift);
  console.log("Status:", shift.status);
  console.log("Approved:", shift.approved);

  // CASO 1: APROBADO - Mostrar pantalla de aprobado
  if (shift.approved === true) {
    setPage(
      "Shift Selection",
      "Approved - Ready for next step",
      `
        <div class="azCard" style="text-align:center;padding:40px 24px;background:linear-gradient(135deg,rgba(22,163,74,.08),rgba(22,163,74,.02));border-color:rgba(22,163,74,.25);">
          <div style="width:80px;height:80px;border-radius:999px;background:rgba(22,163,74,.10);display:flex;align-items:center;justify-content:center;margin:0 auto 20px;color:rgba(22,163,74,1);">
            ${azIcon("checkCircle")}
          </div>
          <div style="font-weight:1000;font-size:20px;color:rgba(2,6,23,.85);margin-bottom:8px;">Shift Approved!</div>
          <div style="font-size:14px;color:rgba(2,6,23,.60);line-height:1.5;margin-bottom:24px;">
            Your shift has been approved by HR.<br>
            You can now continue to the next step.
          </div>
          
          <div class="azCard" style="text-align:left;margin-bottom:24px;background:#fff;">
            <div class="azCardTitle">Your Assignment</div>
            <div style="margin-top:12px;display:grid;grid-template-columns:1fr 1fr;gap:12px;">
              <div>
                <div style="font-size:11px;color:rgba(2,6,23,.50);">Position</div>
                <div style="font-weight:1000;font-size:14px;color:rgba(2,6,23,.85);margin-top:4px;">${escapeHtml(formatPositionDisplay(shift.position))}</div>
              </div>
              <div>
                <div style="font-size:11px;color:rgba(2,6,23,.50);">Shift</div>
                <div style="font-weight:1000;font-size:14px;color:rgba(2,6,23,.85);margin-top:4px;">${escapeHtml(formatShiftDisplay(shift.shift))}</div>
              </div>
              <div>
                <div style="font-size:11px;color:rgba(2,6,23,.50);">Status</div>
                <div style="font-weight:1000;font-size:14px;color:rgba(22,163,74,1);margin-top:4px;">Approved</div>
              </div>
              <div>
                <div style="font-size:11px;color:rgba(2,6,23,.50);">Start Date</div>
                <div style="font-weight:1000;font-size:14px;color:rgba(2,6,23,.85);margin-top:4px;">${escapeHtml(shift.shiftStartDate || 'TBD')}</div>
              </div>
            </div>
          </div>
          
          <a class="btn primary" href="#footwear" style="display:block;width:100%;border-radius:16px;padding:16px;">
            Continue to Safety Footwear
          </a>
        </div>
      `
    );
    return;
  }
  
  // CASO 2: PENDIENTE - Mostrar pantalla de pendiente
  if (shift.status === "pending" && shift.position && shift.shift) {
    setPage(
      "Shift Selection",
      "Pending HR Approval",
      `
        <div class="azCard" style="text-align:center;padding:40px 24px;background:linear-gradient(135deg,rgba(245,158,11,.08),rgba(245,158,11,.02));border-color:rgba(245,158,11,.25);">
          <div style="width:80px;height:80px;border-radius:999px;background:rgba(245,158,11,.10);display:flex;align-items:center;justify-content:center;margin:0 auto 20px;color:rgba(245,158,11,1);">
            ${azIcon("clock")}
          </div>
          <div style="font-weight:1000;font-size:20px;color:rgba(2,6,23,.85);margin-bottom:8px;">Pending Approval</div>
          <div style="font-size:14px;color:rgba(2,6,23,.60);line-height:1.5;margin-bottom:24px;">
            Your shift selection is waiting for HR approval.<br>
            Check back later or contact HR for updates.
          </div>
          
          <div class="azCard" style="text-align:left;margin-bottom:24px;background:#fff;">
            <div class="azCardTitle">Submitted Selection</div>
            <div style="margin-top:12px;display:grid;grid-template-columns:1fr 1fr;gap:12px;">
              <div>
                <div style="font-size:11px;color:rgba(2,6,23,.50);">Position</div>
                <div style="font-weight:1000;font-size:14px;color:rgba(2,6,23,.85);margin-top:4px;">${escapeHtml(formatPositionDisplay(shift.position))}</div>
              </div>
              <div>
                <div style="font-size:11px;color:rgba(2,6,23,.50);">Shift</div>
                <div style="font-weight:1000;font-size:14px;color:rgba(2,6,23,.85);margin-top:4px;">${escapeHtml(formatShiftDisplay(shift.shift))}</div>
              </div>
            </div>
          </div>
          
          <div class="azCard" style="background:rgba(29,78,216,.04);border-color:rgba(29,78,216,.15);">
            <div style="display:flex;align-items:center;gap:10px;">
              <div style="color:rgba(29,78,216,1);">${azIcon("info")}</div>
              <div style="font-size:13px;color:rgba(2,6,23,.70);line-height:1.5;">
                HR will review and approve your selection within 1-2 business days.
              </div>
            </div>
          </div>
        </div>
      `
    );
    return;
  }

  // CASO 3: FORMULARIO DE SELECCIÓN - Estado inicial o draft
  const currentPos = shift.position || "";
  const currentShift = shift.shift || "";

  setPage(
    "Shift Selection",
    "Select your position and shift",
    `
      <div class="azCard">
        <div class="azCardTitle" style="margin-bottom:16px;color:rgba(29,78,216,1);">Step 1: Choose Your Position</div>
        <div id="positionContainer" style="display:flex;flex-direction:column;gap:12px;">
          ${renderPositionCard("assembler", "Solar Panel Assembler", "Assemble and test solar panels in production line", "$18 - $23/hr", currentPos)}
          ${renderPositionCard("material", "Material Handler", "Receive, store, and distribute materials throughout facility", "$18 - $22/hr", currentPos)}
          ${renderPositionCard("qc", "Quality Control Inspector", "Inspect panels for defects and ensure quality standards", "$19 - $24/hr", currentPos)}
          ${renderPositionCard("shipping", "Shipping & Receiving", "Prepare finished products for shipment and receive inventory", "$18 - $22/hr", currentPos)}
        </div>
      </div>

      <div class="azCard" style="margin-top:16px;${currentPos ? '' : 'opacity:.6;pointer-events:none;'}" id="shiftCard">
        <div class="azCardTitle" style="margin-bottom:16px;color:rgba(29,78,216,1);">Step 2: Choose Your Shift</div>
        <div id="shiftContainer" style="display:flex;flex-direction:column;gap:12px;">
          ${renderShiftCard("early", "Early Shift", "6:00 AM - 2:30 PM", "Morning schedule, great for early risers", currentShift)}
          ${renderShiftCard("mid", "Mid Shift", "2:00 PM - 10:30 PM", "Afternoon to evening, balanced schedule", currentShift)}
          ${renderShiftCard("late", "Late Shift", "10:00 PM - 6:30 AM", "Overnight differential pay +$1.50/hr", currentShift)}
          ${renderShiftCard("weekend", "Weekend Shift", "Fri-Sun 12hr shifts", "Work 36hrs, get paid for 40hrs", currentShift)}
        </div>
      </div>

      <div id="submitArea" style="margin-top:20px;${currentPos && currentShift ? '' : 'display:none;'}">
        <button class="btn primary" id="btnSubmitShift" type="button" style="width:100%;border-radius:16px;padding:16px;font-weight:1000;font-size:16px;">
          Submit for HR Approval
        </button>
        <div class="small muted" style="margin-top:12px;line-height:1.4;text-align:center;">
          Your selection will be reviewed by HR before final confirmation.
        </div>
      </div>
    `
  );

  // Wire up position selection
  document.querySelectorAll('.position-option').forEach(card => {
    card.addEventListener('click', async function() {
      const posValue = this.dataset.value;
      
      // Visual selection
      document.querySelectorAll('.position-option').forEach(c => {
        c.style.borderColor = 'rgba(229,234,242,.95)';
        c.style.background = '#fff';
        c.querySelector('input').checked = false;
      });
      this.style.borderColor = 'rgba(29,78,216,.50)';
      this.style.background = 'rgba(29,78,216,.04)';
      this.querySelector('input').checked = true;
      
      // Enable shift section
      const shiftCard = document.getElementById('shiftCard');
      shiftCard.style.opacity = '1';
      shiftCard.style.pointerEvents = 'auto';
      
      // Guardar posición inmediatamente
      const newShiftData = {
        position: posValue,
        shift: currentShift || shift.shift,
        status: "draft",
        approved: false,
        updatedAt: new Date().toISOString()
      };
      
      console.log("Saving position:", newShiftData);
      await saveUserPatch({ shift: newShiftData });
    });
  });

  // Wire up shift selection
  document.querySelectorAll('.shift-option').forEach(card => {
    card.addEventListener('click', async function() {
      const shiftValue = this.dataset.value;
      
      // Visual selection
      document.querySelectorAll('.shift-option').forEach(c => {
        c.style.borderColor = 'rgba(229,234,242,.95)';
        c.style.background = '#fff';
        c.querySelector('input').checked = false;
      });
      this.style.borderColor = 'rgba(29,78,216,.50)';
      this.style.background = 'rgba(29,78,216,.04)';
      this.querySelector('input').checked = true;
      
      // Show submit button
      const submitArea = document.getElementById('submitArea');
      submitArea.style.display = 'block';
      
      // Save shift immediately
      const newShiftData = {
        position: currentPos || shift.position,
        shift: shiftValue,
        status: "draft",
        approved: false,
        updatedAt: new Date().toISOString()
      };
      
      console.log("Saving shift:", newShiftData);
      await saveUserPatch({ shift: newShiftData });
    });
  });

  // Submit button
  const submitBtn = document.getElementById("btnSubmitShift");
  if (submitBtn) {
    submitBtn.onclick = async () => {
      const selectedPos = document.querySelector('input[name="position"]:checked')?.value;
      const selectedShift = document.querySelector('input[name="shift"]:checked')?.value;
      
      if (!selectedPos || !selectedShift) {
        uiToast("Please select both position and shift.");
        return;
      }

      // Submit as pending
      const finalShiftData = {
        position: selectedPos,
        shift: selectedShift,
        status: "pending",
        approved: false,
        submittedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };
      
      console.log("Submitting for approval:", finalShiftData);
      await saveUserPatch({ shift: finalShiftData });
      
      uiToast("Submitted for HR approval!");
      location.hash = "#shift";
    };
  }
}

// Helper: Render position card
function renderPositionCard(key, title, desc, pay, selectedKey) {
  const isSelected = selectedKey === key;
  return `
    <div class="azCard position-option" data-value="${key}" 
      style="cursor:pointer;margin:0;transition:all .2s;${isSelected ? 'border-color:rgba(29,78,216,.50);background:rgba(29,78,216,.04);' : ''}">
      <div style="display:flex;gap:12px;align-items:flex-start;">
        <input type="radio" name="position" value="${key}" ${isSelected ? 'checked' : ''} 
          style="width:20px;height:20px;margin-top:2px;accent-color:#2563eb;cursor:pointer;">
        <div style="flex:1;">
          <div style="font-weight:1000;font-size:15px;color:rgba(2,6,23,.85);">${escapeHtml(title)}</div>
          <div style="font-size:13px;color:rgba(2,6,23,.60);margin-top:4px;line-height:1.4;">${escapeHtml(desc)}</div>
          <div style="margin-top:8px;font-weight:1000;color:rgba(22,163,74,1);font-size:13px;background:rgba(22,163,74,.08);display:inline-block;padding:4px 10px;border-radius:20px;">${escapeHtml(pay)}</div>
        </div>
      </div>
    </div>
  `;
}

// Helper: Render shift card
function renderShiftCard(key, title, hours, desc, selectedKey) {
  const isSelected = selectedKey === key;
  return `
    <div class="azCard shift-option" data-value="${key}" 
      style="cursor:pointer;margin:0;transition:all .2s;${isSelected ? 'border-color:rgba(29,78,216,.50);background:rgba(29,78,216,.04);' : ''}">
      <div style="display:flex;gap:12px;align-items:flex-start;">
        <input type="radio" name="shift" value="${key}" ${isSelected ? 'checked' : ''} 
          style="width:20px;height:20px;margin-top:2px;accent-color:#2563eb;cursor:pointer;">
        <div style="flex:1;">
          <div style="font-weight:1000;font-size:15px;color:rgba(2,6,23,.85);">${escapeHtml(title)}</div>
          <div style="font-size:13px;color:rgba(29,78,216,1);font-weight:1000;margin-top:4px;">${escapeHtml(hours)}</div>
          <div style="font-size:12px;color:rgba(2,6,23,.50);margin-top:4px;">${escapeHtml(desc)}</div>
        </div>
      </div>
    </div>
  `;
}

// Helper: Format position for display
function formatPositionDisplay(key) {
  const positions = {
    assembler: "Solar Panel Assembler",
    material: "Material Handler",
    qc: "Quality Control Inspector",
    shipping: "Shipping & Receiving"
  };
  return positions[key] || key || "Not selected";
}

// Helper: Format shift for display
function formatShiftDisplay(key) {
  const shifts = {
    early: "Early Shift (6AM - 2:30PM)",
    mid: "Mid Shift (2PM - 10:30PM)",
    late: "Late Shift (10PM - 6:30AM)",
    weekend: "Weekend Shift (Fri-Sun)"
  };
  return shifts[key] || key || "Not selected";
}

// ===============================
// FOOTWEAR
// ===============================
function renderFootwear(userData, saveUserPatch, publicData) {
  const shiftApproved = !!userData?.shift?.approved;
  const steps = userData?.steps || [];
  const stepFootwear = steps.find(s => s.id === "footwear");
  const isDone = !!stepFootwear?.done;

  const isLocked = !shiftApproved;

  const fwPublic = publicData?.footwear || defaultPublicContent().footwear;
  
  // IMPORTANTE: Tomar los valores más recientes de userData.footwear
  const fw = userData?.footwear || {};
  
  // Verificar si ya completó la tienda
  const visitedStore = fw.visitedStore === true;
  
  // Verificar si acaba de volver de la tienda (sessionStorage temporal)
  const justReturnedFromStore = sessionStorage.getItem("fw_just_returned") === "1";
  
  // Mostrar botón "I'm Back" solo si acaba de volver y no ha confirmado visita
  const showBackButton = justReturnedFromStore && !visitedStore;

  // ---------- LOCKED ----------
  if (isLocked) {
    setPage(
      "Safety Footwear",
      "Locked",
      `
        <div class="azCard" style="text-align:center;padding:40px 24px;">
          <div style="width:64px;height:64px;border-radius:999px;background:rgba(2,6,23,.06);display:flex;align-items:center;justify-content:center;margin:0 auto 16px;color:rgba(2,6,23,.40);">
            ${azIcon("lock")}
          </div>
          <div style="font-weight:1000;font-size:16px;color:rgba(2,6,23,.85);margin-bottom:8px;">Step Locked</div>
          <div style="font-size:13px;color:rgba(2,6,23,.60);line-height:1.5;margin-bottom:20px;">
            Please complete Shift Selection and wait for HR approval before accessing this step.
          </div>
          <a class="btn primary" href="#shift" style="display:block;width:100%;border-radius:16px;padding:14px;">
            Go to Shift Selection
          </a>
        </div>
      `
    );
    return;
  }

  // ---------- COMPLETED ----------
  if (isDone) {
    setPage(
      "Safety Footwear",
      "Completed",
      `
        <div class="azCard" style="text-align:center;padding:40px 24px;background:linear-gradient(135deg,rgba(22,163,74,.08),rgba(22,163,74,.02));border-color:rgba(22,163,74,.25);">
          <div style="width:80px;height:80px;border-radius:999px;background:rgba(22,163,74,.10);display:flex;align-items:center;justify-content:center;margin:0 auto 20px;color:rgba(22,163,74,1);">
            ${azIcon("checkCircle")}
          </div>
          <div style="font-weight:1000;font-size:20px;color:rgba(2,6,23,.85);margin-bottom:8px;">Safety Footwear Completed</div>
          <div style="font-size:14px;color:rgba(2,6,23,.60);line-height:1.5;margin-bottom:18px;">
            You have completed the safety footwear requirement.<br>
            Remember: approved safety shoes are required on your first day.
          </div>

          <a class="btn ghost" href="${escapeHtml(fwPublic.shopUrl)}" rel="noopener"
             style="display:block;width:100%;text-align:center;margin:0 auto 12px;border-radius:16px;">
            Open Safety Footwear Store
          </a>

          <a class="btn primary" href="#i9" style="display:block;width:100%;border-radius:16px;padding:16px;">
            Continue to I-9 Verification
          </a>
        </div>
      `
    );
    return;
  }

  // ---------- HELPERS ----------
  function ackRow(id, checked, text) {
    const isChecked = checked ? "checked" : "";
    return `
      <label class="checkrow" for="${escapeHtml(id)}" style="
        display:flex;gap:12px;align-items:flex-start;
        padding:14px;border:1px solid rgba(229,234,242,.95);
        border-radius:16px;margin-top:10px;cursor:pointer;background:#fff;
      ">
        <input type="checkbox" id="${escapeHtml(id)}" ${isChecked}
          style="width:20px;height:20px;margin-top:2px;accent-color:#2563eb;"/>
        <span style="font-size:13px;line-height:1.5;color:rgba(2,6,23,.80);">${escapeHtml(text)}</span>
      </label>
    `;
  }

  // ---------- PAGE CONTENT ----------
  setPage(
    fwPublic.programTitle || "Safety Footwear Program",
    "Required for all warehouse and production positions",
    `
      <div class="azCard" style="border-left:4px solid rgba(220,38,38,.50);">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
          <div style="color:rgba(220,38,38,1);">${azIcon("alert")}</div>
          <div class="azCardTitle" style="color:rgba(220,38,38,1);">OSHA Compliance Requirement</div>
        </div>
        <div class="muted" style="line-height:1.6;">
          In accordance with <strong>OSHA Standard 29 CFR 1910.136</strong>, all personnel entering 
          operational zones must wear protective footwear. This is a <strong>mandatory condition of employment</strong> 
          for all warehouse, production, assembly, maintenance, and logistics positions. 
          Failure to present compliant safety footwear on your first scheduled workday will result 
          in <strong>immediate exclusion from the facility</strong> and potential rescheduling of your employment start date.
        </div>
      </div>

      <div class="azCard" style="margin-top:16px;">
        ${sectionHeader("Corporate Footwear Program")}
        <div class="muted" style="line-height:1.7;">
          SunPower Corporation provides a <strong>$100.00 reimbursement</strong> for ANSI-compliant 
          safety footwear purchased through our authorized network. This benefit is classified 
          as a <strong>conditional advance</strong> and will be processed through payroll on your 
          first paycheck, contingent upon:
        </div>
        
        <ul style="margin:12px 0;padding-left:20px;line-height:1.8;color:rgba(2,6,23,.70);">
          <li>Verification of purchase through authorized network</li>
          <li>Submission of valid receipt within 30 days of purchase</li>
          <li>Successful completion of your first week of employment</li>
          <li>Physical presentation of compliant footwear at orientation</li>
        </ul>

        <div style="margin-top:16px;padding:16px;background:rgba(29,78,216,.04);border-radius:12px;border:1px solid rgba(29,78,216,.15);">
          <div style="font-weight:1000;font-size:13px;color:rgba(29,78,216,1);margin-bottom:10px;">ANSI Z41 / ASTM F2413-18 Requirements:</div>
          <ul style="margin:0;padding-left:18px;font-size:13px;line-height:1.8;color:rgba(2,6,23,.70);">
            <li><strong>Impact Resistance:</strong> I/75 rating minimum (75 foot-pounds)</li>
            <li><strong>Compression Resistance:</strong> C/75 rating minimum (2,500 pounds)</li>
            <li><strong>Metatarsal Protection:</strong> Mt/75 rating (where applicable)</li>
            <li><strong>Electrical Hazard:</strong> EH rating (20,000 volts maximum, 60 Hz, dry conditions)</li>
            <li><strong>Static Dissipative:</strong> SD rating (10⁶ to 10⁸ ohms resistance)</li>
            <li><strong>Puncture Resistance:</strong> PR rating where required by job function</li>
            <li><strong>Slip Resistance:</strong> Mark II oily/wet testing standards</li>
          </ul>
        </div>

        <div style="margin-top:16px;padding:14px;background:rgba(234,179,8,.06);border-radius:12px;border:1px solid rgba(234,179,8,.25);">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
            <span style="color:rgba(234,179,8,1);">${azIcon("alert")}</span>
            <span style="font-weight:1000;font-size:12px;color:rgba(234,179,8,1);">EXCLUSIONS & LIMITATIONS</span>
          </div>
          <div style="font-size:12px;line-height:1.6;color:rgba(2,6,23,.65);">
            Athletic shoes, hiking boots, and non-ANSI compliant footwear are <strong>strictly prohibited</strong> 
            regardless of steel toe presence. Open-toe, open-heel, or canvas construction footwear is 
            <strong>never permitted</strong> in operational areas. Reimbursement is limited to two (2) pair per 
            employee per calendar year, maximum $100.00 including taxes and shipping.
          </div>
        </div>
      </div>

      <div class="azCard" style="margin-top:16px;background:rgba(2,6,23,.03);">
        <div class="azCardTitle"> Authorized Portal</div>
        <div class="muted" style="line-height:1.6;margin-top:8px;">
          Access our corporate portal to browse pre-approved footwear models that meet all 
          SunPower safety specifications. Use your Employee ID at checkout for automatic program enrollment.
          <strong>Important:</strong> Purchases made outside this portal are ineligible for reimbursement.
        </div>

        ${!visitedStore ? `
          <button class="btn primary" id="btnGoStore"
            style="display:block;width:100%;text-align:center;margin-top:14px;border-radius:16px;padding:14px;">
            Open Authorized Portal
          </button>
          
          ${showBackButton ? `
            <button class="btn ghost" id="btnImBack"
              style="display:block;width:100%;text-align:center;margin-top:12px;border-radius:16px;padding:14px;border:2px solid #2563eb;color:#2563eb;">
              ✓ I've Completed My Purchase - Continue to Acknowledgements
            </button>
          ` : `
            <div class="small muted" style="margin-top:14px;line-height:1.5;text-align:center;padding:12px;background:rgba(2,6,23,.04);border-radius:10px;">
              After completing your purchase through the authorized network, return to this page 
              and click the confirmation button above to proceed with your employment documentation.
            </div>
          `}
        ` : `
          <div style="margin-top:14px;padding:14px;background:rgba(22,163,74,.10);border-radius:12px;border:1px solid rgba(22,163,74,.25);">
            <div style="display:flex;align-items:center;gap:10px;color:rgba(22,163,74,1);font-weight:1000;">
              ${azIcon("check")} Network portal access confirmed
            </div>
            <div style="font-size:12px;color:rgba(2,6,23,.60);margin-top:6px;">
              Completed on ${new Date(fw.visitedAt || Date.now()).toLocaleDateString()}
            </div>
          </div>
        `}
      </div>

      ${!visitedStore && !showBackButton ? `
        <div class="azCard" style="margin-top:16px;border:1px dashed rgba(29,78,216,.35);background:rgba(29,78,216,.03);">
          <div class="azCardTitle">⏳ Awaiting Portal Access</div>
          <div class="muted" style="line-height:1.6;margin-top:8px;">
            This step requires verification of safety footwear procurement through our authorized network. 
            Please click "Open Authorized Network Portal" above to browse options and complete your purchase.
          </div>
        </div>
      ` : ''}

      ${visitedStore ? `
        <div class="azCard" style="margin-top:16px;">
          ${sectionHeader("Legal Acknowledgements & Compliance Agreement")}
          <div class="muted" style="font-size:12px;line-height:1.6;margin-bottom:16px;color:rgba(2,6,23,.65);">
            By selecting each item below, you acknowledge understanding and agreement to these 
            legally binding terms regarding safety footwear compliance. These acknowledgements 
            become part of your permanent employment record.
          </div>
          
          ${ackRow("fwAck1", fw.ack1, "I acknowledge that OSHA-compliant safety footwear is a mandatory condition of employment and I will wear approved protective footwear at all times while in operational, warehouse, production, or maintenance areas.")}
          
          ${ackRow("fwAck2", fw.ack2, "I confirm that I will purchase and possess ANSI Z41/ASTM F2413-18 compliant safety footwear prior to my first scheduled workday and will present this footwear during orientation check-in.")}
          
          ${ackRow("fwAck3", fw.ack3, "I understand that reimbursement of up to $100.00 is available only for purchases made through SunPower's authorized network portal, and I agree to submit valid receipts within 30 days of purchase.")}
          
          ${ackRow("fwAck4", fw.ack4, "I acknowledge that failure to wear proper safety footwear will result in immediate removal from operational areas, potential disciplinary action up to and including termination, and forfeiture of any conditional reimbursement.")}
          
          ${ackRow("fwAck5", fw.ack5, "I understand that SunPower reserves the right to inspect footwear for compliance at any time, and I agree to replace non-compliant footwear immediately upon notification at my own expense.")}

          <button class="btn primary" id="btnFootwearNext" type="button"
            style="display:block;width:100%;text-align:center;border-radius:16px;padding:16px;margin-top:20px;opacity:.6;" disabled>
            Continue to I-9 Employment Eligibility Verification
          </button>

          <div class="small muted" style="margin-top:12px;line-height:1.4;text-align:center;">
            All five (5) acknowledgements are required to proceed. This action is recorded in your employment file.
          </div>
        </div>
      ` : ''}
    `
  );

  // -------- HANDLERS --------

  // 1) BOTÓN "IR A TIENDA"
  const btnGoStore = document.getElementById("btnGoStore");
  if (btnGoStore) {
    btnGoStore.onclick = () => {
      try { 
        sessionStorage.setItem("fw_store_opened", "1"); 
        sessionStorage.setItem("fw_just_returned", "1"); 
      } catch (e) {}
      window.location.href = fwPublic.shopUrl;
    };
  }

   // 2) BOTÓN "I'M BACK FROM THE STORE"
  const btnImBack = document.getElementById("btnImBack");
  if (btnImBack) {
    btnImBack.onclick = async () => {
      btnImBack.disabled = true;
      btnImBack.textContent = "Confirming...";
      
      try {
        const currentFw = userData?.footwear || {};
        
        // Guardar en Firebase
        await saveUserPatch({
          footwear: { 
            ...currentFw, 
            visitedStore: true, 
            visitedAt: Date.now() 
          }
        });
        
        // Limpiar sessionStorage
        try { 
          sessionStorage.removeItem("fw_store_opened"); 
          sessionStorage.removeItem("fw_just_returned"); 
        } catch (e) {}
        
        uiToast("Confirmed! Loading next step...");
        
        // FORZAR RE-RENDER DESPUÉS DE UN MOMENTO
        setTimeout(() => {
          location.reload();
        }, 1000);
        
      } catch (e) {
        console.error("Error:", e);
        uiToast("Error saving. Please try again.");
        btnImBack.disabled = false;
        btnImBack.textContent = "✓ I've Completed My Purchase";
      }
    };
  }

  // Si no ha visitado la tienda, no configurar los handlers de acknowledgements todavía
  if (!visitedStore) return;

  // ---------- ACKS + NEXT STEP (solo si visitedStore es true) ----------
  const btnNext = document.getElementById("btnFootwearNext");

  const readAcks = () => {
    const a1 = !!document.getElementById("fwAck1")?.checked;
    const a2 = !!document.getElementById("fwAck2")?.checked;
    const a3 = !!document.getElementById("fwAck3")?.checked;
    const a4 = !!document.getElementById("fwAck4")?.checked;
    const a5 = !!document.getElementById("fwAck5")?.checked;
    return { a1, a2, a3, a4, a5, all: !!(a1 && a2 && a3 && a4 && a5) };
  };

  const syncNext = () => {
    const st = readAcks();
    if (!btnNext) return;
    btnNext.disabled = !st.all;
    btnNext.style.opacity = st.all ? "1" : ".6";
  };

  // Autosave acks
  let t = null;
  const autosave = () => {
    const st = readAcks();
    clearTimeout(t);
    t = setTimeout(() => {
      // Guardar SOLO los acks, mantener visitedStore y visitedAt
      saveUserPatch({
        footwear: {
          ...fw,
          ack1: st.a1,
          ack2: st.a2,
          ack3: st.a3,
          ack4: st.a4,
          ack5: st.a5
        }
      }).catch((e) => console.error("Autosave error:", e));
    }, 300);
  };

  ["fwAck1","fwAck2","fwAck3","fwAck4","fwAck5"].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener("change", () => {
        syncNext();
        autosave();
      });
    }
  });

  // Inicializar estado del botón
  syncNext();

  if (btnNext) {
    btnNext.onclick = async () => {
      const st = readAcks();
      if (!st.all) {
        uiToast("Please confirm all five legal acknowledgements to proceed.");
        return;
      }

      // mark footwear step done
      const newSteps = (steps || []).map(s =>
        s.id === "footwear" ? ({ ...s, done: true, doneAt: Date.now() }) : s
      );
      if (!newSteps.find(s => s.id === "footwear")) {
        newSteps.push({ id: "footwear", done: true, doneAt: Date.now() });
      }

      await saveUserPatch({
        footwear: {
          ...fw,
          ack1: st.a1, ack2: st.a2, ack3: st.a3, ack4: st.a4, ack5: st.a5
        },
        steps: newSteps,
        stage: "i9"
      });

      uiToast("Safety footwear compliance completed. Proceeding to I-9 Verification...");
      location.hash = "#i9";
    };
  }
}


// ===============================
// I-9 VERIFICATION
// ===============================
function renderI9(userData, saveUserPatch) {
  const status = getStepStatus("i9", userData);
  
  if (status.isLocked) {
    setPage(
      "I-9 Verification",
      "Locked",
      `
        <div class="azCard" style="text-align:center;padding:40px 24px;">
          <div style="width:64px;height:64px;border-radius:999px;background:rgba(2,6,23,.06);display:flex;align-items:center;justify-content:center;margin:0 auto 16px;color:rgba(2,6,23,.40);">
            ${azIcon("lock")}
          </div>
          <div style="font-weight:1000;font-size:16px;color:rgba(2,6,23,.85);margin-bottom:8px;">Step Locked</div>
          <div style="font-size:13px;color:rgba(2,6,23,.60);line-height:1.5;margin-bottom:20px;">
            Please complete Safety Footwear before accessing this step.
          </div>
          <a class="btn primary" href="#footwear" style="display:block;width:100%;border-radius:16px;padding:14px;">
            Go to Safety Footwear
          </a>
        </div>
      `
    );
    return;
  }
  
  if (status.isDone) {
    setPage(
      "I-9 Verification",
      "Completed",
      `
        <div class="azCard" style="text-align:center;padding:40px 24px;background:linear-gradient(135deg,rgba(22,163,74,.08),rgba(22,163,74,.02));border-color:rgba(22,163,74,.25);">
          <div style="width:80px;height:80px;border-radius:999px;background:rgba(22,163,74,.10);display:flex;align-items:center;justify-content:center;margin:0 auto 20px;color:rgba(22,163,74,1);">
            ${azIcon("checkCircle")}
          </div>
          <div style="font-weight:1000;font-size:20px;color:rgba(2,6,23,.85);margin-bottom:8px;">I-9 Acknowledged</div>
          <div style="font-size:14px;color:rgba(2,6,23,.60);line-height:1.5;margin-bottom:24px;">
            You have confirmed you will bring original documents on your first day.<br>
            HR will verify these documents in person during orientation.
          </div>
          <a class="btn primary" href="#photo_badge" style="display:block;width:100%;border-radius:16px;padding:16px;">
            Continue to Photo Badge
          </a>
        </div>
      `
    );
    return;
  }

  setPage(
    "I-9 Verification",
    "Employment eligibility verification",
    `
      <div class="azCard" style="background:linear-gradient(135deg,rgba(29,78,216,.06),rgba(29,78,216,.02));border-color:rgba(29,78,216,.20);">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
          <div style="color:rgba(29,78,216,1);">${azIcon("file")}</div>
          <div class="azCardTitle" style="color:rgba(29,78,216,1);">Federal Employment Verification</div>
        </div>
        <div class="muted" style="line-height:1.7;">
          The Form I-9 is a federal requirement administered by the Department of Homeland Security 
          and U.S. Citizenship and Immigration Services (USCIS). All employees must complete 
          this verification within <strong>3 business days</strong> of their start date.
        </div>
      </div>

      <div class="azCard" style="margin-top:16px;">
        ${sectionHeader("Document Requirements")}
        <div class="muted" style="line-height:1.7;margin-bottom:16px;">
          You must present <strong>original, unexpired documents</strong> in person. 
          Photocopies, digital copies, or notarized copies are not acceptable.
        </div>

        <div style="display:grid;grid-template-columns:1fr;gap:12px;">
          <div style="padding:16px;background:rgba(22,163,74,.06);border-radius:12px;border:1px solid rgba(22,163,74,.20);">
            <div style="font-weight:1000;font-size:14px;color:rgba(22,163,74,1);margin-bottom:8px;">Option A: List A Document</div>
            <div style="font-size:13px;color:rgba(2,6,23,.70);line-height:1.6;">
              One document that establishes <strong>both identity and employment authorization</strong>
              <ul style="margin:8px 0 0 0;padding-left:18px;">
                <li>U.S. Passport or Passport Card</li>
                <li>Permanent Resident Card (Form I-551)</li>
                <li>Employment Authorization Document (Form I-766)</li>
                <li>Foreign passport with I-551 stamp or I-94</li>
              </ul>
            </div>
          </div>

          <div style="padding:16px;background:rgba(245,158,11,.06);border-radius:12px;border:1px solid rgba(245,158,11,.20);">
            <div style="font-weight:1000;font-size:14px;color:rgba(180,83,9,1);margin-bottom:8px;">Option B: List B + List C</div>
            <div style="font-size:13px;color:rgba(2,6,23,.70);line-height:1.6;">
              <strong>List B - Identity:</strong> Driver's license, state ID, school ID with photo, 
              military ID, or government ID<br><br>
              <strong>+</strong><br><br>
              <strong>List C - Authorization:</strong> Social Security card (unrestricted), 
              birth certificate, Certificate of Naturalization, or U.S. Citizen ID
            </div>
          </div>
        </div>
      </div>

      <div class="azCard" style="margin-top:16px;">
        ${sectionHeader("Verification Process")}
        <div style="display:flex;flex-direction:column;gap:16px;">
          <div style="display:flex;gap:12px;">
            <div style="width:32px;height:32px;border-radius:999px;background:rgba(29,78,216,.10);display:flex;align-items:center;justify-content:center;color:rgba(29,78,216,1);font-weight:1000;font-size:14px;flex-shrink:0;">1</div>
            <div>
              <div style="font-weight:1000;font-size:13px;color:rgba(2,6,23,.85);">Day 1: Document Presentation</div>
              <div class="muted" style="font-size:12px;margin-top:4px;">Bring original documents to HR during orientation</div>
            </div>
          </div>
          <div style="display:flex;gap:12px;">
            <div style="width:32px;height:32px;border-radius:999px;background:rgba(29,78,216,.10);display:flex;align-items:center;justify-content:center;color:rgba(29,78,216,1);font-weight:1000;font-size:14px;flex-shrink:0;">2</div>
            <div>
              <div style="font-weight:1000;font-size:13px;color:rgba(2,6,23,.85);">Day 1-3: Physical Examination</div>
              <div class="muted" style="font-size:12px;margin-top:4px;">HR representative examines and verifies documents</div>
            </div>
          </div>
          <div style="display:flex;gap:12px;">
            <div style="width:32px;height:32px;border-radius:999px;background:rgba(29,78,216,.10);display:flex;align-items:center;justify-content:center;color:rgba(29,78,216,1);font-weight:1000;font-size:14px;flex-shrink:0;">3</div>
            <div>
              <div style="font-weight:1000;font-size:13px;color:rgba(2,6,23,.85);">E-Verify Confirmation</div>
              <div class="muted" style="font-size:12px;margin-top:4px;">Federal database verification (if applicable)</div>
            </div>
          </div>
        </div>
      </div>

      <div class="azCard" style="margin-top:16px;">
        ${sectionHeader("Acknowledgement")}
        <label class="checkrow" style="display:flex;gap:12px;align-items:flex-start;padding:16px;border:1px solid rgba(229,234,242,.95);border-radius:16px;cursor:pointer;background:#fff;">
          <input type="checkbox" id="i9Ack" style="width:20px;height:20px;margin-top:2px;accent-color:#2563eb;"/>
          <span style="font-size:13px;line-height:1.6;color:rgba(2,6,23,.80);">
            I understand that I must bring original, unexpired documents on my first day 
            to complete the Form I-9 verification process. I understand that failure to 
            provide acceptable documentation within 3 business days will result in termination 
            of employment as required by federal law.
          </span>
        </label>

        <button class="btn primary" id="btnI9Save" type="button"
          style="display:block;width:100%;text-align:center;border-radius:16px;padding:16px;margin-top:20px;">
          Confirm I-9 Understanding
        </button>
      </div>
    `
  );

  document.getElementById("btnI9Save").onclick = async () => {
    const ack = document.getElementById("i9Ack").checked;
    if (!ack) return uiToast("Please acknowledge to continue.");

    const steps = (userData.steps || []).map(s =>
      s.id === "i9" ? ({ ...s, done: true }) : s
    );

    await saveUserPatch({ i9: { ack: true }, steps });
    triggerConfetti();
    uiToast("I-9 acknowledged successfully!");
    location.hash = "#i9";
  };
}

// ===============================
// PHOTO BADGE
// ===============================
function renderPhotoBadge(userData) {
  const status = getStepStatus("photo_badge", userData);
  
  if (status.isLocked) {
    setPage(
      "Photo Badge",
      "Locked",
      `
        <div class="azCard" style="text-align:center;padding:40px 24px;">
          <div style="width:64px;height:64px;border-radius:999px;background:rgba(2,6,23,.06);display:flex;align-items:center;justify-content:center;margin:0 auto 16px;color:rgba(2,6,23,.40);">
            ${azIcon("lock")}
          </div>
          <div style="font-weight:1000;font-size:16px;color:rgba(2,6,23,.85);margin-bottom:8px;">Step Locked</div>
          <div style="font-size:13px;color:rgba(2,6,23,.60);line-height:1.5;margin-bottom:20px;">
            Please complete I-9 Verification before accessing this step.
          </div>
          <a class="btn primary" href="#i9" style="display:block;width:100%;border-radius:16px;padding:14px;">
            Go to I-9 Verification
          </a>
        </div>
      `
    );
    return;
  }

  setPage(
    "Photo Badge",
    "Facility identification badge",
    `
      <div class="azCard" style="text-align:center;padding:40px 24px;">
        <div style="width:80px;height:80px;border-radius:999px;background:rgba(245,158,11,.10);display:flex;align-items:center;justify-content:center;margin:0 auto 20px;color:rgba(245,158,11,1);">
          ${azIcon("user")}
        </div>
        <div style="font-weight:1000;font-size:20px;color:rgba(2,6,23,.85);margin-bottom:8px;">Photo Badge Required</div>
        <div style="font-size:14px;color:rgba(2,6,23,.60);line-height:1.6;margin-bottom:24px;">
          Your photo identification badge will be created during your first day orientation.<br>
          This step <strong>cannot be completed online</strong> and requires your physical presence 
          at the facility.
        </div>

        <div class="azCard" style="text-align:left;margin-bottom:24px;background:rgba(245,158,11,.04);border-color:rgba(245,158,11,.20);">
          <div class="azCardTitle">What to Expect:</div>
          <ul style="margin:12px 0 0 0;padding-left:18px;line-height:1.8;">
            <li>Professional photo taken by HR staff</li>
            <li>Badge printed with your name, photo, and employee ID</li>
            <li>Access permissions programmed for your assigned areas</li>
            <li>Safety briefing on badge usage and facility access</li>
          </ul>
        </div>

        <div style="padding:16px;background:rgba(2,6,23,.05);border-radius:12px;margin-bottom:24px;">
          <div style="font-weight:1000;font-size:13px;color:rgba(2,6,23,.85);margin-bottom:8px;">Status: Pending First Day</div>
          <div class="muted" style="font-size:13px;">
            This step will be marked complete after you receive your badge during orientation.
          </div>
        </div>

        ${status.isDone ? `
          <div style="padding:16px;background:rgba(22,163,74,.10);border-radius:12px;border:1px solid rgba(22,163,74,.25);">
            <div style="font-weight:1000;font-size:14px;color:rgba(22,163,74,1);">Badge Completed</div>
          </div>
        ` : `
          <a class="btn primary" href="#firstday" style="display:block;width:100%;border-radius:16px;padding:16px;">
            View First Day Instructions
          </a>
        `}
      </div>
    `
  );
}

function renderW4(userData) {
  setPage(
    "Tax Forms (W-4)",
    "Federal tax withholding setup",
    `
      <div class="w4-info">
        <div class="w4-title">${azIcon("file")} W-4 Employee's Withholding Certificate</div>
        <div class="w4-text">
          Complete your W-4 to determine federal income tax withholding from your paycheck. 
          This form must be completed during your first week of employment.
        </div>
      </div>

      <div class="azCard">
        <div class="azCardTitle">When to Complete</div>
        <div class="muted" style="line-height:1.7;margin-top:12px;">
          <strong>Timing:</strong> During your first week, after you have received your first paycheck estimate.<br><br>
          <strong>Location:</strong> HR office or through the employee self-service portal (link provided after first day).<br><br>
          <strong>Assistance:</strong> HR representatives are available to answer questions and provide guidance 
          on withholding allowances and deductions.
        </div>
      </div>

      <div class="azCard" style="margin-top:16px;">
        <div class="azCardTitle">Information You'll Need</div>
        <ul style="margin:12px 0 0 0;padding-left:18px;line-height:1.8;color:rgba(2,6,23,.70);">
          <li>Social Security Number</li>
          <li>Filing status (Single, Married, Head of Household)</li>
          <li>Number of dependents and other credits</li>
          <li>Additional income or jobs (Step 2)</li>
          <li>Other adjustments (Step 4) - optional</li>
        </ul>
      </div>

      <div class="azCard" style="margin-top:16px;">
        <div class="azCardTitle">State Tax Forms</div>
        <div class="muted" style="line-height:1.7;margin-top:12px;">
          Depending on your state of residence, you may also need to complete state tax withholding forms. 
          HR will provide these during your first week if applicable.
        </div>
      </div>

      <div class="azCard" style="margin-top:16px;padding:24px;text-align:center;background:rgba(229,234,242,.40);">
        <div style="width:64px;height:64px;border-radius:999px;background:rgba(2,6,23,.05);display:flex;align-items:center;justify-content:center;margin:0 auto 16px;color:rgba(2,6,23,.40);">
          ${azIcon("file")}
        </div>
        <div style="font-weight:1000;font-size:16px;color:rgba(2,6,23,.85);margin-bottom:8px;">Available After First Week</div>
        <div style="font-size:13px;color:rgba(2,6,23,.60);line-height:1.5;">
          The W-4 form will be available in your portal after you complete your first week.<br>
          For immediate assistance, contact HR at (800) 876-4321.
        </div>
      </div>
    `
  );
}

function renderFirstDay(userData, recordData) {
  const status = getStepStatus("firstday", userData);
  
  if (status.isLocked) {
    setPage(
      "First Day",
      "Locked",
      `
        <div class="azCard" style="text-align:center;padding:40px 24px;">
          <div style="width:64px;height:64px;border-radius:999px;background:rgba(2,6,23,.06);display:flex;align-items:center;justify-content:center;margin:0 auto 16px;color:rgba(2,6,23,.40);">
            ${azIcon("lock")}
          </div>
          <div style="font-weight:1000;font-size:16px;color:rgba(2,6,23,.85);margin-bottom:8px;">Step Locked</div>
          <div style="font-size:13px;color:rgba(2,6,23,.60);line-height:1.5;margin-bottom:20px;">
            Please complete previous onboarding steps before accessing first day instructions.
          </div>
          <a class="btn primary" href="#progress" style="display:block;width:100%;border-radius:16px;padding:14px;">
            View Progress
          </a>
        </div>
      `
    );
    return;
  }

  const appt = recordData?.appointment || userData?.appointment || {};
  
  setPage(
    "First Day Instructions",
    "Everything you need for a successful start",
    `
      <div class="azCard" style="background:linear-gradient(135deg,rgba(29,78,216,.08),rgba(22,163,74,.04));border-color:rgba(29,78,216,.20);padding:24px;">
        <div style="text-align:center;">
          <div style="width:64px;height:64px;border-radius:999px;background:rgba(255,255,255,.80);display:flex;align-items:center;justify-content:center;margin:0 auto 16px;color:rgba(29,78,216,1);box-shadow:0 4px 12px rgba(0,0,0,.08);">
            ${azIcon("building")}
          </div>
          <div style="font-weight:1000;font-size:22px;color:rgba(2,6,23,.85);margin-bottom:8px;">Your First Day at SunPower</div>
          <div style="font-size:14px;color:rgba(2,6,23,.60);">
            We're excited to have you join our team!
          </div>
        </div>
      </div>

      <div class="azCard" style="margin-top:16px;">
        <div class="azCardTitle">Appointment Details</div>
        <div style="margin-top:16px;display:grid;grid-template-columns:1fr;gap:16px;">
          <div style="display:flex;gap:12px;align-items:center;">
            <div style="width:40px;height:40px;border-radius:10px;background:rgba(29,78,216,.10);display:flex;align-items:center;justify-content:center;color:rgba(29,78,216,1);">
              ${azIcon("calendar")}
            </div>
            <div>
              <div style="font-size:11px;color:rgba(2,6,23,.50);text-transform:uppercase;letter-spacing:0.5px;">Date</div>
              <div style="font-weight:1000;font-size:15px;color:rgba(2,6,23,.85);">${safe(appt.date, "To be confirmed by HR")}</div>
            </div>
          </div>
          
          <div style="display:flex;gap:12px;align-items:center;">
            <div style="width:40px;height:40px;border-radius:10px;background:rgba(29,78,216,.10);display:flex;align-items:center;justify-content:center;color:rgba(29,78,216,1);">
              ${azIcon("clock")}
            </div>
            <div>
              <div style="font-size:11px;color:rgba(2,6,23,.50);text-transform:uppercase;letter-spacing:0.5px;">Time</div>
              <div style="font-weight:1000;font-size:15px;color:rgba(2,6,23,.85);">${safe(appt.time, "To be confirmed by HR")}</div>
            </div>
          </div>
          
          <div style="display:flex;gap:12px;align-items:center;">
            <div style="width:40px;height:40px;border-radius:10px;background:rgba(29,78,216,.10);display:flex;align-items:center;justify-content:center;color:rgba(29,78,216,1);">
              ${azIcon("info")}
            </div>
            <div>
              <div style="font-size:11px;color:rgba(2,6,23,.50);text-transform:uppercase;letter-spacing:0.5px;">Location</div>
              <div style="font-weight:1000;font-size:15px;color:rgba(2,6,23,.85);">${safe(appt.address, "To be confirmed by HR")}</div>
            </div>
          </div>
        </div>
        
        ${appt.notes ? `
          <div style="margin-top:16px;padding:12px;background:rgba(245,158,11,.08);border-radius:10px;border:1px solid rgba(245,158,11,.20);">
            <div style="font-weight:1000;font-size:12px;color:rgba(180,83,9,1);margin-bottom:4px;">Special Instructions:</div>
            <div style="font-size:13px;color:rgba(2,6,23,.70);">${escapeHtml(appt.notes)}</div>
          </div>
        ` : ''}
      </div>

      <div class="azCard" style="margin-top:16px;">
        <div class="azCardTitle">What to Bring</div>
        <div style="margin-top:16px;display:flex;flex-direction:column;gap:12px;">
          <div style="display:flex;gap:12px;align-items:flex-start;">
            <div style="width:24px;height:24px;border-radius:6px;background:rgba(22,163,74,.15);display:flex;align-items:center;justify-content:center;color:rgba(22,163,74,1);font-weight:1000;font-size:12px;flex-shrink:0;">${azIcon("check")}</div>
            <div>
              <div style="font-weight:1000;font-size:13px;color:rgba(2,6,23,.85);">Government-issued Photo ID</div>
              <div class="muted" style="font-size:12px;">Driver's license, state ID, or passport for I-9 verification</div>
            </div>
          </div>
          
          <div style="display:flex;gap:12px;align-items:flex-start;">
            <div style="width:24px;height:24px;border-radius:6px;background:rgba(22,163,74,.15);display:flex;align-items:center;justify-content:center;color:rgba(22,163,74,1);font-weight:1000;font-size:12px;flex-shrink:0;">${azIcon("check")}</div>
            <div>
              <div style="font-weight:1000;font-size:13px;color:rgba(2,6,23,.85);">Social Security Card or Birth Certificate</div>
              <div class="muted" style="font-size:12px;">Original documents for employment verification</div>
            </div>
          </div>
          
          <div style="display:flex;gap:12px;align-items:flex-start;">
            <div style="width:24px;height:24px;border-radius:6px;background:rgba(22,163,74,.15);display:flex;align-items:center;justify-content:center;color:rgba(22,163,74,1);font-weight:1000;font-size:12px;flex-shrink:0;">${azIcon("check")}</div>
            <div>
              <div style="font-weight:1000;font-size:13px;color:rgba(2,6,23,.85);">Safety Footwear</div>
              <div class="muted" style="font-size:12px;">Steel/composite toe boots - required for facility access</div>
            </div>
          </div>
          
          <div style="display:flex;gap:12px;align-items:flex-start;">
            <div style="width:24px;height:24px;border-radius:6px;background:rgba(22,163,74,.15);display:flex;align-items:center;justify-content:center;color:rgba(22,163,74,1);font-weight:1000;font-size:12px;flex-shrink:0;">${azIcon("check")}</div>
            <div>
              <div style="font-weight:1000;font-size:13px;color:rgba(2,6,23,.85);">Smartphone</div>
              <div class="muted" style="font-size:12px;">To download the SunPower Employee App during orientation</div>
            </div>
          </div>
          
          <div style="display:flex;gap:12px;align-items:flex-start;">
            <div style="width:24px;height:24px;border-radius:6px;background:rgba(22,163,74,.15);display:flex;align-items:center;justify-content:center;color:rgba(22,163,74,1);font-weight:1000;font-size:12px;flex-shrink:0;">${azIcon("check")}</div>
            <div>
              <div style="font-weight:1000;font-size:13px;color:rgba(2,6,23,.85);">Banking Information</div>
              <div class="muted" style="font-size:12px;">Voided check or bank details for direct deposit setup</div>
            </div>
          </div>
          
          <div style="display:flex;gap:12px;align-items:flex-start;">
            <div style="width:24px;height:24px;border-radius:6px;background:rgba(22,163,74,.15);display:flex;align-items:center;justify-content:center;color:rgba(22,163,74,1);font-weight:1000;font-size:12px;flex-shrink:0;">${azIcon("check")}</div>
            <div>
              <div style="font-weight:1000;font-size:13px;color:rgba(2,6,23,.85);">Water Bottle & Light Snack</div>
              <div class="muted" style="font-size:12px;">Orientation is 4-6 hours with breaks</div>
            </div>
          </div>
        </div>
      </div>

      <div class="azCard" style="margin-top:16px;">
        <div class="azCardTitle">SunPower Employee App</div>
        <div class="muted" style="line-height:1.7;margin-top:12px;">
          During orientation, you will download and set up the SunPower Employee App. This app provides:
        </div>
        <ul style="margin:12px 0 0 0;padding-left:18px;line-height:1.8;color:rgba(2,6,23,.70);">
          <li>Access to your schedule and timecard</li>
          <li>Pay stubs and tax documents</li>
          <li>Benefits enrollment and management</li>
          <li>Direct communication with HR</li>
          <li>Safety training videos and resources</li>
          <li>Emergency alerts and company news</li>
        </ul>
      </div>

      <div class="azCard" style="margin-top:16px;">
        <div class="azCardTitle">First Day Agenda</div>
        <div style="margin-top:16px;display:flex;flex-direction:column;gap:16px;">
          <div style="display:flex;gap:12px;">
            <div style="width:60px;text-align:right;font-weight:1000;font-size:13px;color:rgba(2,6,23,.60);flex-shrink:0;">8:00 AM</div>
            <div style="flex:1;padding-left:12px;border-left:2px solid rgba(229,234,242,.95);">
              <div style="font-weight:1000;font-size:13px;color:rgba(2,6,23,.85);">Check-in & Welcome</div>
              <div class="muted" style="font-size:12px;">HR reception, badge photo, facility tour</div>
            </div>
          </div>
          
          <div style="display:flex;gap:12px;">
            <div style="width:60px;text-align:right;font-weight:1000;font-size:13px;color:rgba(2,6,23,.60);flex-shrink:0;">9:00 AM</div>
            <div style="flex:1;padding-left:12px;border-left:2px solid rgba(229,234,242,.95);">
              <div style="font-weight:1000;font-size:13px;color:rgba(2,6,23,.85);">I-9 Verification</div>
              <div class="muted" style="font-size:12px;">Document review and E-Verify processing</div>
            </div>
          </div>
          
          <div style="display:flex;gap:12px;">
            <div style="width:60px;text-align:right;font-weight:1000;font-size:13px;color:rgba(2,6,23,.60);flex-shrink:0;">10:30 AM</div>
            <div style="flex:1;padding-left:12px;border-left:2px solid rgba(229,234,242,.95);">
              <div style="font-weight:1000;font-size:13px;color:rgba(2,6,23,.85);">Safety Orientation</div>
              <div class="muted" style="font-size:12px;">PPE requirements, emergency procedures, facility rules</div>
            </div>
          </div>
          
          <div style="display:flex;gap:12px;">
            <div style="width:60px;text-align:right;font-weight:1000;font-size:13px;color:rgba(2,6,23,.60);flex-shrink:0;">12:00 PM</div>
            <div style="flex:1;padding-left:12px;border-left:2px solid rgba(229,234,242,.95);">
              <div style="font-weight:1000;font-size:13px;color:rgba(2,6,23,.85);">Lunch Break</div>
              <div class="muted" style="font-size:12px;">Cafeteria orientation, meet your team</div>
            </div>
          </div>
          
          <div style="display:flex;gap:12px;">
            <div style="width:60px;text-align:right;font-weight:1000;font-size:13px;color:rgba(2,6,23,.60);flex-shrink:0;">1:00 PM</div>
            <div style="flex:1;padding-left:12px;border-left:2px solid rgba(229,234,242,.95);">
              <div style="font-weight:1000;font-size:13px;color:rgba(2,6,23,.85);">Systems Setup</div>
              <div class="muted" style="font-size:12px;">App download, direct deposit, benefits overview</div>
            </div>
          </div>
          
          <div style="display:flex;gap:12px;">
            <div style="width:60px;text-align:right;font-weight:1000;font-size:13px;color:rgba(2,6,23,.60);flex-shrink:0;">2:30 PM</div>
            <div style="flex:1;padding-left:12px;border-left:2px solid rgba(229,234,242,.95);">
              <div style="font-weight:1000;font-size:13px;color:rgba(2,6,23,.85);">Department Assignment</div>
              <div class="muted" style="font-size:12px;">Meet your supervisor, workstation assignment</div>
            </div>
          </div>
        </div>
      </div>

      <div class="azCard" style="margin-top:16px;background:rgba(220,38,38,.04);border-color:rgba(220,38,38,.15);">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
          <div style="color:rgba(220,38,38,1);">${azIcon("alert")}</div>
          <div class="azCardTitle" style="color:rgba(220,38,38,1);">Important Reminders</div>
        </div>
        <ul style="margin:0;padding-left:18px;line-height:1.8;color:rgba(2,6,23,.70);">
          <li>Arrive 15 minutes early to allow time for parking and check-in</li>
          <li>Wear comfortable business casual attire (safety gear provided)</li>
          <li>No open-toed shoes, sandals, or heels permitted in facility</li>
          <li>Bring a positive attitude and questions for your team!</li>
        </ul>
      </div>

      ${!status.isDone ? `
        <button class="btn primary" id="btnFirstDayComplete" type="button" style="width:100%;border-radius:16px;padding:16px;margin-top:20px;">
          I Completed My First Day
        </button>
        <div class="small muted" style="margin-top:12px;line-height:1.4;text-align:center;">
          Only click this button after you have completed your first day orientation.
        </div>
      ` : `
        <div class="azCard" style="margin-top:20px;text-align:center;background:rgba(22,163,74,.08);border-color:rgba(22,163,74,.25);">
          <div style="font-weight:1000;font-size:16px;color:rgba(22,163,74,1);">First Day Completed!</div>
          <div style="margin-top:8px;color:rgba(2,6,23,.60);">Welcome to the SunPower team!</div>
        </div>
      `}
    `
  );
  
  const btn = document.getElementById("btnFirstDayComplete");
  if (btn) {
    btn.onclick = async () => {
      if (!confirm("Confirm that you have completed your first day orientation?")) return;
      
      const steps = (userData.steps || []).map(s =>
        s.id === "firstday" ? ({ ...s, done: true }) : s
      );
      
      if (isFirebaseConfigured()) {
        const userRef = doc(db, "users", userData.uid);
        await updateDoc(userRef, { steps, status: "active", updatedAt: serverTimestamp() });
      }
      
      triggerConfetti();
      uiToast("Congratulations! Onboarding complete.");
      location.hash = "#firstday";
    };
  }
}

// ===============================
// PAYROLL
// ===============================
function renderPayroll(recordData) {
  setPage(
    "Payroll",
    "Compensation and payment information",
    `
      <div class="azCard" style="text-align:center;padding:40px 24px;">
        <div style="width:64px;height:64px;border-radius:999px;background:rgba(2,6,23,.05);display:flex;align-items:center;justify-content:center;margin:0 auto 20px;color:rgba(2,6,23,.40);">
          ${azIcon("dollar")}
        </div>
        <div style="font-weight:1000;font-size:20px;color:rgba(2,6,23,.85);margin-bottom:12px;">Payroll Access Coming Soon</div>
        <div style="font-size:14px;color:rgba(2,6,23,.60);line-height:1.6;max-width:400px;margin:0 auto;">
          Your payroll information will be available after your first pay period.<br><br>
          <strong>Payment Schedule:</strong> Weekly (every Friday)<br>
          <strong>First Check:</strong> Available after completing your first week
        </div>
      </div>

      <div class="azCard" style="margin-top:16px;">
        <div class="azCardTitle">What You'll Access Here</div>
        <div style="margin-top:16px;display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <div class="azCard" style="margin:0;text-align:center;">
            <div style="width:48px;height:48px;border-radius:12px;background:rgba(29,78,216,.10);display:flex;align-items:center;justify-content:center;margin:0 auto 12px;color:rgba(29,78,216,1);">
              ${azIcon("file")}
            </div>
            <div style="font-weight:1000;font-size:13px;">Pay Stubs</div>
            <div class="muted" style="font-size:11px;margin-top:4px;">View and download</div>
          </div>
          <div class="azCard" style="margin:0;text-align:center;">
            <div style="width:48px;height:48px;border-radius:12px;background:rgba(22,163,74,.10);display:flex;align-items:center;justify-content:center;margin:0 auto 12px;color:rgba(22,163,74,1);">
              ${azIcon("building")}
            </div>
            <div style="font-weight:1000;font-size:13px;">Direct Deposit</div>
            <div class="muted" style="font-size:11px;margin-top:4px;">Manage banking</div>
          </div>
          <div class="azCard" style="margin:0;text-align:center;">
            <div style="width:48px;height:48px;border-radius:12px;background:rgba(245,158,11,.10);display:flex;align-items:center;justify-content:center;margin:0 auto 12px;color:rgba(245,158,11,1);">
              ${azIcon("file")}
            </div>
            <div style="font-weight:1000;font-size:13px;">Tax Forms</div>
            <div class="muted" style="font-size:11px;margin-top:4px;">W-2, W-4 updates</div>
          </div>
          <div class="azCard" style="margin:0;text-align:center;">
            <div style="width:48px;height:48px;border-radius:12px;background:rgba(124,58,237,.10);display:flex;align-items:center;justify-content:center;margin:0 auto 12px;color:rgba(124,58,237,1);">
              ${azIcon("calendar")}
            </div>
            <div style="font-weight:1000;font-size:13px;">Earnings History</div>
            <div class="muted" style="font-size:11px;margin-top:4px;">Year-to-date totals</div>
          </div>
        </div>
      </div>

      <div class="azCard" style="margin-top:16px;">
        <div class="azCardTitle">Direct Deposit Setup</div>
        <div class="muted" style="line-height:1.7;margin-top:12px;">
          Direct deposit will be configured during your first day orientation with HR.<br><br>
          Please bring a voided check or your bank account and routing numbers to complete setup.
        </div>
        <a class="btn ghost" href="#help" style="display:block;width:100%;text-align:center;margin-top:16px;border-radius:16px;">
          Contact Payroll Department
        </a>
      </div>
    `
  );
}

// ===============================
// TIME OFF / BENEFITS
// ===============================
function renderTimeOff(recordData) {
  setPage(
    "Benefits & Time Off",
    "Employee benefits and time management",
    `
      <div class="benefits-grid">
        <div class="benefit-card">
          <div class="benefit-header">
            <div class="benefit-icon" style="background:rgba(220,38,38,.10);color:rgba(220,38,38,1);">
              ${azIcon("heart")}
            </div>
            <div class="benefit-title">Health & Wellness</div>
          </div>
          <ul class="benefit-list">
            <li>Medical, dental, and vision coverage – Day 1 for full-time</li>
            <li>Wellness program – Physical and mental health resources</li>
            <li>EAP – Free confidential counseling</li>
            <li>Protective equipment – Safety footwear and uniforms provided</li>
          </ul>
        </div>

        <div class="benefit-card">
          <div class="benefit-header">
            <div class="benefit-icon" style="background:rgba(22,163,74,.10);color:rgba(22,163,74,1);">
              ${azIcon("dollar")}
            </div>
            <div class="benefit-title">Compensation & Savings</div>
          </div>
          <ul class="benefit-list">
            <li>Weekly pay – Fast access to pay stubs</li>
            <li>401(k) with company match – Start saving for retirement</li>
            <li>Referral bonuses – Earn for recommending talent</li>
            <li>Educational assistance – Financial support for studies</li>
          </ul>
        </div>

        <div class="benefit-card">
          <div class="benefit-header">
            <div class="benefit-icon" style="background:rgba(245,158,11,.10);color:rgba(245,158,11,1);">
              ${azIcon("calendar")}
            </div>
            <div class="benefit-title">Time & Flexibility</div>
          </div>
          <ul class="benefit-list">
            <li>Accrued PTO – Vacation and personal days by tenure</li>
            <li>Paid family leave – For new parents</li>
            <li>Time off requests – Easy digital management</li>
            <li>Flexible shift policies – Swap or coverage options</li>
          </ul>
        </div>

        <div class="benefit-card">
          <div class="benefit-header">
            <div class="benefit-icon" style="background:rgba(29,78,216,.10);color:rgba(29,78,216,1);">
              ${azIcon("award")}
            </div>
            <div class="benefit-title">Growth & Development</div>
          </div>
          <ul class="benefit-list">
            <li>Internal training – Safety, technical, and leadership</li>
            <li>Mentorship program – Professional development guidance</li>
            <li>Training portal – Online course access</li>
            <li>Internal promotions – Advancement opportunities</li>
          </ul>
        </div>

        <div class="benefit-card">
          <div class="benefit-header">
            <div class="benefit-icon" style="background:rgba(124,58,237,.10);color:rgba(124,58,237,1);">
              ${azIcon("shield")}
            </div>
            <div class="benefit-title">Safety & Support</div>
          </div>
          <ul class="benefit-list">
            <li>Report incident – Quick portal form</li>
            <li>Safety policies – Always accessible</li>
            <li>Safety & HR contact – Direct from your profile</li>
            <li>Equipment/tools request – Get what you need</li>
          </ul>
        </div>

        <div class="benefit-card">
          <div class="benefit-header">
            <div class="benefit-icon" style="background:rgba(14,165,233,.10);color:rgba(14,165,233,1);">
              ${azIcon("star")}
            </div>
            <div class="benefit-title">Perks & Discounts</div>
          </div>
          <ul class="benefit-list">
            <li>Corporate discounts – Local and national partners</li>
            <li>Recognition program – Points for achievements</li>
            <li>Team events – Social activities and meetings</li>
            <li>Mobile employee app – Schedules, pay, news on your phone</li>
          </ul>
        </div>
      </div>

      <div class="azCard" style="margin-top:16px;">
        <div class="azCardTitle">Time Off Requests</div>
        <div style="margin-top:16px;padding:24px;background:rgba(229,234,242,.40);border-radius:12px;text-align:center;">
          <div style="width:64px;height:64px;border-radius:999px;background:rgba(2,6,23,.05);display:flex;align-items:center;justify-content:center;margin:0 auto 16px;color:rgba(2,6,23,.40);">
            ${azIcon("calendar")}
          </div>
          <div style="font-weight:1000;font-size:16px;color:rgba(2,6,23,.85);margin-bottom:8px;">PTO Management</div>
          <div style="font-size:13px;color:rgba(2,6,23,.60);line-height:1.5;">
            Request and track vacation, personal days, and sick time.<br>
            Available after completing your first 90 days.
          </div>
        </div>
        <a class="btn ghost" href="#help" style="display:block;width:100%;text-align:center;margin-top:16px;border-radius:16px;">
          Contact HR About Time Off
        </a>
      </div>
    `
  );
}

// ===============================
// HOURS
// ===============================
function renderHours(recordData) {
  setPage(
    "My Hours",
    "Work hours and attendance",
    `
      <div class="azCard" style="text-align:center;padding:40px 24px;">
        <div style="width:64px;height:64px;border-radius:999px;background:rgba(2,6,23,.05);display:flex;align-items:center;justify-content:center;margin:0 auto 20px;color:rgba(2,6,23,.40);">
          ${azIcon("clock")}
        </div>
        <div style="font-weight:1000;font-size:20px;color:rgba(2,6,23,.85);margin-bottom:12px;">Hours Tracking Coming Soon</div>
        <div style="font-size:14px;color:rgba(2,6,23,.60);line-height:1.6;max-width:400px;margin:0 auto;">
          Your work hours will be displayed here after your first day.<br><br>
          Track your weekly hours, overtime, and attendance history.
        </div>
      </div>

      <div class="azCard" style="margin-top:16px;">
        <div class="azCardTitle">Current Week Overview</div>
        <div style="margin-top:16px;display:grid;grid-template-columns:repeat(3,1fr);gap:12px;">
          <div style="text-align:center;padding:16px;background:rgba(229,234,242,.40);border-radius:12px;">
            <div style="font-weight:1000;font-size:24px;color:rgba(2,6,23,.40);">--</div>
            <div style="font-size:11px;color:rgba(2,6,23,.60);text-transform:uppercase;letter-spacing:0.5px;margin-top:4px;">Scheduled</div>
          </div>
          <div style="text-align:center;padding:16px;background:rgba(229,234,242,.40);border-radius:12px;">
            <div style="font-weight:1000;font-size:24px;color:rgba(2,6,23,.40);">--</div>
            <div style="font-size:11px;color:rgba(2,6,23,.60);text-transform:uppercase;letter-spacing:0.5px;margin-top:4px;">Worked</div>
          </div>
          <div style="text-align:center;padding:16px;background:rgba(229,234,242,.40);border-radius:12px;">
            <div style="font-weight:1000;font-size:24px;color:rgba(2,6,23,.40);">--</div>
            <div style="font-size:11px;color:rgba(2,6,23,.60);text-transform:uppercase;letter-spacing:0.5px;margin-top:4px;">Overtime</div>
          </div>
        </div>
      </div>

      <div class="azCard" style="margin-top:16px;">
        <div class="azCardTitle">Attendance Policies</div>
        <div class="muted" style="line-height:1.7;margin-top:12px;">
          <strong>Punctuality matters.</strong> Consistent attendance is essential for operational 
          success and team reliability. Your supervisor will review specific attendance 
          expectations during orientation.<br><br>
          For attendance questions or to report an absence, contact HR immediately at (800) 876-4321.
        </div>
      </div>
    `
  );
}

// ===============================
// DIRECT DEPOSIT
// ===============================
function renderDeposit(recordData) {
  setPage(
    "Direct Deposit",
    "Banking and payment setup",
    `
      <div class="azCard" style="text-align:center;padding:40px 24px;">
        <div style="width:64px;height:64px;border-radius:999px;background:rgba(2,6,23,.05);display:flex;align-items:center;justify-content:center;margin:0 auto 20px;color:rgba(2,6,23,.40);">
          ${azIcon("building")}
        </div>
        <div style="font-weight:1000;font-size:20px;color:rgba(2,6,23,.85);margin-bottom:12px;">Setup on First Day</div>
        <div style="font-size:14px;color:rgba(2,6,23,.60);line-height:1.6;max-width:400px;margin:0 auto;">
          Direct deposit will be configured during your first day orientation.<br><br>
          Please bring your banking information to complete setup with HR.
        </div>
      </div>

      <div class="azCard" style="margin-top:16px;">
        <div class="azCardTitle">What to Bring</div>
        <div style="margin-top:16px;display:flex;flex-direction:column;gap:12px;">
          <div style="display:flex;gap:12px;align-items:center;">
            <div style="width:32px;height:32px;border-radius:8px;background:rgba(22,163,74,.10);display:flex;align-items:center;justify-content:center;color:rgba(22,163,74,1);font-weight:1000;">${azIcon("check")}</div>
            <div style="font-size:13px;color:rgba(2,6,23,.80);">Voided check, OR</div>
          </div>
          <div style="display:flex;gap:12px;align-items:center;">
            <div style="width:32px;height:32px;border-radius:8px;background:rgba(22,163,74,.10);display:flex;align-items:center;justify-content:center;color:rgba(22,163,74,1);font-weight:1000;">${azIcon("check")}</div>
            <div style="font-size:13px;color:rgba(2,6,23,.80);">Bank account number and routing number</div>
          </div>
          <div style="display:flex;gap:12px;align-items:center;">
            <div style="width:32px;height:32px;border-radius:8px;background:rgba(22,163,74,.10);display:flex;align-items:center;justify-content:center;color:rgba(22,163,74,1);font-weight:1000;">${azIcon("check")}</div>
            <div style="font-size:13px;color:rgba(2,6,23,.80);">Bank name and account type (checking/savings)</div>
          </div>
        </div>
      </div>

      <div class="azCard" style="margin-top:16px;">
        <div class="azCardTitle">Payment Information</div>
        <div class="muted" style="line-height:1.7;margin-top:12px;">
          <strong>Pay Frequency:</strong> Weekly (every Friday)<br>
          <strong>First Paycheck:</strong> Available the Friday after your first full week<br>
          <strong>Pay Stub Access:</strong> Available through this portal and mobile app<br><br>
          Questions about payroll? Contact HR Payroll at (800) 876-4321.
        </div>
      </div>
    `
  );
}

// ===============================
// NOTIFICATIONS
// ===============================
function renderNotifications(userData, recordData, publicData) {
  const personal = Array.isArray(userData?.notifications) ? userData.notifications : [];
  const recordNotifs = Array.isArray(recordData?.notifications) ? recordData.notifications : [];
  const globalN = Array.isArray(publicData?.globalNotifications) ? publicData.globalNotifications : [];

  const merged = [
    ...globalN.map(x => ({ ...x, _scope: "company", _date: x.createdAt || new Date().toISOString() })),
    ...recordNotifs.map(x => ({ ...x, _scope: "hr", _date: x.createdAt || new Date().toISOString() })),
    ...personal.map(x => ({ ...x, _scope: "you", _date: x.createdAt || new Date().toISOString() }))
  ].sort((a, b) => new Date(b._date) - new Date(a._date));

  setPage(
    "Notifications",
    "Company updates and personal alerts",
    `
      <div class="azCard">
        ${sectionHeader("Inbox")}
        ${merged.length ? merged.map(n => `
          <div class="azCard" style="box-shadow:none;border-radius:14px;margin-top:10px;${n._scope === 'company' ? 'border-left:3px solid rgba(29,78,216,.50);' : n._scope === 'hr' ? 'border-left:3px solid rgba(245,158,11,.50);' : ''}">
            <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center;">
              <div style="font-weight:1000;font-size:13px;">${escapeHtml(n.title || "Update")}</div>
              <span style="font-size:10px;padding:4px 10px;border-radius:999px;font-weight:900;text-transform:uppercase;letter-spacing:0.3px;${
                n._scope === 'company' ? 'background:rgba(29,78,216,.10);color:rgba(29,78,216,1);' : 
                n._scope === 'hr' ? 'background:rgba(245,158,11,.10);color:rgba(180,83,9,1);' : 
                'background:rgba(2,6,23,.06);color:rgba(2,6,23,.60);'
              }">${n._scope === "company" ? "Company" : n._scope === "hr" ? "HR" : "Personal"}</span>
            </div>
            <div class="muted" style="margin-top:10px;line-height:1.5;font-size:13px;">${escapeHtml(n.body || "")}</div>
            ${n.route ? `
              <a class="btn ghost" href="#${escapeHtml(n.route)}" style="margin-top:12px;width:100%;border-radius:16px;text-align:center;">
                ${escapeHtml(n.action || "View")}
              </a>
            ` : ''}
          </div>
        `).join("") : `
          <div style="text-align:center;padding:40px 20px;">
            <div style="width:64px;height:64px;border-radius:999px;background:rgba(2,6,23,.05);display:flex;align-items:center;justify-content:center;margin:0 auto 16px;color:rgba(2,6,23,.40);">
              ${azIcon("bell")}
            </div>
            <div style="font-weight:1000;font-size:16px;color:rgba(2,6,23,.60);">No notifications yet</div>
            <div style="font-size:13px;color:rgba(2,6,23,.50);margin-top:8px;">Check back for company updates</div>
          </div>
        `}
      </div>
    `
  );
}

// ===============================
// HELP & SUPPORT - MEJORADO
// ===============================
function renderHelp(publicData, empId, user) {
  const h = publicData?.help || defaultPublicContent().help;
  const site = publicData?.site || defaultPublicContent().site;

  setPage(
    "Help & Support",
    "SunPower Warehouse Support Center",
    `
      <div class="azCard" style="border-left:4px solid rgba(29,78,216,.60);">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">
          <div style="width:48px;height:48px;border-radius:12px;background:rgba(29,78,216,.10);display:flex;align-items:center;justify-content:center;color:rgba(29,78,216,1);">
            ${azIcon("shield")}
          </div>
          <div>
            <div class="azCardTitle" style="font-size:16px;">SunPower Warehouse Support</div>
            <div class="muted" style="line-height:1.5;margin-top:4px;">
              Our dedicated support teams are here to assist you 24/7. Choose the appropriate contact below.
            </div>
          </div>
        </div>
      </div>

      <div class="azCard" style="margin-top:16px;">
        <div class="azCardTitle">Immediate Assistance Contacts</div>
        <div class="muted" style="margin-top:8px;margin-bottom:20px;">
          For urgent warehouse operations issues during your shift
        </div>

        <div style="display:flex;flex-direction:column;gap:14px;">
          <a class="btn ghost" href="tel:8009745654" style="display:flex;align-items:center;gap:14px;padding:16px;border-radius:16px;background:rgba(29,78,216,.03);">
            <div style="width:48px;height:48px;border-radius:12px;background:rgba(29,78,216,.10);display:flex;align-items:center;justify-content:center;color:rgba(29,78,216,1);">
              ${azIcon("briefcase")}
            </div>
            <div style="flex:1;text-align:left;">
              <div style="font-weight:1000;font-size:14px;">HR & Payroll Main Line</div>
              <div class="muted" style="font-size:12px;margin-top:2px;">Employee relations, payroll, benefits</div>
              <div style="font-weight:1000;color:rgba(29,78,216,1);font-size:13px;margin-top:4px;">(800)974-5654</div>
            </div>
            ${azIcon("chevR")}
          </a>

          <a class="btn ghost" href="tel:6158963252" style="display:flex;align-items:center;gap:14px;padding:16px;border-radius:16px;background:rgba(22,163,74,.03);">
            <div style="width:48px;height:48px;border-radius:12px;background:rgba(22,163,74,.10);display:flex;align-items:center;justify-content:center;color:rgba(22,163,74,1);">
              ${azIcon("shield")}
            </div>
            <div style="flex:1;text-align:left;">
              <div style="font-weight:1000;font-size:14px;">Warehouse Safety Office</div>
              <div class="muted" style="font-size:12px;margin-top:2px;">Safety incidents, PPE, emergency procedures</div>
              <div style="font-weight:1000;color:rgba(22,163,74,1);font-size:13px;margin-top:4px;">(615)896-3252</div>
            </div>
            ${azIcon("chevR")}
          </a>

          <a class="btn ghost" href="tel:5023065521" style="display:flex;align-items:center;gap:14px;padding:16px;border-radius:16px;background:rgba(245,158,11,.03);">
            <div style="width:48px;height:48px;border-radius:12px;background:rgba(245,158,11,.10);display:flex;align-items:center;justify-content:center;color:rgba(245,158,11,1);">
              ${azIcon("building")}
            </div>
            <div style="flex:1;text-align:left;">
              <div style="font-weight:1000;font-size:14px;">Operations Manager</div>
              <div class="muted" style="font-size:12px;margin-top:2px;">Shift issues, production questions, facility access</div>
              <div style="font-weight:1000;color:rgba(245,158,11,1);font-size:13px;margin-top:4px;">(502)306-5521</div>
            </div>
            ${azIcon("chevR")}
          </a>
        </div>
      </div>

      <div class="azCard" style="margin-top:16px;">
        <div class="azCardTitle">Warehouse Department Contacts</div>
        <div class="muted" style="margin-top:8px;margin-bottom:20px;">
          Direct lines to specific warehouse departments
        </div>

        <div style="display:grid;grid-template-columns:1fr;gap:12px;">
          <div style="display:flex;justify-content:space-between;align-items:center;padding:14px;background:rgba(2,6,23,.03);border-radius:12px;">
            <div>
              <div style="font-weight:1000;font-size:13px;">Material Handling</div>
              <div class="muted" style="font-size:12px;">Pallet jacks, forklifts, inventory issues</div>
            </div>
            <a href="tel:6155973254" style="color:rgba(29,78,216,1);font-weight:1000;font-size:13px;">(615)597-3254</a>
          </div>
          
          <div style="display:flex;justify-content:space-between;align-items:center;padding:14px;background:rgba(2,6,23,.03);border-radius:12px;">
            <div>
              <div style="font-weight:1000;font-size:13px;">Quality Control</div>
              <div class="muted" style="font-size:12px;">Product inspection, defect reporting</div>
            </div>
            <a href="tel:6158767612" style="color:rgba(29,78,216,1);font-weight:1000;font-size:13px;">(615)876-7612</a>
          </div>
          
          <div style="display:flex;justify-content:space-between;align-items:center;padding:14px;background:rgba(2,6,23,.03);border-radius:12px;">
            <div>
              <div style="font-weight:1000;font-size:13px;">Shipping & Receiving</div>
              <div class="muted" style="font-size:12px;">Loading docks, shipments, deliveries</div>
            </div>
            <a href="tel:6155978745" style="color:rgba(29,78,216,1);font-weight:1000;font-size:13px;">(615)597-8745</a>
          </div>
          
          <div style="display:flex;justify-content:space-between;align-items:center;padding:14px;background:rgba(2,6,23,.03);border-radius:12px;">
            <div>
              <div style="font-weight:1000;font-size:13px;">Maintenance & Facilities</div>
              <div class="muted" style="font-size:12px;">Equipment repair, building issues</div>
            </div>
            <a href="tel:6155554567" style="color:rgba(29,78,216,1);font-weight:1000;font-size:13px;">(615)555-4567</a>
          </div>
        </div>
      </div>

      <div class="azCard" style="margin-top:16px;">
        <div class="azCardTitle">📧 Email Support Channels</div>
        <div style="margin-top:16px;display:flex;flex-direction:column;gap:10px;">
          <a class="btn ghost" href="mailto:hr@sunpowerc.energy" style="display:flex;align-items:center;gap:12px;padding:14px;border-radius:16px;">
            <div style="width:40px;height:40px;border-radius:10px;background:rgba(29,78,216,.10);display:flex;align-items:center;justify-content:center;color:rgba(29,78,216,1);">
              ${azIcon("message")}
            </div>
            <div style="flex:1;text-align:left;">
              <div style="font-weight:1000;font-size:13px;">HR General Inquiries</div>
              <div class="muted" style="font-size:11px;">hr@sunpowerc.energy</div>
            </div>
          </a>

          <a class="btn ghost" href="mailto:payroll@sunpowerc.energy" style="display:flex;align-items:center;gap:12px;padding:14px;border-radius:16px;">
            <div style="width:40px;height:40px;border-radius:10px;background:rgba(22,163,74,.10);display:flex;align-items:center;justify-content:center;color:rgba(22,163,74,1);">
              ${azIcon("dollar")}
            </div>
            <div style="flex:1;text-align:left;">
              <div style="font-weight:1000;font-size:13px;">Payroll Department</div>
              <div class="muted" style="font-size:11px;">payroll@sunpowerc.energy</div>
            </div>
          </a>

          <a class="btn ghost" href="mailto:safety@sunpowerc.energy" style="display:flex;align-items:center;gap:12px;padding:14px;border-radius:16px;">
            <div style="width:40px;height:40px;border-radius:10px;background:rgba(245,158,11,.10);display:flex;align-items:center;justify-content:center;color:rgba(245,158,11,1);">
              ${azIcon("alert")}
            </div>
            <div style="flex:1;text-align:left;">
              <div style="font-weight:1000;font-size:13px;">Safety Office</div>
              <div class="muted" style="font-size:11px;">safety@sunpowerc.energy</div>
            </div>
          </a>

          <a class="btn ghost" href="mailto:facilities@sunpowerc.energy" style="display:flex;align-items:center;gap:12px;padding:14px;border-radius:16px;">
            <div style="width:40px;height:40px;border-radius:10px;background:rgba(124,58,237,.10);display:flex;align-items:center;justify-content:center;color:rgba(124,58,237,1);">
              ${azIcon("building")}
            </div>
            <div style="flex:1;text-align:left;">
              <div style="font-weight:1000;font-size:13px;">Facilities Management</div>
              <div class="muted" style="font-size:11px;">facilities@sunpowerc.energy</div>
            </div>
          </a>
        </div>
      </div>

      <div class="azCard" style="margin-top:16px;background:rgba(245,158,11,.05);border-color:rgba(245,158,11,.20);">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
          <div style="color:rgba(245,158,11,1);">${azIcon("alert")}</div>
          <div class="azCardTitle" style="color:rgba(245,158,11,1);">Urgent Support Protocol</div>
        </div>
        <div class="muted" style="line-height:1.6;">
          <strong>For immediate assistance during your shift:</strong><br><br>
          1. <strong>Notify your Supervisor</strong> directly on the floor<br>
          2. <strong>Contact Safety Office</strong> at (615) 786-9543 for any incidents<br>
          3. <strong>Call HR</strong> at (800) 876-4321 for personnel matters<br>
          4. <strong>Use the emergency call boxes</strong> located throughout the warehouse
        </div>
      </div>

      <div class="azCard" style="margin-top:16px;">
        <div class="azCardTitle">Submit Support Ticket</div>
        <div class="muted" style="line-height:1.6;margin-top:12px;">
          For non-urgent requests or detailed inquiries, submit a ticket below.
          We'll respond within 24 business hours.
        </div>
        
        <div style="margin-top:16px;">
          <label style="font-size:12px;font-weight:900;color:rgba(2,6,23,.60);text-transform:uppercase;letter-spacing:0.5px;">Department</label>
          <select id="t_cat" class="inp" style="margin-top:6px;margin-bottom:12px;">
            <option>HR & Employee Relations</option>
            <option>Payroll & Compensation</option>
            <option>Benefits Enrollment</option>
            <option>Warehouse Operations</option>
            <option>Safety & Compliance</option>
            <option>Facilities & Maintenance</option>
            <option>Schedule & Attendance</option>
            <option>Technical Support</option>
            <option>Other</option>
          </select>
          
          <label style="font-size:12px;font-weight:900;color:rgba(2,6,23,.60);text-transform:uppercase;letter-spacing:0.5px;">Priority</label>
          <select id="t_priority" class="inp" style="margin-top:6px;margin-bottom:12px;">
            <option>Normal - Response within 48h</option>
            <option>High - Response within 24h</option>
            <option>Urgent - Response within 4h</option>
          </select>
          
          <label style="font-size:12px;font-weight:900;color:rgba(2,6,23,.60);text-transform:uppercase;letter-spacing:0.5px;">Description</label>
          <textarea id="t_msg" class="inp" rows="5" placeholder="Please provide details about your issue or question..." style="margin-top:6px;"></textarea>
          
          <button class="btn primary" id="btnTicket" type="button" style="width:100%;margin-top:12px;border-radius:16px;padding:16px;">
            Submit Support Ticket
          </button>
          
          <div id="ticketMsg" class="small muted" style="margin-top:12px;text-align:center;"></div>
          
          <div class="small muted" style="margin-top:16px;padding:12px;background:rgba(2,6,23,.03);border-radius:10px;text-align:center;">
            <strong>For immediate assistance, call:</strong><br>
            HR: (800) 876-4321 • Safety: (615) 786-9543 • Operations: (502) 467-8976
          </div>
        </div>
      </div>

      <div class="azCard" style="margin-top:16px;background:rgba(2,6,23,.02);">
        <div class="azCardTitle">On-Site Support Locations</div>
        <div style="margin-top:16px;display:flex;flex-direction:column;gap:14px;">
          <div style="display:flex;gap:12px;align-items:flex-start;">
            <div style="width:36px;height:36px;border-radius:8px;background:rgba(29,78,216,.10);display:flex;align-items:center;justify-content:center;color:rgba(29,78,216,1);font-weight:1000;flex-shrink:0;">1</div>
            <div>
              <div style="font-weight:1000;font-size:13px;color:rgba(2,6,23,.85);">HR Office - Building A</div>
              <div class="muted" style="font-size:12px;margin-top:2px;">First floor, near main entrance. Hours: 7AM-6PM M-F</div>
            </div>
          </div>
          
          <div style="display:flex;gap:12px;align-items:flex-start;">
            <div style="width:36px;height:36px;border-radius:8px;background:rgba(22,163,74,.10);display:flex;align-items:center;justify-content:center;color:rgba(22,163,74,1);font-weight:1000;flex-shrink:0;">2</div>
            <div>
              <div style="font-weight:1000;font-size:13px;color:rgba(2,6,23,.85);">Safety Office - Production Floor</div>
              <div class="muted" style="font-size:12px;margin-top:2px;">Central location near Assembly Line 3. Always staffed</div>
            </div>
          </div>
          
          <div style="display:flex;gap:12px;align-items:flex-start;">
            <div style="width:36px;height:36px;border-radius:8px;background:rgba(245,158,11,.10);display:flex;align-items:center;justify-content:center;color:rgba(245,158,11,1);font-weight:1000;flex-shrink:0;">3</div>
            <div>
              <div style="font-weight:1000;font-size:13px;color:rgba(2,6,23,.85);">Operations Desk - Control Room</div>
              <div class="muted" style="font-size:12px;margin-top:2px;">24/7 operations support. Radio channel 7 for immediate contact</div>
            </div>
          </div>
        </div>
      </div>
    `
  );

  const btn = document.getElementById("btnTicket");
  if (btn && !btn.dataset.wired) {
    btn.dataset.wired = "1";
    btn.onclick = async () => {
      try {
        const msg = (document.getElementById("t_msg")?.value || "").trim();
        const cat = (document.getElementById("t_cat")?.value || "Other").trim();
        const priority = (document.getElementById("t_priority")?.value || "Normal").trim();
        const out = document.getElementById("ticketMsg");

        if (!msg) {
          if (out) out.textContent = "Please enter a description of your issue.";
          return;
        }

        if (!isFirebaseConfigured()) {
          if (out) out.textContent = "Preview mode: ticket not sent.";
          return;
        }

        await addDoc(TICKETS_COL(), {
          employeeId: empId || "",
          userUid: user?.uid || "",
          userEmail: user?.email || "",
          department: cat,
          priority: priority,
          message: msg,
          status: "open",
          createdAt: serverTimestamp()
        });

        if (out) {
          out.textContent = "✅ Support ticket submitted! We'll respond within the selected timeframe.";
          out.style.color = "rgba(22,163,74,1)";
          out.style.fontWeight = "1000";
        }
        uiToast("Support ticket submitted successfully");
        document.getElementById("t_msg").value = "";
      } catch (e) {
        uiToast(e?.message || String(e));
      }
    };
  }
}

// ===============================
// ROUTER
// ===============================
function renderRoute(userData, saveUserPatch, publicData, recordData, ctx) {
  const sb = document.getElementById("stagebar");
  if (sb) sb.innerHTML = "";

  const r = routeName();

  switch (r) {
    case "home":              return renderHome(publicData, recordData, userData);
    case "profile":           return renderProfile(userData, recordData);
    case "chat":              return renderChat(userData, ctx?.empId);
    case "schedule":          return renderMySchedule(recordData);
    case "schedule-timecard": return renderTimecard(recordData);
    case "schedule-findshifts": return renderFindShifts(recordData);
    case "progress":          return renderProgress(userData, recordData);
    case "shift":
    case "shift_selection":   return renderShiftSelection(userData, saveUserPatch);
    case "footwear":          return renderFootwear(userData, saveUserPatch, publicData);
    case "i9":                return renderI9(userData, saveUserPatch);
    case "photo_badge":       return renderPhotoBadge(userData);
    case "badge":
    case "documents":
      // Redirigir IDs antiguos a photo_badge
      location.hash = "#photo_badge";
      return;
    case "w4":                return renderW4(userData);
    case "firstday":
    case "first_day":         return renderFirstDay(userData, recordData);
    case "hours":             return renderHours(recordData);
    case "payroll":           return renderPayroll(recordData);
    case "timeoff":           return renderTimeOff(recordData);
    case "deposit":           return renderDeposit(recordData);
    case "notifications":     return renderNotifications(userData, recordData, publicData);
    case "help":              return renderHelp(publicData, ctx?.empId, ctx?.user);
    default:
      location.hash = "#home";
      return;
  }
}

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

      // ---------- ADMIN:  ----------
     
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
  
  // Guardar en employeeRecords (recordRef)
  promises.push(updateDoc(recordRef, { ...patch, updatedAt: serverTimestamp() }));
  
  // SI el patch tiene footwear, steps, O SHIFT, también guardar en users (userRef)
  if (patch.footwear || patch.steps || patch.shift) {
    const userPatch = {};
    if (patch.footwear) userPatch.footwear = patch.footwear;
    if (patch.steps) userPatch.steps = patch.steps;
    if (patch.shift) userPatch.shift = patch.shift;  // <-- MOVER AQUÍ, ANTES del push
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

  // ========== DEBUG CRÍTICO - AGREGA ESTO ==========
  console.log("📡 DATOS RECIBIDOS DE ADMIN:");
  console.log("📡 Document Path:", recordRef.path);
  console.log("📡 Employee ID del documento:", empId);
  console.log("📡 ¿Documento existe?:", snap.exists());
  console.log("📡 Todos los datos:", currentRecordData);
  console.log("📡 Profile object:", currentRecordData?.profile);
  console.log("📡 Claves del profile:", currentRecordData?.profile ? Object.keys(currentRecordData.profile) : "No profile");
  // ================================================

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
  // Reemplaza TODO el bloque de onSnapshot(userRef) con esto:

onSnapshot(userRef, async (snap) => {
  if (!snap.exists()) return;
  
  // OBTENER DATOS ACTUALES DE RECORD REF TAMBIÉN
  const recordSnap = await getDoc(recordRef);
  const recordData = recordSnap.exists() ? recordSnap.data() : {};
  
  const d = snap.data() || {};
  const base = defaultUserDoc(user);

  // USAR LOS DATOS MÁS RECIENTES: record tiene prioridad para footwear
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

 // USAR LOS DATOS MÁS RECIENTES: record tiene prioridad para shift también
const shiftSource = recordData?.shift || d?.shift || {};
const shiftMerged = {
  position: shiftSource.position || "",
  shift: shiftSource.shift || "",
  status: shiftSource.status || "",
  approved: !!shiftSource.approved,
  shiftStartDate: shiftSource.shiftStartDate || "",
  supervisor: shiftSource.supervisor || ""
};
 
  // MIGRACIÓN DE STEPS - también usar record como fuente
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
    shift: shiftMerged,  // <-- CAMBIAR AQUÍ: usar shiftMerged en lugar de d.shift
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
// ===========================================
// ✅ BLOQUEADOR CORRECTO: VERTICAL SÍ, HORIZONTAL NO
// ===========================================
(function() {
    console.log('🔧 Configurando scroll correcto...');
    
    // 1. VIEWPORT para bloquear zoom pero permitir scroll vertical
    let meta = document.querySelector('meta[name="viewport"]');
    if (meta) {
        meta.content = 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no';
    }
    
    // 2. CSS que PERMITE vertical pero BLOQUEA horizontal
    const fixCSS = `
    /* 🔒 BLOQUEAR SOLO SCROLL HORIZONTAL */
    html, body {
        overflow-x: hidden !important;
        overflow-y: auto !important;
        max-width: 100% !important;
        width: 100% !important;
    }
    
    /* 📱 CONTENEDOR PRINCIPAL */
    .content {
        overflow-y: auto !important;
        overflow-x: hidden !important;
        -webkit-overflow-scrolling: touch !important;
    }
    
    /* 🎯 ELEMENTOS QUE NO DEBEN DESBORDAR */
    .azCard, .azMoreItem, .azRow2, .azHero, .azCalWrap,
    .benefit-card, .profile-card, .chat-container {
        max-width: 100% !important;
        overflow-x: hidden !important;
    }
    
    /* 📋 MENÚ DE PROGRESS - ASEGURAR QUE SE VEA COMPLETO */
    .progress-timeline, .azMoreGrid, .benefits-grid {
        width: 100% !important;
        overflow-x: hidden !important;
        overflow-y: visible !important;
    }
    
    /* 🚫 PREVENIR ZOOM EN ELEMENTOS */
    input, textarea, select {
        font-size: 16px !important;
        max-height: 44px !important;
    }
    `;
    
    const style = document.createElement('style');
    style.textContent = fixCSS;
    document.head.appendChild(style);
    
    // 3. BLOQUEAR GESTOS DE ZOOM pero permitir scroll
    document.addEventListener('gesturestart', function(e) {
        e.preventDefault();
    }, { passive: false });
    
    document.addEventListener('touchmove', function(e) {
        // Permitir scroll vertical, bloquear horizontal excesivo
        if (Math.abs(e.touches[0].clientX - window.touchStartX) > 10) {
            e.preventDefault();
        }
    }, { passive: false });
    
    // 4. ASEGURAR QUE TODO EL CONTENIDO SEA ACCESIBLE
    function fixScrollAreas() {
        // Asegurar que las áreas de scroll funcionen
        const scrollAreas = document.querySelectorAll('.content, .chat-messages, .azMoreGrid, .progress-timeline');
        scrollAreas.forEach(area => {
            area.style.overflowY = 'auto';
            area.style.overflowX = 'hidden';
            area.style.webkitOverflowScrolling = 'touch';
        });
        
        // Asegurar que el menú de progress sea completamente visible
        const progressItems = document.querySelectorAll('.progress-item');
        progressItems.forEach(item => {
            item.style.minWidth = '0';
            item.style.width = '100%';
        });
    }
    
    // Ejecutar después de que se cargue todo
    setTimeout(fixScrollAreas, 100);
    window.addEventListener('resize', fixScrollAreas);
    
    console.log('✅ Scroll configurado: Vertical ✓ | Horizontal ✗');
})();

}
