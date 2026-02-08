import { uiSetText, uiToast, escapeHtml } from "./ui.js";
import { db, isFirebaseConfigured } from "./firebase.js";
import { onAuth } from "./auth.js";

import {
  doc, getDoc, setDoc, updateDoc, onSnapshot,
  serverTimestamp, collection, addDoc, query, where, orderBy, getDocs
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const PUBLIC_DOC = () => doc(db, "portal", "public");
const RECORD_DOC = (empId) => doc(db, "employeeRecords", empId);
const TICKETS_COL = () => collection(db, "supportTickets");
const CHAT_COL = (empId) => collection(db, "employeeRecords", empId, "chatMessages");

const EMP_ID_RANGE = { min: 23, max: 200 };
const AUTO_CREATE_ALLOWED_ID = true;

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

    shift: { position: "", shift: "", shiftStartDate: "", supervisor: "", approved: false },
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

async function isAdminUser(user) {
  if (!isFirebaseConfigured()) return false;
  try {
    const ref = doc(db, "admins", user.uid);
    const snap = await getDoc(ref);
    const d = snap.exists() ? (snap.data() || {}) : {};
    return snap.exists() && (d.role === "admin" || d.isAdmin === true);
  } catch {
    return false;
  }
}

async function ensureEmployeeId(user) {
  if (!isFirebaseConfigured()) return "PREVIEW";

  const userRef = doc(db, "users", user.uid);
  const snap = await getDoc(userRef);
  const data = snap.exists() ? snap.data() : {};

  if (data?.employeeId) return data.employeeId;

  let empId = prompt("Enter your Employee ID (example: SP023):");
  empId = normalizeEmpId(empId);

  if (!empId) throw new Error("Employee ID required.");

  const allowedRef = doc(db, "allowedEmployees", empId);
  const allowedSnap = await getDoc(allowedRef);

  let ok = false;

  if (allowedSnap.exists()) {
    ok = (allowedSnap.data()?.active === true);
  } else {
    const n = empIdToNumber(empId);
    if (n !== null && n >= EMP_ID_RANGE.min && n <= EMP_ID_RANGE.max) {
      ok = true;
      if (AUTO_CREATE_ALLOWED_ID) {
        await setDoc(allowedRef, { active: true, createdAt: serverTimestamp() }, { merge: true });
      }
    }
  }

  if (!ok) throw new Error("Invalid Employee ID. Contact HR.");

  await setDoc(userRef, { employeeId: empId, updatedAt: serverTimestamp() }, { merge: true });
  return empId;
}

function isMobile() {
  return window.matchMedia("(max-width: 920px)").matches;
}

function azIcon(name) {
  const common = `width="18" height="18" viewBox="0 0 24 24" fill="none" 
     stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`;
  const icons = {
    home: `<svg  ${common}><path d="M3 10.5 12 3l9 7.5"/><path d="M5 10v10h14V10"/></svg>`,
    schedule: `<svg  ${common}><rect x="3" y="4" width="18" height="18" rx="3"/><path d="M8 2v4M16 2v4"/><path d="M3 10h18"/></svg>`,
    pay: `<svg  ${common}><rect x="3" y="7" width="18" height="14" rx="3"/><path d="M3 11h18"/><path d="M7 15h4"/></svg>`,
    benefits: `<svg  ${common}><path d="M12 22s7-4 7-10V6l-7-3-7 3v6c0 6 7 10 7 10Z"/></svg>`,
    more: `<svg  ${common}><path d="M4 6h16M4 12h16M4 18h16"/></svg>`,
    bell: `<svg  ${common}><path d="M18 8a6 6 0 10-12 0c0 7-3 7-3 7h18s-3 0-3-7"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>`,
    chat: `<svg  ${common}><path d="M21 15a4 4 0 01-4 4H8l-5 3V7a4 4 0 014-4h10a4 4 0 014 4z"/></svg>`,
    chevR: `<svg  ${common}><path d="M9 18l6-6-6-6"/></svg>`,
    chevL: `<svg  ${common}><path d="M15 18l-6-6 6-6"/></svg>`,
    dots: `<svg  ${common}><path d="M5 12h.01M12 12h.01M19 12h.01"/></svg>`,
    search: `<svg  ${common}><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>`,
    clock: `<svg  ${common}><circle cx="12" cy="12" r="9"/><path d="M12 7v6l4 2"/></svg>`,
    check: `<svg  ${common}><path d="M20 6L9 17l-5-5"/></svg>`,
    info: `<svg  ${common}><circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/></svg>`,
    alert: `<svg  ${common}><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>`,
    sun: `<svg  ${common}><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>`,
    moon: `<svg  ${common}><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>`,
    star: `<svg  ${common}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
    briefcase: `<svg  ${common}><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16"/></svg>`,
    user: `<svg  ${common}><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
    file: `<svg  ${common}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/></svg>`,
    edit: `<svg  ${common}><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`,
    calendar: `<svg  ${common}><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>`,
    lock: `<svg  ${common}><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>`,
    unlock: `<svg  ${common}><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 019.9-1"/></svg>`,
    checkCircle: `<svg  ${common}><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
    send: `<svg  ${common}><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`,
    message: `<svg  ${common}><path d="M21 15a4 4 0 01-4 4H8l-5 3V7a4 4 0 014-4h10a4 4 0 014 4z"/></svg>`
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
      max-height: 72vh;
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
          <div class="sub">Onboarding checklist</div>
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

      <a class="azMoreItem" href="#w4">
        <div>
          <div>Tax Forms (W-4)</div>
          <div class="sub">After first week</div>
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
          <div class="sub">Setup on first day</div>
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

  document.querySelectorAll("#azTabs .az-tab").forEach(el => {
    const key = el.getAttribute("data-route");
    if (key) el.classList.toggle("active", key === tabKey);
  });

  document.querySelectorAll(".nav-item").forEach(a => {
    const rr = (a.getAttribute("data-route") || "").toLowerCase();
    a.classList.toggle("active", rr === r);
  });
}

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
function renderHome(publicData, recordData, userData) {
  const news = Array.isArray(publicData?.home?.news) ? publicData.home.news : defaultPublicContent().home.news;
  const punches = Array.isArray(recordData?.punchesToday) ? recordData.punchesToday : [];
  const punchesCount = punches.length;
  const maxHours = clamp(recordData?.maxHours?.max || 60, 1, 120);
  const scheduledMin = clamp(recordData?.maxHours?.scheduledMinutes || 0, 0, 100000);
  const remainingMin = Math.max(0, (maxHours * 60) - scheduledMin);
  const pct = clamp((scheduledMin / (maxHours * 60)) * 100, 0, 100);
  const steps = userData?.steps || [];
  const nextStep = steps.find(s => !s.done);
  const completedCount = steps.filter(s => s.done).length;
  const totalCount = steps.length;

  setPage(
    "Home",
    "Welcome to your SunPower employee portal",
    `
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
    ${azCard("My Schedule", "View your upcoming shifts and availability", "View schedule", "#schedule")}
    ${azCard("Time Off", "Request vacation and personal days", "Request time off", "#timeoff")}
  </div>

  <div class="azWide">
    <div class="azCard">
      <div class="azCardTitle">Payroll & Compensation</div>
      <div class="azCardSub">Access pay stubs, tax forms, and direct deposit information</div>
      <a class="azCardLink" href="#payroll">
        <span>View payroll</span>
        ${azIcon("chevR")}
      </a>
    </div>
  </div>

  <div class="azWide">
    <div class="azCard">
      <div class="azCardTitle">Benefits & Perks</div>
      <div class="azCardSub">Health insurance, 401(k), and employee wellness programs</div>
      <a class="azCardLink" href="#timeoff">
        <span>Explore benefits</span>
        ${azIcon("chevR")}
      </a>
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

function renderProfile(userData, recordData) {
  const profile = recordData?.profile || {};
  const fullName = userData?.fullName || profile?.fullName || "Employee";
  const empId = userData?.employeeId || "---";

  setPage(
    "My Profile",
    "Personal information and contact details",
    `
  <div class="profile-card">
    <div class="profile-avatar">${azIcon("user")}</div>
    <div class="profile-name">${escapeHtml(fullName)}</div>
    <div class="profile-id">Employee ID: ${escapeHtml(empId)}</div>
    
    <div class="profile-info">
      <div class="profile-row">
        <span class="profile-label">Full Name</span>
        <span class="profile-value">${escapeHtml(profile?.fullName || fullName)}</span>
      </div>
      <div class="profile-row">
        <span class="profile-label">Email</span>
        <span class="profile-value">${escapeHtml(userData?.email || "—")}</span>
      </div>
      <div class="profile-row">
        <span class="profile-label">Phone</span>
        <span class="profile-value">${escapeHtml(profile?.phone || "Not provided")}</span>
      </div>
      <div class="profile-row">
        <span class="profile-label">Address</span>
        <span class="profile-value">${escapeHtml(profile?.address || "Not provided")}</span>
      </div>
      <div class="profile-row">
        <span class="profile-label">Date of Birth</span>
        <span class="profile-value">${escapeHtml(profile?.dateOfBirth || "Not provided")}</span>
      </div>
      <div class="profile-row">
        <span class="profile-label">Emergency Contact</span>
        <span class="profile-value">${escapeHtml(profile?.emergencyContact || "Not provided")}</span>
      </div>
      <div class="profile-row">
        <span class="profile-label">Position</span>
        <span class="profile-value">${escapeHtml(userData?.shift?.position || "Pending assignment")}</span>
      </div>
      <div class="profile-row">
        <span class="profile-label">Shift</span>
        <span class="profile-value">${escapeHtml(userData?.shift?.shift || "Pending selection")}</span>
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

function renderChat(userData, empId) {
  setPage(
    "HR Chat",
    "Direct messaging with Human Resources",
    `
  <div class="chat-container">
    <div class="chat-messages" id="chatMessages">
      <div class="chat-message admin">
        <div>Welcome to SunPower HR Chat. How can we help you today?</div>
        <div class="chat-time">HR Team</div>
      </div>
    </div>
    <div class="chat-input-area">
      <input type="text" class="chat-input" id="chatInput" placeholder="Type your message..." maxlength="500">
      <button class="chat-send" id="chatSendBtn">${azIcon("send")}</button>
    </div>
  </div>
  
  <div class="azCard" style="margin-top:16px;">
    ${sectionHeader("Chat Hours")}
    <div class="muted" style="line-height:1.6;">
      <strong>Monday - Friday:</strong> 8:00 AM - 6:00 PM EST<br>
      <strong>Saturday:</strong> 9:00 AM - 2:00 PM EST<br>
      <strong>Sunday:</strong> Closed<br><br>
      For urgent matters outside these hours, please call HR Emergency Line: (800) 876-4321
    </div>
  </div>
`
  );

  loadChatMessages(empId);

  const sendBtn = document.getElementById("chatSendBtn");
  const input = document.getElementById("chatInput");

  const sendMessage = async () => {
    const text = input.value.trim();
    if (!text) return;

    if (!isFirebaseConfigured()) {
      addMessageToUI(text, "employee", new Date().toLocaleTimeString());
      input.value = "";
      return;
    }

    try {
      await addDoc(CHAT_COL(empId), {
        text: text,
        sender: "employee",
        timestamp: serverTimestamp(),
        read: false
      });
      addMessageToUI(text, "employee", new Date().toLocaleTimeString());
      input.value = "";
    } catch (e) {
      uiToast("Failed to send message. Please try again.");
    }
  };

  sendBtn.onclick = sendMessage;
  input.addEventListener("keypress", (e) => {
    if (e.key === "Enter") sendMessage();
  });
}

function addMessageToUI(text, sender, time) {
  const container = document.getElementById("chatMessages");
  if (!container) return;

  const msgDiv = document.createElement("div");
  msgDiv.className = `chat-message ${sender}`;
  msgDiv.innerHTML = `<div>${escapeHtml(text)}</div>
    <div class="chat-time">${escapeHtml(time)}</div>`;
  container.appendChild(msgDiv);
  container.scrollTop = container.scrollHeight;
}

async function loadChatMessages(empId) {
  if (!isFirebaseConfigured()) return;

  try {
    const q = query(CHAT_COL(empId), orderBy("timestamp", "asc"));
  } catch (e) {
    console.error("Error loading chat:", e);
  }
}

function scheduleSubtabFromRoute(r) {
  if (r === "schedule-timecard") return "timecard";
  if (r === "schedule-findshifts") return "findshifts";
  return "myschedule";
}

function scheduleTopTabsHtml(active) {
  const tab = (key, label, href) =>
    `<a href="${href}" class="${active === key ? "active" : ""}">
      ${escapeHtml(label)}
    </a>`;
  return `<div class="azTabsTop">
      ${tab("myschedule","My Schedule","#schedule")}
      ${tab("timecard","Timecard","#schedule-timecard")}
      ${tab("findshifts","Find Shifts","#schedule-findshifts")}
    </div>`;
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
  const state = { y: today.getFullYear(), m: today.getMonth(), selectedYmd: ymd(today) };

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
      <div style="font-size:48px;margin-bottom:8px;">⏱️</div>
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
      <div style="font-size:48px;margin-bottom:8px;">📋</div>
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

function renderProgress(userData, recordData) {
  const steps = Array.isArray(userData?.steps) ? userData.steps : [];
  const appt = recordData?.appointment || userData?.appointment || {};

  const displaySteps = steps;
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
    `<div class="azCard" style="background:linear-gradient(135deg,rgba(29,78,216,.08),rgba(22,163,74,.04));border-color:rgba(29,78,216,.20);padding:24px;">
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
        <div class="azCardTitle">📍 Facility Information</div>
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
            <div style="font-size:11px;color:rgba(2,6,23,.50);text-transform:uppercase;letter-spacing:0.5px;">Contact</div>
            <div style="font-weight:1000;font-size:13px;color:rgba(2,6,23,.85);margin-top:4px;">HR Onboarding</div>
          </div>
        </div>
      </div>
`
  );
}

function getStepStatus(stepId, userData) {
  const steps = userData?.steps || [];
  const stepIndex = steps.findIndex(s => s.id === stepId);
  const prevStep = steps[stepIndex - 1];

  const isPrevDone = !prevStep || prevStep.done;
  const isCurrentDone = steps.find(s => s.id === stepId)?.done;

  return { isDone: isCurrentDone, isAvailable: isPrevDone, isLocked: !isPrevDone };
}
function renderShiftSelection(userData, saveUserPatch) {
  const status = getStepStatus("shift_selection", userData);

  if (status.isDone) {
    setPage(
      "Shift Selection",
      "Completed",
      `<div class="azCard" style="text-align:center;padding:40px 24px;background:linear-gradient(135deg,rgba(22,163,74,.08),rgba(22,163,74,.02));border-color:rgba(22,163,74,.25);">
          <div style="width:80px;height:80px;border-radius:999px;background:rgba(22,163,74,.10);display:flex;align-items:center;justify-content:center;margin:0 auto 20px;color:rgba(22,163,74,1);">
            ${azIcon("checkCircle")}
          </div>
          <div style="font-weight:1000;font-size:20px;color:rgba(2,6,23,.85);margin-bottom:8px;">Shift Selected Successfully</div>
          <div style="font-size:14px;color:rgba(2,6,23,.60);line-height:1.5;margin-bottom:24px;">
            Your preferences have been saved and sent to HR for confirmation.<br>
            Final assignment will be confirmed before your first day.
          </div>
          <div class="azCard" style="text-align:left;margin-bottom:24px;background:#fff;">
            <div class="azCardTitle">Your Selection</div>
            <div style="margin-top:12px;display:grid;grid-template-columns:1fr 1fr;gap:12px;">
              <div>
                <div style="font-size:11px;color:rgba(2,6,23,.50);">Position</div>
                <div style="font-weight:1000;font-size:14px;color:rgba(2,6,23,.85);margin-top:4px;">${escapeHtml(userData?.shift?.position || 'Not selected')}</div>
              </div>
              <div>
                <div style="font-size:11px;color:rgba(2,6,23,.50);">Shift</div>
                <div style="font-weight:1000;font-size:14px;color:rgba(2,6,23,.85);margin-top:4px;">${escapeHtml(userData?.shift?.shift || 'Not selected')}</div>
              </div>
            </div>
          </div>
          <a class="btn primary" href="#footwear" style="display:block;width:100%;border-radius:16px;padding:16px;">
            Continue to Safety Footwear
          </a>
        </div>`
    );
    return;
  }

  const shift = userData?.shift || {};
  const pos = shift.position || "";
  const sh = shift.shift || "";

  setPage(
    "Shift Selection",
    "Choose your work preferences (HR will confirm)",
    `
  <div class="azCard">
    ${sectionHeader("Select Your Position")}
    <div style="display:flex;flex-direction:column;gap:12px;">
      ${posCard("assembler","Solar Panel Assembler","Assemble and test solar panels in production line","$18–$23/hr",pos)}
      ${posCard("material","Material Handler","Receive, store, and distribute materials throughout facility","$18–$22/hr",pos)}
      ${posCard("qc","Quality Control Inspector","Inspect panels for defects and ensure quality standards","$19–$24/hr",pos)}
      ${posCard("shipping","Shipping & Receiving","Prepare finished products for shipment and receive inventory","$18–$22/hr",pos)}
    </div>
  </div>

  <div class="azCard" style="margin-top:16px;">
    ${sectionHeader("Select Your Shift")}
    <div style="display:flex;flex-direction:column;gap:12px;">
      ${shiftCard("early","Early Shift","6:00 AM – 2:30 PM","Morning schedule, great for early risers",sh)}
      ${shiftCard("mid","Mid Shift","2:00 PM – 10:30 PM","Afternoon to evening, balanced schedule",sh)}
      ${shiftCard("late","Late Shift","10:00 PM – 6:30 AM","Overnight differential pay +$1.50/hr",sh)}
      ${shiftCard("weekend","Weekend Shift","Fri-Sun 12hr shifts","Work 36hrs, get paid for 40hrs",sh)}
    </div>
  </div>

  <button class="btn primary" id="btnShiftSave" type="button" style="margin-top:20px;width:100%;border-radius:16px;padding:16px;">
    Save Preferences
  </button>

  <div class="small muted" style="margin-top:12px;line-height:1.4;text-align:center;">
    Preferences are not final assignments. HR will confirm based on availability and business needs.
  </div>
`
  );

  function posCard(key, title, desc, pay, selectedKey) {
    const selected = selectedKey === key;
    return `<label class="azCard shift-card ${selected ? 'selected' : ''}" style="cursor:pointer;margin:0;${selected ? 'border-color:rgba(29,78,216,.50);background:rgba(29,78,216,.04);' : ''}">
        <div style="display:flex;gap:12px;align-items:flex-start;">
          <input type="radio" name="pos" value="${escapeHtml(key)}" ${selected ? "checked" : ""} style="margin-top:4px;"/>
          <div style="flex:1;">
            <div class="azCardTitle">${escapeHtml(title)}</div>
            <div class="azCardSub" style="margin-top:6px;">${escapeHtml(desc)}</div>
            <div style="margin-top:10px;font-weight:1000;color:rgba(22,163,74,1);font-size:13px;">${escapeHtml(pay)}</div>
          </div>
        </div>
      </label>`;
  }

  function shiftCard(key, title, hours, desc, selectedKey) {
    const selected = selectedKey === key;
    return `<label class="azCard shift-card ${selected ? 'selected' : ''}" style="cursor:pointer;margin:0;${selected ? 'border-color:rgba(29,78,216,.50);background:rgba(29,78,216,.04);' : ''}">
        <div style="display:flex;gap:12px;align-items:flex-start;">
          <input type="radio" name="shift" value="${escapeHtml(key)}" ${selected ? "checked" : ""} style="margin-top:4px;"/>
          <div style="flex:1;">
            <div class="azCardTitle">${escapeHtml(title)}</div>
            <div class="azCardSub" style="margin-top:6px;font-weight:1000;">${escapeHtml(hours)}</div>
            <div class="azCardSub" style="margin-top:4px;">${escapeHtml(desc)}</div>
          </div>
        </div>
      </label>`;
  }

  document.getElementById("btnShiftSave").onclick = async () => {
    const position = document.querySelector("input[name=pos]:checked")?.value || "";
    const shiftKey = document.querySelector("input[name=shift]:checked")?.value || "";
    if (!position || !shiftKey) return uiToast("Please select both a position and shift.");

    const steps = (userData.steps || []).map(s =>
      s.id === "shift_selection" ? ({ ...s, done: true }) : s
    );

    await saveUserPatch({ shift: { position, shift: shiftKey, approved: false }, steps, stage: "footwear" });
    triggerConfetti();
    uiToast("Preferences saved successfully!");
    location.hash = "#shift";
  };
}

function renderFootwear(userData, saveUserPatch, publicData) {
  const status = getStepStatus("footwear", userData);

  if (status.isLocked) {
    setPage(
      "Safety Footwear",
      "Locked",
      `<div class="azCard" style="text-align:center;padding:40px 24px;">
          <div style="width:64px;height:64px;border-radius:999px;background:rgba(2,6,23,.06);display:flex;align-items:center;justify-content:center;margin:0 auto 16px;color:rgba(2,6,23,.40);">
            ${azIcon("lock")}
          </div>
          <div style="font-weight:1000;font-size:16px;color:rgba(2,6,23,.85);margin-bottom:8px;">Step Locked</div>
          <div style="font-size:13px;color:rgba(2,6,23,.60);line-height:1.5;margin-bottom:20px;">
            Please complete Shift Selection before accessing this step.
          </div>
          <a class="btn primary" href="#shift" style="display:block;width:100%;border-radius:16px;padding:14px;">
            Go to Shift Selection
          </a>
        </div>`
    );
    return;
  }

  if (status.isDone) {
    setPage(
      "Safety Footwear",
      "Completed",
      `<div class="azCard" style="text-align:center;padding:40px 24px;background:linear-gradient(135deg,rgba(22,163,74,.08),rgba(22,163,74,.02));border-color:rgba(22,163,74,.25);">
          <div style="width:80px;height:80px;border-radius:999px;background:rgba(22,163,74,.10);display:flex;align-items:center;justify-content:center;margin:0 auto 20px;color:rgba(22,163,74,1);">
            ${azIcon("checkCircle")}
          </div>
          <div style="font-weight:1000;font-size:20px;color:rgba(2,6,23,.85);margin-bottom:8px;">Safety Footwear Completed</div>
          <div style="font-size:14px;color:rgba(2,6,23,.60);line-height:1.5;margin-bottom:24px;">
            You have acknowledged the safety footwear requirements.<br>
            Remember to wear your safety shoes on your first day.
          </div>
          <a class="btn primary" href="#i9" style="display:block;width:100%;border-radius:16px;padding:16px;">
            Continue to I-9 Verification
          </a>
        </div>`
    );
    return;
  }

  const fwPublic = publicData?.footwear || defaultPublicContent().footwear;
  const fw = userData?.footwear || {};
  const steps = userData?.steps || [];

  function ackRow(id, checked, text) {
    return `<label class="checkrow" style="
        display:flex;gap:12px;align-items:flex-start;
        padding:14px;border:1px solid rgba(229,234,242,.95);
        border-radius:16px;margin-top:10px;cursor:pointer;
        background:#fff;transition:all .2s;
      " onmouseover="this.style.borderColor='rgba(29,78,216,.30)';this.style.background='rgba(29,78,216,.02)'" 
       onmouseout="this.style.borderColor='rgba(229,234,242,.95)';this.style.background='#fff'">
        <input type="checkbox" id="${escapeHtml(id)}" ${checked ? "checked" : ""} style="width:20px;height:20px;margin-top:2px;accent-color:#2563eb;"/>
        <span style="font-size:13px;line-height:1.5;color:rgba(2,6,23,.80);">${escapeHtml(text)}</span>
      </label>`;
  }

  setPage(
    fwPublic.programTitle || "Safety Footwear Program",
    "Required for all warehouse and production positions",
    `
  <div class="azCard" style="background:rgba(220,38,38,.04);border-color:rgba(220,38,38,.15);">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
      <div style="color:rgba(220,38,38,1);">${azIcon("alert")}</div>
      <div class="azCardTitle" style="color:rgba(220,38,38,1);">Mandatory Requirement</div>
    </div>
    <div class="muted" style="line-height:1.6;">
      Approved safety footwear is <strong>mandatory</strong> for all operational positions. 
      You must have proper safety shoes <strong>before your first day</strong>. 
      Failure to comply will result in rescheduling your start date.
    </div>
  </div>

  <div class="azCard" style="margin-top:16px;">
    ${sectionHeader("Program Overview")}
    <div class="muted" style="line-height:1.7;">
      SunPower provides a <strong>$100 reimbursement</strong> for approved safety footwear 
      purchased through our designated vendor. This benefit is processed in your first 
      paycheck after verification of purchase and attendance.
    </div>
    
    <div style="margin-top:16px;padding:16px;background:rgba(29,78,216,.04);border-radius:12px;border:1px solid rgba(29,78,216,.15);">
      <div style="font-weight:1000;font-size:13px;color:rgba(29,78,216,1);margin-bottom:8px;">Required Specifications:</div>
      <ul class="ul" style="margin:0;padding-left:18px;">
        <li style="margin:6px 0;">Steel toe or composite toe protection</li>
        <li style="margin:6px 0;">Slip-resistant outsole</li>
        <li style="margin:6px 0;">Electrical hazard protection (EH rated)</li>
        <li style="margin:6px 0;">Ankle support (6" minimum height recommended)</li>
        <li style="margin:6px 0;">ASTM F2413-18 compliant</li>
      </ul>
    </div>
  </div>

  <div class="azCard" style="margin-top:16px;">
    ${sectionHeader("Required Acknowledgements")}
    ${ackRow("fwAck1", fw.ack1, "I understand that safety footwear is mandatory and must be worn at all times in operational areas.")}
    ${ackRow("fwAck2", fw.ack2, "I will purchase approved safety footwear before my first scheduled work day.")}
    ${ackRow("fwAck3", fw.ack3, "I understand that purchases must be made through the designated vendor to qualify for reimbursement.")}
    ${ackRow("fwAck4", fw.ack4, "I understand that reimbursement requires proof of purchase and completion of first week.")}
    ${ackRow("fwAck5", fw.ack5, "I acknowledge that failure to wear proper safety equipment may result in disciplinary action.")}

    <button class="btn primary" id="btnFootwearComplete" type="button"
      style="display:block;width:100%;text-align:center;border-radius:16px;padding:16px;margin-top:20px;">
      Complete Safety Footwear Requirement
    </button>
   
    <div class="small muted" style="margin-top:12px;line-height:1.4;text-align:center;">
      By clicking complete, you certify that you understand and agree to all requirements above.
    </div>
  </div>

  <div class="azCard" style="margin-top:16px;background:rgba(2,6,23,.03);">
    <div class="azCardTitle">🛒 Purchase Your Safety Shoes</div>
    <div class="muted" style="line-height:1.6;margin-top:8px;">
      Visit our designated safety footwear vendor to browse approved styles 
      and complete your purchase. Use your employee ID at checkout.
    </div>
    <a class="btn ghost" href="${escapeHtml(fwPublic.shopUrl)}" target="_blank" rel="noopener" style="display:block;width:100%;text-align:center;margin-top:12px;border-radius:16px;">
      Open Safety Footwear Store
    </a>
  </div>
`
  );

  const btn = document.getElementById("btnFootwearComplete");

  const syncBtn = () => {
    const a1 = document.getElementById("fwAck1")?.checked;
    const a2 = document.getElementById("fwAck2")?.checked;
    const a3 = document.getElementById("fwAck3")?.checked;
    const a4 = document.getElementById("fwAck4")?.checked;
    const a5 = document.getElementById("fwAck5")?.checked;

    const allAcks = !!(a1 && a2 && a3 && a4 && a5);

    if (btn) {
      btn.disabled = !allAcks;
      btn.style.opacity = allAcks ? "1" : ".6";
      btn.textContent = allAcks ? "Complete Safety Footwear Requirement" : "Confirm All Items Above";
    }
  };

  ["fwAck1", "fwAck2", "fwAck3", "fwAck4", "fwAck5"].forEach(x => {
    const el = document.getElementById(x);
    if (el) el.addEventListener("change", syncBtn);
  });

  syncBtn();

  if (btn) {
    btn.onclick = async () => {
      const a1 = document.getElementById("fwAck1").checked;
      const a2 = document.getElementById("fwAck2").checked;
      const a3 = document.getElementById("fwAck3").checked;
      const a4 = document.getElementById("fwAck4").checked;
      const a5 = document.getElementById("fwAck5").checked;

      if (!a1 || !a2 || !a3 || !a4 || !a5) {
        uiToast("Please confirm all requirements.");
        return;
      }

      const newSteps = (steps || []).map(s =>
        s.id === "footwear" ? ({ ...s, done: true }) : s
      );

      await saveUserPatch({
        footwear: { ack1:a1, ack2:a2, ack3:a3, ack4:a4, ack5:a5 },
        steps: newSteps,
        stage: "i9"
      });

      triggerConfetti();
      uiToast("Safety footwear requirement completed!");
      location.hash = "#footwear";
    };
  }
}

function renderI9(userData, saveUserPatch) {
  const status = getStepStatus("i9", userData);

  if (status.isLocked) {
    setPage(
      "I-9 Verification",
      "Locked",
      `<div class="azCard" style="text-align:center;padding:40px 24px;">
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
        </div>`
    );
    return;
  }

  if (status.isDone) {
    setPage(
      "I-9 Verification",
      "Completed",
      `<div class="azCard" style="text-align:center;padding:40px 24px;background:linear-gradient(135deg,rgba(22,163,74,.08),rgba(22,163,74,.02));border-color:rgba(22,163,74,.25);">
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
        </div>`
    );
    return;
  }

  setPage(
    "I-9 Verification",
    "Employment eligibility verification",
    `
  <div class="azCard">
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

  <div class="azCard" style="margin-top:16px;background:rgba(220,38,38,.04);border-color:rgba(220,38,38,.15);">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
      <div style="color:rgba(220,38,38,1);">${azIcon("alert")}</div>
      <div class="azCardTitle" style="color:rgba(220,38,38,1);">Important Notice</div>
    </div>
    <div class="muted" style="line-height:1.6;margin-bottom:16px;">
      Payroll activation is contingent upon successful I-9 completion. 
      No exceptions can be made per federal regulations 8 U.S.C. § 1324a.
    </div>
    <a class="btn primary" href="tel:911" style="display:block;width:100%;text-align:center;border-radius:16px;background:rgba(220,38,38,1);">
      Call 911 Emergency
    </a>
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

function renderPhotoBadge(userData) {
  const status = getStepStatus("photo_badge", userData);

  if (status.isLocked) {
    setPage(
      "Photo Badge",
      "Locked",
      `<div class="azCard" style="text-align:center;padding:40px 24px;">
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
        </div>`
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
      <div style="font-weight:1000;font-size:13px;color:rgba(2,6,23,.85);margin-bottom:8px;">⏳ Status: Pending First Day</div>
      <div class="muted" style="font-size:13px;">
        This step will be marked complete after you receive your badge during orientation.
      </div>
    </div>

    ${status.isDone ? `
      <div style="padding:16px;background:rgba(22,163,74,.10);border-radius:12px;border:1px solid rgba(22,163,74,.25);">
        <div style="font-weight:1000;font-size:14px;color:rgba(22,163,74,1);">✓ Badge Completed</div>
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
      Complete your W-4 form to determine the correct amount of federal income tax 
      to withhold from your paycheck. This must be completed within your first week 
      of employment.
    </div>
  </div>

  <div class="azCard">
    <div class="azCardTitle">W-4 Completion Steps</div>
    <div class="azCardSub" style="line-height:1.6;margin-top:12px;">
      <ol style="padding-left:20px;line-height:1.8;">
        <li>Access the W-4 form through your payroll portal after first day</li>
        <li>Complete personal information (name, SSN, address, filing status)</li>
        <li>Complete Steps 2-4 if applicable (multiple jobs, dependents, other adjustments)</li>
        <li>Sign and date the form</li>
        <li>Submit to HR for processing</li>
      </ol>
    </div>
  </div>

  <div class="azCard" style="margin-top:16px;background:rgba(29,78,216,.04);border-color:rgba(29,78,216,.20);">
    <div class="azCardTitle">Important Information</div>
    <div class="azCardSub" style="line-height:1.6;margin-top:12px;">
      <strong>When to Complete:</strong> During your first week<br>
      <strong>Where:</strong> Payroll portal or HR office<br>
      <strong>Questions:</strong> Contact HR at (800) 876-4321<br><br>
      For detailed instructions, visit the IRS website or speak with an HR representative.
    </div>
    <a class="btn ghost" href="https://www.irs.gov/forms-pubs/about-form-w-4" target="_blank" rel="noopener" 
      style="display:block;width:100%;text-align:center;margin-top:12px;border-radius:16px;">
      Visit IRS W-4 Information
    </a>
  </div>

  <div class="azCard" style="margin-top:16px;">
    <div class="azCardTitle">State Tax Forms</div>
    <div class="azCardSub" style="line-height:1.6;">
      Depending on your state of residence, you may need to complete additional 
      state tax withholding forms. HR will provide these during your first week 
      if required.
    </div>
  </div>
`
  );
}

function renderFirstDay(userData) {
  const status = getStepStatus("firstday", userData);

  setPage(
    "First Day Preparation",
    "Everything you need for your first day",
    `
  <div class="azCard" style="background:linear-gradient(135deg,rgba(29,78,216,.08),rgba(22,163,74,.04));border-color:rgba(29,78,216,.20);">
    <div style="text-align:center;padding:20px;">
      <div style="font-size:48px;margin-bottom:12px;">🎉</div>
      <div style="font-weight:1000;font-size:20px;color:rgba(2,6,23,.85);margin-bottom:8px;">Your First Day at SunPower</div>
      <div style="font-size:14px;color:rgba(2,6,23,.60);">
        Welcome to the team! Here's everything you need to know.
      </div>
    </div>
  </div>

  <div class="azCard" style="margin-top:16px;">
    <div class="azCardTitle">📋 What to Bring</div>
    <div style="margin-top:12px;">
      <div style="display:flex;gap:12px;margin-bottom:16px;">
        <div style="width:32px;height:32px;border-radius:999px;background:rgba(29,78,216,.10);display:flex;align-items:center;justify-content:center;color:rgba(29,78,216,1);font-weight:1000;font-size:14px;flex-shrink:0;">1</div>
        <div>
          <div style="font-weight:1000;font-size:13px;color:rgba(2,6,23,.85);">Original I-9 Documents</div>
          <div class="muted" style="font-size:12px;margin-top:4px;">Unexpired documents for employment verification</div>
        </div>
      </div>
      <div style="display:flex;gap:12px;margin-bottom:16px;">
        <div style="width:32px;height:32px;border-radius:999px;background:rgba(29,78,216,.10);display:flex;align-items:center;justify-content:center;color:rgba(29,78,216,1);font-weight:1000;font-size:14px;flex-shrink:0;">2</div>
        <div>
          <div style="font-weight:1000;font-size:13px;color:rgba(2,6,23,.85);">Safety Footwear</div>
          <div class="muted" style="font-size:12px;margin-top:4px;">ASTM F2413-18 compliant safety shoes</div>
        </div>
      </div>
      <div style="display:flex;gap:12px;margin-bottom:16px;">
        <div style="width:32px;height:32px;border-radius:999px;background:rgba(29,78,216,.10);display:flex;align-items:center;justify-content:center;color:rgba(29,78,216,1);font-weight:1000;font-size:14px;flex-shrink:0;">3</div>
        <div>
          <div style="font-weight:1000;font-size:13px;color:rgba(2,6,23,.85);">Valid ID</div>
          <div class="muted" style="font-size:12px;margin-top:4px;">Driver's license or government-issued photo ID</div>
        </div>
      </div>
      <div style="display:flex;gap:12px;">
        <div style="width:32px;height:32px;border-radius:999px;background:rgba(29,78,216,.10);display:flex;align-items:center;justify-content:center;color:rgba(29,78,216,1);font-weight:1000;font-size:14px;flex-shrink:0;">4</div>
        <div>
          <div style="font-weight:1000;font-size:13px;color:rgba(2,6,23,.85);">Banking Information</div>
          <div class="muted" style="font-size:12px;margin-top:4px;">For direct deposit setup (voided check or bank statement)</div>
        </div>
      </div>
    </div>
  </div>

  <div class="azCard" style="margin-top:16px;">
    <div class="azCardTitle">⏰ Schedule</div>
    <div class="azCardSub" style="line-height:1.6;margin-top:12px;">
      <strong>Arrival Time:</strong> 30 minutes before your scheduled shift<br>
      <strong>Location:</strong> HR Office - Main Entrance<br>
      <strong>Duration:</strong> First day includes 4-hour orientation<br><br>
      Your supervisor will meet you at the HR office and escort you to your assigned area.
    </div>
  </div>

  <div class="azCard" style="margin-top:16px;">
    <div class="azCardTitle">👔 Dress Code</div>
    <div class="azCardSub" style="line-height:1.6;margin-top:12px;">
      <strong>Required:</strong> Safety footwear, comfortable work clothes<br>
      <strong>Provided:</strong> Safety vest, hard hat (if required), safety glasses<br>
      <strong>Prohibited:</strong> Loose jewelry, open-toe shoes, shorts, tank tops
    </div>
  </div>

  <div class="azCard" style="margin-top:16px;background:rgba(22,163,74,.04);border-color:rgba(22,163,74,.20);">
    <div class="azCardTitle">✅ Day 1 Checklist</div>
    <div style="margin-top:12px;">
      <label style="display:flex;gap:10px;align-items:center;padding:10px 0;border-bottom:1px solid rgba(229,234,242,.95);">
        <input type="checkbox" style="width:18px;height:18px;accent-color:#2563eb;"/>
        <span style="font-size:13px;">Arrive 30 minutes early</span>
      </label>
      <label style="display:flex;gap:10px;align-items:center;padding:10px 0;border-bottom:1px solid rgba(229,234,242,.95);">
        <input type="checkbox" style="width:18px;height:18px;accent-color:#2563eb;"/>
        <span style="font-size:13px;">Check in at HR office</span>
      </label>
      <label style="display:flex;gap:10px;align-items:center;padding:10px 0;border-bottom:1px solid rgba(229,234,242,.95);">
        <input type="checkbox" style="width:18px;height:18px;accent-color:#2563eb;"/>
        <span style="font-size:13px;">Complete I-9 verification</span>
      </label>
      <label style="display:flex;gap:10px;align-items:center;padding:10px 0;border-bottom:1px solid rgba(229,234,242,.95);">
        <input type="checkbox" style="width:18px;height:18px;accent-color:#2563eb;"/>
        <span style="font-size:13px;">Get photo badge taken</span>
      </label>
      <label style="display:flex;gap:10px;align-items:center;padding:10px 0;border-bottom:1px solid rgba(229,234,242,.95);">
        <input type="checkbox" style="width:18px;height:18px;accent-color:#2563eb;"/>
        <span style="font-size:13px;">Safety orientation</span>
      </label>
      <label style="display:flex;gap:10px;align-items:center;padding:10px 0;">
        <input type="checkbox" style="width:18px;height:18px;accent-color:#2563eb;"/>
        <span style="font-size:13px;">Meet your supervisor and team</span>
      </label>
    </div>
  </div>

  <div class="azCard" style="margin-top:16px;">
    <div class="azCardTitle">📞 Emergency Contacts</div>
    <div class="azCardSub" style="line-height:1.8;margin-top:12px;">
      <strong>HR Emergency:</strong> (800) 876-4321<br>
      <strong>Facility Security:</strong> (615) 786-9543<br>
      <strong>Site Manager:</strong> (502) 467-8976
    </div>
  </div>

  ${!status.isDone ? `
    <button class="btn primary" id="btnFirstDayComplete" type="button" 
      style="display:block;width:100%;text-align:center;border-radius:16px;padding:16px;margin-top:20px;">
      Mark First Day Complete (After Orientation)
    </button>
  ` : `
    <div class="azCard" style="margin-top:16px;background:rgba(22,163,74,.08);border-color:rgba(22,163,74,.25);text-align:center;padding:20px;">
      <div style="font-weight:1000;font-size:16px;color:rgba(22,163,74,1);">✓ First Day Completed!</div>
      <div style="font-size:13px;color:rgba(2,6,23,.60);margin-top:8px;">Welcome to the SunPower team!</div>
    </div>
  `}
`
  );

  const btn = document.getElementById("btnFirstDayComplete");
  if (btn) {
    btn.onclick = async () => {
      const steps = (userData.steps || []).map(s =>
        s.id === "firstday" ? ({ ...s, done: true }) : s
      );
      await saveUserPatch({ steps, stage: "completed" });
      triggerConfetti();
      uiToast("Congratulations on completing your first day!");
      location.hash = "#firstday";
    };
  }
}

function renderPayroll(userData) {
  setPage(
    "Payroll",
    "Compensation and tax information",
    `
  <div class="azCard">
    <div style="text-align:center;padding:20px;">
      <div style="font-size:48px;margin-bottom:12px;">💰</div>
      <div style="font-weight:1000;font-size:20px;color:rgba(2,6,23,.85);margin-bottom:8px;">Payroll Portal</div>
      <div style="font-size:14px;color:rgba(2,6,23,.60);">
        Access your pay stubs, tax forms, and direct deposit information
      </div>
    </div>
  </div>

  <div class="azCard" style="margin-top:16px;">
    <div class="azCardTitle">Pay Schedule</div>
    <div class="azCardSub" style="line-height:1.6;margin-top:12px;">
      <strong>Frequency:</strong> Bi-weekly (every other Friday)<br>
      <strong>First Paycheck:</strong> After completion of first full pay period<br>
      <strong>Direct Deposit:</strong> Required - setup on first day<br><br>
      Pay stubs will be available in the employee portal 2 days before payday.
    </div>
  </div>

  <div class="azCard" style="margin-top:16px;">
    <div class="azCardTitle">Quick Links</div>
    <div class="azQuickGrid" style="margin-top:12px;">
      <a class="azQuick" href="#w4">
        <div class="azQuickTop">
          <div class="azQuickIcon">${azIcon("file")}</div>
        </div>
        <div>W-4 Form</div>
        <div class="azQuickSub">Tax withholding</div>
      </a>
      <a class="azQuick" href="#deposit">
        <div class="azQuickTop">
          <div class="azQuickIcon">${azIcon("briefcase")}</div>
        </div>
        <div>Direct Deposit</div>
        <div class="azQuickSub">Banking info</div>
      </a>
      <a class="azQuick" href="#hours">
        <div class="azQuickTop">
          <div class="azQuickIcon">${azIcon("clock")}</div>
        </div>
        <div>My Hours</div>
        <div class="azQuickSub">Time tracking</div>
      </a>
    </div>
  </div>

  <div class="azCard" style="margin-top:16px;background:rgba(245,158,11,.04);border-color:rgba(245,158,11,.20);">
    <div class="azCardTitle">⚠️ Important Notice</div>
    <div class="azCardSub" style="line-height:1.6;margin-top:12px;">
      Payroll access will be activated after your first day of work and 
      completion of I-9 verification. For immediate questions, contact 
      HR at (800) 876-4321.
    </div>
  </div>
`
  );
}

function renderTimeOff(userData) {
  setPage(
    "Benefits & Time Off",
    "Vacation, sick leave, and employee benefits",
    `
  <div class="benefits-grid">
    <div class="benefit-card">
      <div class="benefit-header">
        <div class="benefit-icon" style="background:rgba(22,163,74,.10);color:rgba(22,163,74,1);">🏥</div>
        <div class="benefit-title">Health Insurance</div>
      </div>
      <ul class="benefit-list">
        <li>Medical, dental, and vision coverage available</li>
        <li>Coverage begins first of month after 60 days</li>
        <li>Multiple plan options to fit your needs</li>
        <li>Dependent coverage available</li>
      </ul>
    </div>

    <div class="benefit-card">
      <div class="benefit-header">
        <div class="benefit-icon" style="background:rgba(29,78,216,.10);color:rgba(29,78,216,1);">🏖️</div>
        <div class="benefit-title">Paid Time Off</div>
      </div>
      <ul class="benefit-list">
        <li>Vacation: 10 days/year (prorated first year)</li>
        <li>Sick leave: 6 days/year</li>
        <li>Personal days: 2 days/year</li>
        <li>Company holidays: 10 days/year</li>
      </ul>
    </div>

    <div class="benefit-card">
      <div class="benefit-header">
        <div class="benefit-icon" style="background:rgba(245,158,11,.10);color:rgba(245,158,11,1);">💰</div>
        <div class="benefit-title">Retirement</div>
      </div>
      <ul class="benefit-list">
        <li>401(k) plan with company match</li>
        <li>Match: 100% of first 3%, 50% of next 2%</li>
        <li>Immediate vesting of company match</li>
        <li>Eligible after 90 days of employment</li>
      </ul>
    </div>

    <div class="benefit-card">
      <div class="benefit-header">
        <div class="benefit-icon" style="background:rgba(139,92,246,.10);color:rgba(139,92,246,1);">🎯</div>
        <div class="benefit-title">Additional Perks</div>
      </div>
      <ul class="benefit-list">
        <li>Employee discount program</li>
        <li>Wellness program and gym discounts</li>
        <li>Employee assistance program (EAP)</li>
        <li>Referral bonuses for new hires</li>
      </ul>
    </div>
  </div>

  <div class="azCard" style="margin-top:16px;">
    <div class="azCardTitle">Request Time Off</div>
    <div class="azCardSub" style="line-height:1.6;margin-top:12px;">
      Time off requests can be submitted through your supervisor after 
      completing your first 90 days. For urgent time off needs during 
      onboarding, contact HR directly at (800) 876-4321.
    </div>
    <a class="btn ghost" href="#help" style="display:block;width:100%;text-align:center;margin-top:12px;border-radius:16px;">
      Contact HR About Time Off
    </a>
  </div>
`
  );
}

function renderHours(userData) {
  setPage(
    "My Hours",
    "Weekly time summary",
    `
  <div class="azCard">
    <div style="text-align:center;padding:20px;">
      <div style="font-size:48px;margin-bottom:12px;">⏱️</div>
      <div style="font-weight:1000;font-size:20px;color:rgba(2,6,23,.85);margin-bottom:8px;">Hours Tracking</div>
      <div style="font-size:14px;color:rgba(2,6,23,.60);">
        Your weekly hours summary will appear here after your first day
      </div>
    </div>
  </div>

  <div class="azCard" style="margin-top:16px;">
    <div class="azCardTitle">Current Week</div>
    <div style="margin-top:12px;">
      <div class="azPunchRow">
        <div class="azPunchLeft">
          <div class="azPunchType">Monday</div>
          <div class="azPunchTime">--</div>
        </div>
        <div class="azPunchTime">0.00 hrs</div>
      </div>
      <div class="azPunchRow">
        <div class="azPunchLeft">
          <div class="azPunchType">Tuesday</div>
          <div class="azPunchTime">--</div>
        </div>
        <div class="azPunchTime">0.00 hrs</div>
      </div>
      <div class="azPunchRow">
        <div class="azPunchLeft">
          <div class="azPunchType">Wednesday</div>
          <div class="azPunchTime">--</div>
        </div>
        <div class="azPunchTime">0.00 hrs</div>
      </div>
      <div class="azPunchRow">
        <div class="azPunchLeft">
          <div class="azPunchType">Thursday</div>
          <div class="azPunchTime">--</div>
        </div>
        <div class="azPunchTime">0.00 hrs</div>
      </div>
      <div class="azPunchRow">
        <div class="azPunchLeft">
          <div class="azPunchType">Friday</div>
          <div class="azPunchTime">--</div>
        </div>
        <div class="azPunchTime">0.00 hrs</div>
      </div>
      <div class="azPunchRow">
        <div class="azPunchLeft">
          <div class="azPunchType">Saturday</div>
          <div class="azPunchTime">--</div>
        </div>
        <div class="azPunchTime">0.00 hrs</div>
      </div>
      <div class="azPunchRow">
        <div class="azPunchLeft">
          <div class="azPunchType">Sunday</div>
          <div class="azPunchTime">--</div>
        </div>
        <div class="azPunchTime">0.00 hrs</div>
      </div>
    </div>
    <div style="margin-top:16px;padding-top:16px;border-top:2px solid rgba(229,234,242,.95);display:flex;justify-content:space-between;align-items:center;">
      <div style="font-weight:1000;font-size:14px;">Weekly Total</div>
      <div style="font-weight:1000;font-size:18px;color:rgba(29,78,216,1);">0.00 hrs</div>
    </div>
  </div>

  <div class="azCard" style="margin-top:16px;background:rgba(245,158,11,.04);border-color:rgba(245,158,11,.20);">
    <div class="azCardTitle">⏳ Not Started Yet</div>
    <div class="azCardSub" style="line-height:1.6;margin-top:12px;">
      Your hours will be tracked starting from your first day of employment. 
      Make sure to clock in and out using the time tracking system provided 
      by your supervisor.
    </div>
  </div>
`
  );
}

function renderDeposit(userData) {
  setPage(
    "Direct Deposit",
    "Setup your payroll direct deposit",
    `
  <div class="azCard">
    <div style="text-align:center;padding:20px;">
      <div style="font-size:48px;margin-bottom:12px;">🏦</div>
      <div style="font-weight:1000;font-size:20px;color:rgba(2,6,23,.85);margin-bottom:8px;">Direct Deposit Setup</div>
      <div style="font-size:14px;color:rgba(2,6,23,.60);">
        Get your paycheck deposited directly to your bank account
      </div>
    </div>
  </div>

  <div class="azCard" style="margin-top:16px;">
    <div class="azCardTitle">Required Information</div>
    <div class="azCardSub" style="line-height:1.8;margin-top:12px;">
      Bring the following to your first day orientation:<br><br>
      <strong>1.</strong> Voided check, OR<br>
      <strong>2.</strong> Bank statement with account details, OR<br>
      <strong>3.</strong> Bank routing number and account number<br><br>
      <strong>Account Type:</strong> Checking or Savings<br>
      <strong>Bank Name:</strong> Full bank name<br>
      <strong>Routing Number:</strong> 9-digit number<br>
      <strong>Account Number:</strong> Your account number
    </div>
  </div>

  <div class="azCard" style="margin-top:16px;background:rgba(22,163,74,.04);border-color:rgba(22,163,74,.20);">
    <div class="azCardTitle">✅ Benefits of Direct Deposit</div>
    <div class="azCardSub" style="line-height:1.6;margin-top:12px;">
      • Get paid faster - no waiting for checks<br>
      • No risk of lost or stolen checks<br>
      • Automatic deposit even when you're away<br>
      • Environmentally friendly - less paper<br>
      • Secure and reliable payment method
    </div>
  </div>

  <div class="azCard" style="margin-top:16px;">
    <div class="azCardTitle">When to Setup</div>
    <div class="azCardSub" style="line-height:1.6;margin-top:12px;">
      Direct deposit setup is completed during your first day orientation. 
      HR will assist you in entering your banking information securely into 
      the payroll system. Your first paycheck will be a paper check, and 
      direct deposit will begin with your second paycheck.
    </div>
  </div>
`
  );
}

function renderNotifications(userData, publicData) {
  const globalNotifs = publicData?.globalNotifications || [];
  const userNotifs = userData?.notifications || [];
  const allNotifs = [...globalNotifs, ...userNotifs];

  setPage(
    "Notifications",
    "Company updates and announcements",
    `
  ${allNotifs.length === 0 ? `
    <div class="azCard" style="text-align:center;padding:40px 24px;">
      <div style="font-size:48px;margin-bottom:16px;">🔔</div>
      <div style="font-weight:1000;font-size:16px;color:rgba(2,6,23,.85);margin-bottom:8px;">No Notifications Yet</div>
      <div style="font-size:13px;color:rgba(2,6,23,.60);line-height:1.5;">
        Important company updates and announcements will appear here.<br>
        Check back regularly for new information.
      </div>
    </div>
  ` : `
    <div style="display:flex;flex-direction:column;gap:12px;">
      ${allNotifs.map(n => `
        <div class="azCard" style="${n.important ? 'border-color:rgba(220,38,38,.30);background:rgba(220,38,38,.02);' : ''}">
          <div style="display:flex;gap:12px;align-items:flex-start;">
            <div style="width:40px;height:40px;border-radius:999px;background:${n.important ? 'rgba(220,38,38,.10)' : 'rgba(29,78,216,.10)'};display:flex;align-items:center;justify-content:center;color:${n.important ? 'rgba(220,38,38,1)' : 'rgba(29,78,216,1)'};font-size:20px;flex-shrink:0;">
              ${n.important ? '🔴' : '📢'}
            </div>
            <div style="flex:1;">
              <div style="font-weight:1000;font-size:14px;color:rgba(2,6,23,.85);">${escapeHtml(n.title)}</div>
              <div class="muted" style="font-size:12px;margin-top:4px;">${escapeHtml(n.date || new Date().toLocaleDateString())}</div>
              <div style="font-size:13px;color:rgba(2,6,23,.70);line-height:1.5;margin-top:8px;">${escapeHtml(n.body)}</div>
            </div>
          </div>
        </div>
      `).join('')}
    </div>
  `}

  <div class="azCard" style="margin-top:16px;">
    <div class="azCardTitle">Notification Settings</div>
    <div class="azCardSub" style="line-height:1.6;margin-top:12px;">
      You will receive notifications for:<br>
      • Schedule changes<br>
      • Important company announcements<br>
      • Benefits enrollment deadlines<br>
      • Payroll reminders<br><br>
      To update your notification preferences, contact HR.
    </div>
  </div>
`
  );
}

function renderHelp(publicData) {
  const help = publicData?.help || defaultPublicContent().help;
  const site = publicData?.site || defaultPublicContent().site;

  setPage(
    "Help & Support",
    "Contact information and resources",
    `
  <div class="azCard" style="background:rgba(29,78,216,.04);border-color:rgba(29,78,216,.20);">
    <div style="text-align:center;padding:20px;">
      <div style="font-size:48px;margin-bottom:12px;">🆘</div>
      <div style="font-weight:1000;font-size:20px;color:rgba(2,6,23,.85);margin-bottom:8px;">We're Here to Help</div>
      <div style="font-size:14px;color:rgba(2,6,23,.60);line-height:1.5;">
        ${escapeHtml(help.text)}
      </div>
    </div>
  </div>

  <div class="azCard" style="margin-top:16px;">
    <div class="azCardTitle">Contact HR</div>
    <div style="margin-top:12px;display:flex;flex-direction:column;gap:12px;">
      <a href="${telLink(help.phone)}" class="azMoreItem" style="text-decoration:none;color:inherit;">
        <div>
          <div style="font-weight:1000;">📞 Phone</div>
          <div class="muted" style="font-size:12px;margin-top:4px;">${escapeHtml(help.phone)}</div>
        </div>
        <div class="azMoreArrow">${azIcon("chevR")}</div>
      </a>
      <a href="mailto:${escapeHtml(help.email)}" class="azMoreItem" style="text-decoration:none;color:inherit;">
        <div>
          <div style="font-weight:1000;">✉️ Email</div>
          <div class="muted" style="font-size:12px;margin-top:4px;">${escapeHtml(help.email)}</div>
        </div>
        <div class="azMoreArrow">${azIcon("chevR")}</div>
      </a>
      <a href="#chat" class="azMoreItem" style="text-decoration:none;color:inherit;">
        <div>
          <div style="font-weight:1000;">💬 Live Chat</div>
          <div class="muted" style="font-size:12px;margin-top:4px;">Message HR directly</div>
        </div>
        <div class="azMoreArrow">${azIcon("chevR")}</div>
      </a>
    </div>
  </div>

  <div class="azCard" style="margin-top:16px;">
    <div class="azCardTitle">Site Contacts</div>
    <div style="margin-top:12px;display:grid;grid-template-columns:1fr;gap:12px;">
      <div style="padding:16px;background:rgba(2,6,23,.03);border-radius:12px;">
        <div style="font-weight:1000;font-size:13px;color:rgba(2,6,23,.85);">Site Manager</div>
        <div class="muted" style="font-size:12px;margin-top:4px;">${escapeHtml(site.managerPhone)}</div>
      </div>
      <div style="padding:16px;background:rgba(2,6,23,.03);border-radius:12px;">
        <div style="font-weight:1000;font-size:13px;color:rgba(2,6,23,.85);">Safety Officer</div>
        <div class="muted" style="font-size:12px;margin-top:4px;">${escapeHtml(site.safetyPhone)}</div>
      </div>
      <div style="padding:16px;background:rgba(2,6,23,.03);border-radius:12px;">
        <div style="font-weight:1000;font-size:13px;color:rgba(2,6,23,.85);">Supervisor</div>
        <div class="muted" style="font-size:12px;margin-top:4px;">${escapeHtml(site.supervisorPhone)}</div>
      </div>
    </div>
  </div>

  <div class="azCard" style="margin-top:16px;background:rgba(220,38,38,.04);border-color:rgba(220,38,38,.15);">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
      <div style="color:rgba(220,38,38,1);">${azIcon("alert")}</div>
      <div class="azCardTitle" style="color:rgba(220,38,38,1);">Emergency</div>
    </div>
    <div class="muted" style="line-height:1.6;margin-bottom:16px;">
      For life-threatening emergencies, call 911 immediately.<br>
      For facility emergencies, contact Security at ${escapeHtml(site.safetyPhone)}
    </div>
    <a class="btn primary" href="tel:911" style="display:block;width:100%;text-align:center;border-radius:16px;background:rgba(220,38,38,1);">
      Call 911 Emergency
    </a>
  </div>
`
  );
}

// Main init function
export async function initEmployeePortal() {
  ensureChromeOnce();

  let user = null;
  let empId = null;
  let publicData = defaultPublicContent();
  let recordData = {};
  let userData = {};
  let unsubPublic = null;
  let unsubRecord = null;
  let unsubUser = null;

  const saveUserPatch = async (patch) => {
    if (!isFirebaseConfigured() || !user) {
      uiToast("Not connected. Changes saved locally only.");
      return;
    }
    try {
      const ref = doc(db, "users", user.uid);
      await setDoc(ref, { ...patch, updatedAt: serverTimestamp() }, { merge: true });
    } catch (e) {
      uiToast("Error saving changes. Please try again.");
      throw e;
    }
  };

  const renderRoute = () => {
    const r = routeName();
    setActiveTabsAndSidebar();

    switch (r) {
      case "home":
        renderHome(publicData, recordData, userData);
        break;
      case "profile":
        renderProfile(userData, recordData);
        break;
      case "schedule":
        renderMySchedule(recordData);
        break;
      case "schedule-timecard":
        renderTimecard(recordData);
        break;
      case "schedule-findshifts":
        renderFindShifts(recordData);
        break;
      case "payroll":
        renderPayroll(userData);
        break;
      case "timeoff":
      case "benefits":
        renderTimeOff(userData);
        break;
      case "hours":
        renderHours(userData);
        break;
      case "deposit":
        renderDeposit(userData);
        break;
      case "progress":
        renderProgress(userData, recordData);
        break;
      case "shift":
        renderShiftSelection(userData, saveUserPatch);
        break;
      case "footwear":
        renderFootwear(userData, saveUserPatch, publicData);
        break;
      case "i9":
        renderI9(userData, saveUserPatch);
        break;
      case "photo_badge":
        renderPhotoBadge(userData);
        break;
      case "firstday":
        renderFirstDay(userData);
        break;
      case "w4":
        renderW4(userData);
        break;
      case "chat":
        renderChat(userData, empId);
        break;
      case "notifications":
        renderNotifications(userData, publicData);
        break;
      case "help":
        renderHelp(publicData);
        break;
      default:
        renderHome(publicData, recordData, userData);
    }
  };

  onAuth(async (u) => {
    user = u;

    if (!user) {
      location.href = "/index.html";
      return;
    }

    try {
      await ensureUserDocExists(user);
      empId = await ensureEmployeeId(user);
    } catch (e) {
      uiToast(e.message || "Error loading employee data");
      console.error(e);
    }

    if (isFirebaseConfigured()) {
      unsubPublic = onSnapshot(PUBLIC_DOC(), (snap) => {
        publicData = snap.exists() ? snap.data() : defaultPublicContent();
        renderRoute();
      });

      if (empId && empId !== "PREVIEW") {
        unsubRecord = onSnapshot(RECORD_DOC(empId), (snap) => {
          recordData = snap.exists() ? snap.data() : {};
          renderRoute();
        });
      }

      unsubUser = onSnapshot(doc(db, "users", user.uid), (snap) => {
        userData = snap.exists() ? snap.data() : {};
        renderRoute();
      });
    }

    renderRoute();
  });

  window.addEventListener("hashchange", renderRoute);
}
