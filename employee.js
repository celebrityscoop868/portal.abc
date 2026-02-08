import { uiSetText, uiToast, escapeHtml, uiGo } from "./ui.js";
import { db, isFirebaseConfigured } from "./firebase.js";
import { onAuth, signOutNow } from "./auth.js";

import {
  doc, getDoc, setDoc, updateDoc, onSnapshot,
  serverTimestamp, collection, addDoc, query, orderBy, getDocs
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

// Helper functions
function routeName() {
  return (location.hash || "#home").replace("#", "").trim().toLowerCase();
}

function setPage(title, sub, html) {
  uiSetText(document.getElementById("pageTitle"), title);
  uiSetText(document.getElementById("pageSub"), sub);
  document.getElementById("pageBody").innerHTML = html;
}

function safe(v, fallback = "—") {
  return (v === undefined || v === null || v === "") ? fallback : v;
}

// Default data
function defaultUserDoc(user) {
  return {
    email: user?.email || "",
    fullName: user?.displayName || "",
    role: "employee",
    status: "active",
    stage: "shift_selection",
    steps: [
      { id: "shift_selection", label: "Shift Selection", done: false },
      { id: "footwear", label: "Safety Footwear", done: false },
      { id: "i9", label: "I-9 Verification", done: false },
      { id: "photo_badge", label: "Photo Badge", done: false },
      { id: "firstday", label: "First Day", done: false }
    ],
    shift: { position: "", shift: "", approved: false },
    footwear: {},
    i9: {},
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };
}

// Render functions
function renderHome(userData) {
  const steps = userData?.steps || [];
  const completed = steps.filter(s => s.done).length;
  const total = steps.length;
  const nextStep = steps.find(s => !s.done);

  setPage("Home", "Welcome to SunPower", `
    <div class="azCard" style="background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:white;">
      <div style="display:flex;align-items:center;gap:16px;">
        <div style="font-size:48px;">☀️</div>
        <div>
          <div style="font-size:20px;font-weight:700;">Welcome back!</div>
          <div style="opacity:0.9;">${escapeHtml(userData?.fullName || 'Employee')}</div>
        </div>
      </div>
    </div>

    ${nextStep ? `
    <div class="azCard">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">
        <div style="width:48px;height:48px;border-radius:50%;background:#eff6ff;display:flex;align-items:center;justify-content:center;font-size:24px;">🎯</div>
        <div>
          <div class="azCardTitle">Complete Your Onboarding</div>
          <div class="azCardSub">${completed} of ${total} steps done</div>
        </div>
      </div>
      <div style="height:8px;background:#e2e8f0;border-radius:4px;overflow:hidden;margin-bottom:16px;">
        <div style="height:100%;width:${(completed/total)*100}%;background:var(--primary);border-radius:4px;"></div>
      </div>
      <a href="#${nextStep.id === 'shift_selection' ? 'shift' : nextStep.id}" class="btn primary" style="width:100%;">
        Continue: ${escapeHtml(nextStep.label)}
      </a>
    </div>
    ` : `
    <div class="azCard" style="background:#f0fdf4;border-color:#86efac;">
      <div style="display:flex;align-items:center;gap:12px;">
        <div style="width:48px;height:48px;border-radius:50%;background:#dcfce7;display:flex;align-items:center;justify-content:center;font-size:24px;">✅</div>
        <div>
          <div class="azCardTitle" style="color:#166534;">Onboarding Complete!</div>
          <div class="azCardSub">You're all set for your first day</div>
        </div>
      </div>
    </div>
    `}

    <div class="azRow2">
      <div class="azCard">
        <div class="azCardTitle">📅 My Schedule</div>
        <div class="azCardSub">View your upcoming shifts</div>
        <a href="#schedule" class="azCardLink">View schedule →</a>
      </div>
      <div class="azCard">
        <div class="azCardTitle">💰 Payroll</div>
        <div class="azCardSub">Access pay stubs & tax forms</div>
        <a href="#payroll" class="azCardLink">View payroll →</a>
      </div>
    </div>

    <div class="azCard">
      <div class="azCardTitle">🏖️ Benefits</div>
      <div class="azCardSub">Health insurance, 401(k), time off</div>
      <a href="#benefits" class="azCardLink">Explore benefits →</a>
    </div>
  `);
}

function renderProgress(userData) {
  const steps = userData?.steps || [];
  const completed = steps.filter(s => s.done).length;
  
  setPage("Progress", "Your onboarding journey", `
    <div class="azCard" style="text-align:center;">
      <div style="font-size:48px;margin-bottom:16px;">🎯</div>
      <div style="font-size:32px;font-weight:700;color:var(--primary);">${Math.round((completed/steps.length)*100)}%</div>
      <div class="azCardSub">Complete</div>
      <div style="height:12px;background:#e2e8f0;border-radius:6px;overflow:hidden;margin-top:16px;">
        <div style="height:100%;width:${(completed/steps.length)*100}%;background:linear-gradient(90deg,var(--primary),var(--success));border-radius:6px;"></div>
      </div>
    </div>

    <div class="azCard">
      <div class="azCardTitle">Onboarding Steps</div>
      <div class="progress-timeline" style="margin-top:16px;">
        ${steps.map((s, i) => {
          const isDone = s.done;
          const isCurrent = !isDone && (i === 0 || steps[i-1].done);
          const isLocked = !isDone && !isCurrent;
          
          return `
          <div class="progress-item ${isDone ? 'completed' : isCurrent ? 'current' : 'locked'}">
            <div class="progress-item-icon">${isDone ? '✓' : isCurrent ? '●' : '🔒'}</div>
            <div class="progress-item-card">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
                <div style="font-weight:600;">${escapeHtml(s.label)}</div>
                <span style="font-size:11px;padding:4px 10px;border-radius:20px;${
                  isDone ? 'background:#dcfce7;color:#166534;' :
                  isCurrent ? 'background:#dbeafe;color:#1e40af;' :
                  'background:#f1f5f9;color:#64748b;'
                }">${isDone ? 'Done' : isCurrent ? 'In Progress' : 'Locked'}</span>
              </div>
              ${isCurrent ? `<a href="#${s.id === 'shift_selection' ? 'shift' : s.id}" class="btn sm primary" style="margin-top:8px;">Continue</a>` : ''}
            </div>
          </div>
          `;
        }).join('')}
      </div>
    </div>
  `);
}

function renderShift(userData, savePatch) {
  const isDone = userData?.steps?.find(s => s.id === 'shift_selection')?.done;
  
  if (isDone) {
    setPage("Shift Selection", "Completed", `
      <div class="azCard" style="text-align:center;background:#f0fdf4;border-color:#86efac;">
        <div style="font-size:64px;margin-bottom:16px;">✅</div>
        <div style="font-size:20px;font-weight:700;color:#166534;margin-bottom:8px;">Shift Selected!</div>
        <div class="azCardSub">Your preferences have been saved</div>
        <div style="margin-top:24px;padding:16px;background:white;border-radius:12px;">
          <div style="font-weight:600;">Position:</div>
          <div class="azCardSub">${escapeHtml(userData?.shift?.position || 'Not selected')}</div>
          <div style="font-weight:600;margin-top:12px;">Shift:</div>
          <div class="azCardSub">${escapeHtml(userData?.shift?.shift || 'Not selected')}</div>
        </div>
        <a href="#footwear" class="btn primary" style="width:100%;margin-top:16px;">Continue to Safety Footwear</a>
      </div>
    `);
    return;
  }

  setPage("Shift Selection", "Choose your preferences", `
    <div class="azCard">
      <div class="azCardTitle">Select Position</div>
      <div style="display:flex;flex-direction:column;gap:12px;margin-top:12px;">
        <label class="shift-card azCard" style="cursor:pointer;margin:0;">
          <input type="radio" name="position" value="assembler" style="margin-right:12px;">
          <div style="display:inline-block;">
            <div style="font-weight:600;">Solar Panel Assembler</div>
            <div style="font-size:13px;color:var(--gray);">Assemble and test solar panels</div>
            <div style="color:var(--success);font-weight:600;margin-top:4px;">$18-23/hr</div>
          </div>
        </label>
        <label class="shift-card azCard" style="cursor:pointer;margin:0;">
          <input type="radio" name="position" value="material" style="margin-right:12px;">
          <div style="display:inline-block;">
            <div style="font-weight:600;">Material Handler</div>
            <div style="font-size:13px;color:var(--gray);">Receive and distribute materials</div>
            <div style="color:var(--success);font-weight:600;margin-top:4px;">$18-22/hr</div>
          </div>
        </label>
        <label class="shift-card azCard" style="cursor:pointer;margin:0;">
          <input type="radio" name="position" value="qc" style="margin-right:12px;">
          <div style="display:inline-block;">
            <div style="font-weight:600;">Quality Control</div>
            <div style="font-size:13px;color:var(--gray);">Inspect panels for defects</div>
            <div style="color:var(--success);font-weight:600;margin-top:4px;">$19-24/hr</div>
          </div>
        </label>
      </div>
    </div>

    <div class="azCard">
      <div class="azCardTitle">Select Shift</div>
      <div style="display:flex;flex-direction:column;gap:12px;margin-top:12px;">
        <label class="shift-card azCard" style="cursor:pointer;margin:0;">
          <input type="radio" name="shift" value="early" style="margin-right:12px;">
          <div style="display:inline-block;">
            <div style="font-weight:600;">Early Shift</div>
            <div style="font-size:13px;color:var(--gray);">6:00 AM - 2:30 PM</div>
          </div>
        </label>
        <label class="shift-card azCard" style="cursor:pointer;margin:0;">
          <input type="radio" name="shift" value="mid" style="margin-right:12px;">
          <div style="display:inline-block;">
            <div style="font-weight:600;">Mid Shift</div>
            <div style="font-size:13px;color:var(--gray);">2:00 PM - 10:30 PM</div>
          </div>
        </label>
        <label class="shift-card azCard" style="cursor:pointer;margin:0;">
          <input type="radio" name="shift" value="late" style="margin-right:12px;">
          <div style="display:inline-block;">
            <div style="font-weight:600;">Late Shift (+$1.50/hr)</div>
            <div style="font-size:13px;color:var(--gray);">10:00 PM - 6:30 AM</div>
          </div>
        </label>
      </div>
    </div>

    <button class="btn primary" id="btnSaveShift" style="width:100%;">Save Preferences</button>
  `);

  document.getElementById('btnSaveShift').addEventListener('click', async () => {
    const position = document.querySelector('input[name="position"]:checked')?.value;
    const shift = document.querySelector('input[name="shift"]:checked')?.value;
    
    if (!position || !shift) {
      uiToast('Please select both position and shift');
      return;
    }

    const newSteps = userData.steps.map(s => 
      s.id === 'shift_selection' ? { ...s, done: true } : s
    );

    await savePatch({
      shift: { position, shift, approved: false },
      steps: newSteps,
      stage: 'footwear'
    });

    uiToast('Preferences saved!');
    uiGo('shift');
  });
}

function renderFootwear(userData, savePatch) {
  const stepStatus = userData?.steps?.find(s => s.id === 'footwear');
  const prevDone = userData?.steps?.find(s => s.id === 'shift_selection')?.done;
  
  if (!prevDone) {
    setPage("Safety Footwear", "Locked", `
      <div class="azCard" style="text-align:center;">
        <div style="font-size:48px;margin-bottom:16px;">🔒</div>
        <div style="font-size:18px;font-weight:600;margin-bottom:8px;">Complete Previous Step</div>
        <div class="azCardSub">Please complete Shift Selection first</div>
        <a href="#shift" class="btn primary" style="width:100%;margin-top:16px;">Go to Shift Selection</a>
      </div>
    `);
    return;
  }

  if (stepStatus?.done) {
    setPage("Safety Footwear", "Completed", `
      <div class="azCard" style="text-align:center;background:#f0fdf4;border-color:#86efac;">
        <div style="font-size:64px;margin-bottom:16px;">✅</div>
        <div style="font-size:20px;font-weight:700;color:#166534;">Completed!</div>
        <div class="azCardSub">You have acknowledged the safety requirements</div>
        <a href="#i9" class="btn primary" style="width:100%;margin-top:16px;">Continue to I-9</a>
      </div>
    `);
    return;
  }

  setPage("Safety Footwear", "Required for all positions", `
    <div class="azCard" style="background:#fef2f2;border-color:#fecaca;">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
        <span style="font-size:24px;">⚠️</span>
        <div class="azCardTitle" style="color:#991b1b;">Mandatory Requirement</div>
      </div>
      <div style="font-size:14px;color:#7f1d1d;line-height:1.6;">
        Approved safety footwear is <strong>mandatory</strong> for all operational positions. 
        You must have proper safety shoes before your first day.
      </div>
    </div>

    <div class="azCard">
      <div class="azCardTitle">Program Overview</div>
      <div class="azCardSub" style="line-height:1.6;margin-top:12px;">
        SunPower provides a <strong>$100 reimbursement</strong> for approved safety footwear 
        purchased through our designated vendor.
      </div>
      <div style="margin-top:16px;padding:16px;background:#eff6ff;border-radius:12px;">
        <div style="font-weight:600;color:#1e40af;margin-bottom:8px;">Required:</div>
        <ul style="margin:0;padding-left:20px;color:#1e3a8a;">
          <li>Steel or composite toe protection</li>
          <li>Slip-resistant outsole</li>
          <li>Electrical hazard protection</li>
          <li>ASTM F2413-18 compliant</li>
        </ul>
      </div>
    </div>

    <div class="azCard">
      <div class="azCardTitle">Acknowledgements</div>
      <label class="checkrow" style="margin-top:12px;">
        <input type="checkbox" id="ack1">
        <span>I understand safety footwear is mandatory at all times in operational areas</span>
      </label>
      <label class="checkrow" style="margin-top:8px;">
        <input type="checkbox" id="ack2">
        <span>I will purchase approved safety footwear before my first day</span>
      </label>
      <label class="checkrow" style="margin-top:8px;">
        <input type="checkbox" id="ack3">
        <span>I understand reimbursement requires proof of purchase</span>
      </label>
      <button class="btn primary" id="btnCompleteFootwear" style="width:100%;margin-top:16px;" disabled>
        Complete Requirement
      </button>
    </div>

    <div class="azCard">
      <div class="azCardTitle">Purchase Safety Shoes</div>
      <a href="https://shop.sunpowerc.energy" target="_blank" class="btn ghost" style="width:100%;margin-top:12px;">
        Open Safety Footwear Store →
      </a>
    </div>
  `);

  const checkboxes = ['ack1', 'ack2', 'ack3'];
  const btn = document.getElementById('btnCompleteFootwear');
  
  const checkAll = () => {
    const allChecked = checkboxes.every(id => document.getElementById(id)?.checked);
    btn.disabled = !allChecked;
    btn.style.opacity = allChecked ? '1' : '0.5';
  };

  checkboxes.forEach(id => {
    document.getElementById(id)?.addEventListener('change', checkAll);
  });

  btn.addEventListener('click', async () => {
    const newSteps = userData.steps.map(s => 
      s.id === 'footwear' ? { ...s, done: true } : s
    );

    await savePatch({
      footwear: { ack1: true, ack2: true, ack3: true },
      steps: newSteps,
      stage: 'i9'
    });

    uiToast('Safety footwear requirement completed!');
    uiGo('footwear');
  });
}

function renderI9(userData, savePatch) {
  const stepStatus = userData?.steps?.find(s => s.id === 'i9');
  const prevDone = userData?.steps?.find(s => s.id === 'footwear')?.done;
  
  if (!prevDone) {
    setPage("I-9 Verification", "Locked", `
      <div class="azCard" style="text-align:center;">
        <div style="font-size:48px;margin-bottom:16px;">🔒</div>
        <div style="font-size:18px;font-weight:600;margin-bottom:8px;">Complete Previous Step</div>
        <div class="azCardSub">Please complete Safety Footwear first</div>
        <a href="#footwear" class="btn primary" style="width:100%;margin-top:16px;">Go to Safety Footwear</a>
      </div>
    `);
    return;
  }

  if (stepStatus?.done) {
    setPage("I-9 Verification", "Completed", `
      <div class="azCard" style="text-align:center;background:#f0fdf4;border-color:#86efac;">
        <div style="font-size:64px;margin-bottom:16px;">✅</div>
        <div style="font-size:20px;font-weight:700;color:#166534;">Acknowledged!</div>
        <div class="azCardSub">You confirmed you will bring documents on first day</div>
        <a href="#photo_badge" class="btn primary" style="width:100%;margin-top:16px;">Continue to Photo Badge</a>
      </div>
    `);
    return;
  }

  setPage("I-9 Verification", "Employment eligibility", `
    <div class="azCard">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">
        <span style="font-size:32px;">📄</span>
        <div>
          <div class="azCardTitle">Form I-9 Required</div>
          <div class="azCardSub">Federal employment verification</div>
        </div>
      </div>
      <div style="font-size:14px;line-height:1.6;color:var(--gray);">
        All employees must complete Form I-9 within <strong>3 business days</strong> of start date. 
        You must present original, unexpired documents in person.
      </div>
    </div>

    <div class="azCard">
      <div class="azCardTitle">Acceptable Documents</div>
      <div style="margin-top:12px;display:grid;gap:12px;">
        <div style="padding:16px;background:#f0fdf4;border-radius:12px;border:1px solid #86efac;">
          <div style="font-weight:600;color:#166534;margin-bottom:8px;">Option A: One Document</div>
          <ul style="margin:0;padding-left:20px;font-size:13px;color:#166534;">
            <li>U.S. Passport or Passport Card</li>
            <li>Permanent Resident Card</li>
            <li>Employment Authorization Document</li>
          </ul>
        </div>
        <div style="padding:16px;background:#fffbeb;border-radius:12px;border:1px solid #fcd34d;">
          <div style="font-weight:600;color:#92400e;margin-bottom:8px;">Option B: Two Documents</div>
          <ul style="margin:0;padding-left:20px;font-size:13px;color:#92400e;">
            <li><strong>List B:</strong> Driver's license, State ID, School ID</li>
            <li><strong>+ List C:</strong> Social Security card, Birth certificate</li>
          </ul>
        </div>
      </div>
    </div>

    <div class="azCard">
      <label class="checkrow">
        <input type="checkbox" id="i9Ack">
        <span>I understand I must bring original, unexpired documents on my first day to complete I-9 verification. I understand failure to provide acceptable documentation within 3 business days will result in termination.</span>
      </label>
      <button class="btn primary" id="btnI9Complete" style="width:100%;margin-top:16px;" disabled>
        Confirm Understanding
      </button>
    </div>
  `);

  const ack = document.getElementById('i9Ack');
  const btn = document.getElementById('btnI9Complete');
  
  ack.addEventListener('change', () => {
    btn.disabled = !ack.checked;
    btn.style.opacity = ack.checked ? '1' : '0.5';
  });

  btn.addEventListener('click', async () => {
    const newSteps = userData.steps.map(s => 
      s.id === 'i9' ? { ...s, done: true } : s
    );

    await savePatch({ i9: { ack: true }, steps: newSteps });
    uiToast('I-9 acknowledged!');
    uiGo('i9');
  });
}

function renderPhotoBadge(userData) {
  setPage("Photo Badge", "Facility identification", `
    <div class="azCard" style="text-align:center;">
      <div style="font-size:64px;margin-bottom:16px;">🪪</div>
      <div style="font-size:20px;font-weight:700;margin-bottom:8px;">Photo Badge Required</div>
      <div class="azCardSub" style="line-height:1.6;">
        Your photo ID badge will be created during your <strong>first day orientation</strong>. 
        This step cannot be completed online.
      </div>
    </div>

    <div class="azCard">
      <div class="azCardTitle">What to Expect:</div>
      <ul style="margin:12px 0 0 0;padding-left:20px;line-height:1.8;">
        <li>Professional photo taken by HR staff</li>
        <li>Badge printed with your name and employee ID</li>
        <li>Access permissions programmed</li>
        <li>Safety briefing on badge usage</li>
      </ul>
    </div>

    <div class="azCard" style="background:#fef3c7;border-color:#fcd34d;">
      <div style="font-weight:600;color:#92400e;margin-bottom:8px;">⏳ Status: Pending First Day</div>
      <div style="font-size:14px;color:#92400e;">
        This step will be marked complete after you receive your badge during orientation.
      </div>
    </div>

    <a href="#firstday" class="btn primary" style="width:100%;">View First Day Instructions</a>
  `);
}

function renderFirstDay(userData, savePatch) {
  setPage("First Day", "Everything you need to know", `
    <div class="azCard" style="background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:white;text-align:center;">
      <div style="font-size:48px;margin-bottom:12px;">🎉</div>
      <div style="font-size:20px;font-weight:700;">Your First Day at SunPower</div>
      <div style="opacity:0.9;margin-top:8px;">Welcome to the team!</div>
    </div>

    <div class="azCard">
      <div class="azCardTitle">📋 What to Bring</div>
      <div style="margin-top:12px;display:grid;gap:12px;">
        <div style="display:flex;align-items:center;gap:12px;padding:12px;background:#f8fafc;border-radius:8px;">
          <span style="font-size:24px;">📄</span>
          <div>
            <div style="font-weight:600;">Original I-9 Documents</div>
            <div style="font-size:13px;color:var(--gray);">Unexpired, for employment verification</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:12px;padding:12px;background:#f8fafc;border-radius:8px;">
          <span style="font-size:24px;">👢</span>
          <div>
            <div style="font-weight:600;">Safety Footwear</div>
            <div style="font-size:13px;color:var(--gray);">ASTM F2413-18 compliant</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:12px;padding:12px;background:#f8fafc;border-radius:8px;">
          <span style="font-size:24px;">🏦</span>
          <div>
            <div style="font-weight:600;">Banking Information</div>
            <div style="font-size:13px;color:var(--gray);">For direct deposit setup</div>
          </div>
        </div>
      </div>
    </div>

    <div class="azCard">
      <div class="azCardTitle">⏰ Schedule</div>
      <div class="azCardSub" style="line-height:1.6;margin-top:12px;">
        <strong>Arrival:</strong> 30 minutes before shift<br>
        <strong>Location:</strong> HR Office - Main Entrance<br>
        <strong>Duration:</strong> 4-hour orientation<br><br>
        Your supervisor will meet you at HR and escort you to your area.
      </div>
    </div>

    <div class="azCard">
      <div class="azCardTitle">👔 Dress Code</div>
      <div class="azCardSub" style="line-height:1.6;margin-top:12px;">
        <strong>Required:</strong> Safety footwear, comfortable work clothes<br>
        <strong>Provided:</strong> Safety vest, hard hat, safety glasses<br>
        <strong>Prohibited:</strong> Loose jewelry, open-toe shoes, shorts
      </div>
    </div>

    <div class="azCard">
      <div class="azCardTitle">📞 Emergency Contacts</div>
      <div style="margin-top:12px;line-height:1.8;">
        <div><strong>HR Emergency:</strong> (800) 876-4321</div>
        <div><strong>Site Manager:</strong> (502) 467-8976</div>
        <div><strong>Security:</strong> (615) 786-9543</div>
      </div>
    </div>

    ${!userData?.steps?.find(s => s.id === 'firstday')?.done ? `
    <button class="btn primary" id="btnCompleteFirstDay" style="width:100%;">
      Mark First Day Complete (After Orientation)
    </button>
    ` : `
    <div class="azCard" style="background:#f0fdf4;border-color:#86efac;text-align:center;">
      <div style="font-size:48px;margin-bottom:12px;">✅</div>
      <div style="font-weight:700;color:#166534;">First Day Completed!</div>
      <div style="color:#166534;margin-top:8px;">Welcome to the SunPower team!</div>
    </div>
    `}
  `);

  document.getElementById('btnCompleteFirstDay')?.addEventListener('click', async () => {
    const newSteps = userData.steps.map(s => 
      s.id === 'firstday' ? { ...s, done: true } : s
    );
    await savePatch({ steps: newSteps, stage: 'completed' });
    uiToast('Congratulations on completing your first day!');
    uiGo('firstday');
  });
}

function renderSchedule() {
  setPage("Schedule", "Your work schedule", `
    <div class="azCard">
      <div style="text-align:center;padding:20px;">
        <div style="font-size:48px;margin-bottom:12px;">📅</div>
        <div style="font-size:18px;font-weight:700;margin-bottom:8px;">Schedule Coming Soon</div>
        <div class="azCardSub">
          Your official schedule will be available after your first day. 
          Your shift preference has been recorded and will be confirmed by your supervisor.
        </div>
      </div>
    </div>

    <div class="azCard">
      <div class="azCardTitle">Quick Actions</div>
      <div class="azQuickGrid" style="margin-top:12px;">
        <div class="azCard" style="text-align:center;padding:16px;">
          <div style="font-size:24px;margin-bottom:8px;">⏰</div>
          <div style="font-weight:600;font-size:13px;">Clock In</div>
          <div style="font-size:11px;color:var(--gray);">Available after first day</div>
        </div>
        <div class="azCard" style="text-align:center;padding:16px;">
          <div style="font-size:24px;margin-bottom:8px;">📊</div>
          <div style="font-weight:600;font-size:13px;">View History</div>
          <div style="font-size:11px;color:var(--gray);">No records yet</div>
        </div>
        <div class="azCard" style="text-align:center;padding:16px;">
          <div style="font-size:24px;margin-bottom:8px;">📝</div>
          <div style="font-weight:600;font-size:13px;">Request Time Off</div>
          <div style="font-size:11px;color:var(--gray);">After 90 days</div>
        </div>
      </div>
    </div>
  `);
}

function renderPayroll() {
  setPage("Payroll", "Compensation information", `
    <div class="azCard">
      <div style="text-align:center;padding:20px;">
        <div style="font-size:48px;margin-bottom:12px;">💰</div>
        <div style="font-size:18px;font-weight:700;margin-bottom:8px;">Payroll Portal</div>
        <div class="azCardSub">
          Access pay stubs, tax forms, and direct deposit information
        </div>
      </div>
    </div>

    <div class="azCard">
      <div class="azCardTitle">Pay Schedule</div>
      <div class="azCardSub" style="line-height:1.6;margin-top:12px;">
        <strong>Frequency:</strong> Bi-weekly (every other Friday)<br>
        <strong>First Paycheck:</strong> After first full pay period<br>
        <strong>Direct Deposit:</strong> Setup on first day<br><br>
        Pay stubs available 2 days before payday.
      </div>
    </div>

    <div class="azRow2">
      <a href="#w4" class="azCard" style="text-decoration:none;color:inherit;">
        <div class="azCardTitle">📄 W-4 Form</div>
        <div class="azCardSub">Tax withholding setup</div>
      </a>
      <a href="#deposit" class="azCard" style="text-decoration:none;color:inherit;">
        <div class="azCardTitle">🏦 Direct Deposit</div>
        <div class="azCardSub">Banking information</div>
      </a>
    </div>
  `);
}

function renderBenefits() {
  setPage("Benefits", "Employee perks and programs", `
    <div class="benefits-grid">
      <div class="benefit-card">
        <div class="benefit-header">
          <div class="benefit-icon" style="background:#dcfce7;">🏥</div>
          <div class="benefit-title">Health Insurance</div>
        </div>
        <ul class="benefit-list">
          <li>Medical, dental, and vision coverage</li>
          <li>Coverage begins after 60 days</li>
          <li>Multiple plan options available</li>
          <li>Dependent coverage available</li>
        </ul>
      </div>

      <div class="benefit-card">
        <div class="benefit-header">
          <div class="benefit-icon" style="background:#dbeafe;">🏖️</div>
          <div class="benefit-title">Paid Time Off</div>
        </div>
        <ul class="benefit-list">
          <li>Vacation: 10 days/year</li>
          <li>Sick leave: 6 days/year</li>
          <li>Personal days: 2 days/year</li>
          <li>Company holidays: 10 days/year</li>
        </ul>
      </div>

      <div class="benefit-card">
        <div class="benefit-header">
          <div class="benefit-icon" style="background:#fef3c7;">💰</div>
          <div class="benefit-title">401(k) Retirement</div>
        </div>
        <ul class="benefit-list">
          <li>Company match: 100% of first 3%</li>
          <li>Plus 50% of next 2%</li>
          <li>Immediate vesting</li>
          <li>Eligible after 90 days</li>
        </ul>
      </div>

      <div class="benefit-card">
        <div class="benefit-header">
          <div class="benefit-icon" style="background:#f3e8ff;">🎯</div>
          <div class="benefit-title">Additional Perks</div>
        </div>
        <ul class="benefit-list">
          <li>Employee discount program</li>
          <li>Wellness program</li>
          <li>Employee assistance (EAP)</li>
          <li>Referral bonuses</li>
        </ul>
      </div>
    </div>
  `);
}

function renderChat(userData) {
  setPage("HR Chat", "Message with Human Resources", `
    <div class="chat-container">
      <div class="chat-messages" id="chatMessages">
        <div class="chat-message admin">
          <div>Welcome to SunPower HR Chat! How can we help you today?</div>
          <div class="chat-time">HR Team</div>
        </div>
      </div>
      <div class="chat-input-area">
        <input type="text" class="chat-input" id="chatInput" placeholder="Type your message..." maxlength="500">
        <button class="chat-send" id="btnSend">➤</button>
      </div>
    </div>

    <div class="azCard" style="margin-top:16px;">
      <div class="azCardTitle">Chat Hours</div>
      <div class="azCardSub" style="line-height:1.6;margin-top:12px;">
        <strong>Monday - Friday:</strong> 8:00 AM - 6:00 PM EST<br>
        <strong>Saturday:</strong> 9:00 AM - 2:00 PM EST<br>
        <strong>Sunday:</strong> Closed<br><br>
        For urgent matters: (800) 876-4321
      </div>
    </div>
  `);

  const messages = document.getElementById('chatMessages');
  const input = document.getElementById('chatInput');
  const sendBtn = document.getElementById('btnSend');

  const addMessage = (text, sender) => {
    const div = document.createElement('div');
    div.className = `chat-message ${sender}`;
    div.innerHTML = `<div>${escapeHtml(text)}</div><div class="chat-time">${new Date().toLocaleTimeString()}</div>`;
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
  };

  const send = () => {
    const text = input.value.trim();
    if (!text) return;
    addMessage(text, 'employee');
    input.value = '';
    
    // Simulate HR response
    setTimeout(() => {
      addMessage("Thank you for your message. An HR representative will respond shortly.", 'admin');
    }, 1000);
  };

  sendBtn.addEventListener('click', send);
  input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') send();
  });
}

function renderProfile(userData) {
  setPage("My Profile", "Personal information", `
    <div class="profile-card">
      <div class="profile-avatar">👤</div>
      <div class="profile-name">${escapeHtml(userData?.fullName || 'Employee')}</div>
      <div class="profile-id">ID: ${escapeHtml(userData?.employeeId || 'Pending')}</div>
      
      <div class="profile-info">
        <div class="profile-row">
          <span class="profile-label">Email</span>
          <span class="profile-value">${escapeHtml(userData?.email || '—')}</span>
        </div>
        <div class="profile-row">
          <span class="profile-label">Position</span>
          <span class="profile-value">${escapeHtml(userData?.shift?.position || 'Pending')}</span>
        </div>
        <div class="profile-row">
          <span class="profile-label">Shift</span>
          <span class="profile-value">${escapeHtml(userData?.shift?.shift || 'Pending')}</span>
        </div>
        <div class="profile-row">
          <span class="profile-label">Status</span>
          <span class="profile-value" style="color:var(--success);">${escapeHtml(userData?.status || 'Active')}</span>
        </div>
      </div>
    </div>

    <div class="azCard" style="margin-top:16px;">
      <div class="azCardTitle">Update Information</div>
      <div class="azCardSub" style="line-height:1.6;margin-top:12px;">
        To update your personal information, please contact HR directly. 
        For security reasons, profile changes must be verified.
      </div>
      <a href="#help" class="btn ghost" style="width:100%;margin-top:12px;">Contact HR</a>
    </div>
  `);
}

function renderHelp() {
  setPage("Help & Support", "Contact information", `
    <div class="azCard" style="background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:white;text-align:center;">
      <div style="font-size:48px;margin-bottom:12px;">🆘</div>
      <div style="font-size:20px;font-weight:700;">We're Here to Help</div>
      <div style="opacity:0.9;margin-top:8px;">Contact us for any questions or concerns</div>
    </div>

    <div class="azCard">
      <div class="azCardTitle">Contact HR</div>
      <div style="margin-top:12px;display:flex;flex-direction:column;gap:12px;">
        <a href="tel:8008764321" class="azCard" style="text-decoration:none;color:inherit;display:flex;align-items:center;gap:12px;margin:0;">
          <span style="font-size:24px;">📞</span>
          <div>
            <div style="font-weight:600;">Phone</div>
            <div style="font-size:13px;color:var(--gray);">(800) 876-4321</div>
          </div>
        </a>
        <a href="mailto:hr@sunpowerc.energy" class="azCard" style="text-decoration:none;color:inherit;display:flex;align-items:center;gap:12px;margin:0;">
          <span style="font-size:24px;">✉️</span>
          <div>
            <div style="font-weight:600;">Email</div>
            <div style="font-size:13px;color:var(--gray);">hr@sunpowerc.energy</div>
          </div>
        </a>
        <a href="#chat" class="azCard" style="text-decoration:none;color:inherit;display:flex;align-items:center;gap:12px;margin:0;">
          <span style="font-size:24px;">💬</span>
          <div>
            <div style="font-weight:600;">Live Chat</div>
            <div style="font-size:13px;color:var(--gray);">Message HR directly</div>
          </div>
        </a>
      </div>
    </div>

    <div class="azCard" style="background:#fef2f2;border-color:#fecaca;">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
        <span style="font-size:24px;">🚨</span>
        <div class="azCardTitle" style="color:#991b1b;">Emergency</div>
      </div>
      <div style="color:#7f1d1d;line-height:1.6;">
        For life-threatening emergencies, call 911 immediately.
      </div>
      <a href="tel:911" class="btn primary" style="width:100%;margin-top:12px;background:#dc2626;">Call 911</a>
    </div>
  `);
}

function renderW4() {
  setPage("W-4 Tax Form", "Federal tax withholding", `
    <div class="azCard">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">
        <span style="font-size:32px;">📄</span>
        <div>
          <div class="azCardTitle">Employee's Withholding Certificate</div>
          <div class="azCardSub">Complete within first week</div>
        </div>
      </div>
      <div style="line-height:1.6;color:var(--gray);">
        The W-4 form determines how much federal income tax is withheld from your paycheck. 
        Complete this through your payroll portal after your first day.
      </div>
    </div>

    <div class="azCard">
      <div class="azCardTitle">Steps to Complete</div>
      <ol style="margin:12px 0 0 0;padding-left:20px;line-height:1.8;">
        <li>Access payroll portal after first day</li>
        <li>Complete personal information</li>
        <li>Fill out Steps 2-4 if applicable</li>
        <li>Sign and date the form</li>
        <li>Submit to HR</li>
      </ol>
    </div>

    <a href="https://www.irs.gov/forms-pubs/about-form-w-4" target="_blank" class="btn ghost" style="width:100%;">
      IRS W-4 Information →
    </a>
  `);
}

function renderDeposit() {
  setPage("Direct Deposit", "Setup your payroll deposit", `
    <div class="azCard">
      <div style="text-align:center;padding:20px;">
        <div style="font-size:48px;margin-bottom:12px;">🏦</div>
        <div style="font-size:18px;font-weight:700;">Direct Deposit Setup</div>
        <div class="azCardSub">Get paid faster with direct deposit</div>
      </div>
    </div>

    <div class="azCard">
      <div class="azCardTitle">Required Information</div>
      <div class="azCardSub" style="line-height:1.8;margin-top:12px;">
        Bring to your first day orientation:<br><br>
        <strong>1.</strong> Voided check, OR<br>
        <strong>2.</strong> Bank statement with account details, OR<br>
        <strong>3.</strong> Routing and account numbers<br><br>
        <strong>Account Type:</strong> Checking or Savings<br>
        <strong>Bank Name:</strong> Full bank name<br>
        <strong>Routing Number:</strong> 9-digit number<br>
        <strong>Account Number:</strong> Your account number
      </div>
    </div>

    <div class="azCard" style="background:#f0fdf4;border-color:#86efac;">
      <div class="azCardTitle" style="color:#166534;">✅ Benefits</div>
      <div style="color:#166534;line-height:1.6;margin-top:12px;">
        • Get paid faster<br>
        • No lost or stolen checks<br>
        • Automatic deposit<br>
        • Environmentally friendly
      </div>
    </div>
  `);
}

function renderNotifications() {
  setPage("Notifications", "Company updates", `
    <div class="azCard" style="text-align:center;padding:40px;">
      <div style="font-size:48px;margin-bottom:16px;">🔔</div>
      <div style="font-size:18px;font-weight:700;margin-bottom:8px;">No Notifications</div>
      <div class="azCardSub">Important updates will appear here</div>
    </div>
  `);
}

// Main initialization
export async function initEmployeePortal() {
  let currentUser = null;
  let userData = {};
  let unsubUser = null;

  const saveUserPatch = async (patch) => {
    if (!currentUser) return;
    try {
      const ref = doc(db, "users", currentUser.uid);
      await setDoc(ref, { ...patch, updatedAt: serverTimestamp() }, { merge: true });
    } catch (e) {
      uiToast("Error saving changes");
      console.error(e);
    }
  };

  const renderRoute = () => {
    const route = routeName();
    
    // Update active states
    document.querySelectorAll('.nav-item, .az-tab').forEach(el => {
      const r = el.getAttribute('data-route') || el.getAttribute('href')?.replace('#', '');
      el.classList.toggle('active', r === route);
    });

    switch (route) {
      case 'home':
        renderHome(userData);
        break;
      case 'progress':
        renderProgress(userData);
        break;
      case 'shift':
        renderShift(userData, saveUserPatch);
        break;
      case 'footwear':
        renderFootwear(userData, saveUserPatch);
        break;
      case 'i9':
        renderI9(userData, saveUserPatch);
        break;
      case 'photo_badge':
        renderPhotoBadge(userData);
        break;
      case 'firstday':
        renderFirstDay(userData, saveUserPatch);
        break;
      case 'schedule':
        renderSchedule();
        break;
      case 'payroll':
        renderPayroll();
        break;
      case 'benefits':
        renderBenefits();
        break;
      case 'chat':
        renderChat(userData);
        break;
      case 'profile':
        renderProfile(userData);
        break;
      case 'help':
        renderHelp();
        break;
      case 'w4':
        renderW4();
        break;
      case 'deposit':
        renderDeposit();
        break;
      case 'notifications':
        renderNotifications();
        break;
      default:
        renderHome(userData);
    }
  };

  onAuth((user) => {
    if (!user) {
      window.location.href = './index.html';
      return;
    }

    currentUser = user;

    // Subscribe to user data
    const userRef = doc(db, "users", user.uid);
    unsubUser = onSnapshot(userRef, (snap) => {
      if (snap.exists()) {
        userData = snap.data();
      } else {
        // Create initial user doc
        const initialData = defaultUserDoc(user);
        setDoc(userRef, initialData);
        userData = initialData;
      }
      renderRoute();
    }, (err) => {
      console.error("Error loading user data:", err);
      uiToast("Error loading data");
    });

    renderRoute();
  });

  window.addEventListener('hashchange', renderRoute);
}
