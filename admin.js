import { db, isFirebaseConfigured } from "./firebase.js";
import { onAuth, signOutNow } from "./auth.js";
import { uiToast, escapeHtml, uiSetText } from "./ui.js";

import {
  doc, getDoc, setDoc, updateDoc, onSnapshot, collection, query, where, getDocs, orderBy, serverTimestamp, addDoc, deleteDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

function setPage(title, html) {
  uiSetText(document.getElementById("pageTitle"), title);
  document.getElementById("pageBody").innerHTML = html;
}

function azIcon(name) {
  const common = `width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`;
  const icons = {
    users: `<svg ${common}><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>`,
    check: `<svg ${common}><path d="M20 6L9 17l-5-5"/></svg>`,
    alert: `<svg ${common}><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>`,
    message: `<svg ${common}><path d="M21 15a4 4 0 01-4 4H8l-5 3V7a4 4 0 014-4h10a4 4 0 014 4z"/></svg>`,
    search: `<svg ${common}><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>`,
    plus: `<svg ${common}><path d="M12 5v14M5 12h14"/></svg>`,
    trash: `<svg ${common}><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>`,
    edit: `<svg ${common}><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`,
    logout: `<svg ${common}><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/></svg>`
  };
  return icons[name] || icons.alert;
}

function renderAdminDashboard(users, tickets, chats) {
  const pendingTickets = tickets.filter(t => t.status === 'open').length;
  const totalUsers = users.length;
  const completedOnboarding = users.filter(u => {
    const steps = u.steps || [];
    return steps.every(s => s.done);
  }).length;

  setPage("Admin Dashboard", `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;margin-bottom:24px;">
      <div class="azCard" style="text-align:center;">
        <div style="font-size:32px;margin-bottom:8px;">👥</div>
        <div style="font-weight:1000;font-size:24px;color:rgba(29,78,216,1);">${totalUsers}</div>
        <div style="font-size:12px;color:rgba(2,6,23,.60);">Total Users</div>
      </div>
      <div class="azCard" style="text-align:center;">
        <div style="font-size:32px;margin-bottom:8px;">✅</div>
        <div style="font-weight:1000;font-size:24px;color:rgba(22,163,74,1);">${completedOnboarding}</div>
        <div style="font-size:12px;color:rgba(2,6,23,.60);">Completed Onboarding</div>
      </div>
      <div class="azCard" style="text-align:center;">
        <div style="font-size:32px;margin-bottom:8px;">🎫</div>
        <div style="font-weight:1000;font-size:24px;color:rgba(245,158,11,1);">${pendingTickets}</div>
        <div style="font-size:12px;color:rgba(2,6,23,.60);">Open Tickets</div>
      </div>
      <div class="azCard" style="text-align:center;">
        <div style="font-size:32px;margin-bottom:8px;">💬</div>
        <div style="font-weight:1000;font-size:24px;color:rgba(139,92,246,1);">${chats.length}</div>
        <div style="font-size:12px;color:rgba(2,6,23,.60);">Active Chats</div>
      </div>
    </div>

    <div class="azCard">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
        <div class="azCardTitle">Recent Users</div>
        <a href="#users" class="btn sm">View All</a>
      </div>
      ${users.slice(0, 5).map(u => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-bottom:1px solid rgba(229,234,242,.95);">
          <div>
            <div style="font-weight:1000;font-size:13px;">${escapeHtml(u.fullName || u.email || 'Unknown')}</div>
            <div class="muted" style="font-size:12px;">${escapeHtml(u.employeeId || 'No ID')}</div>
          </div>
          <div style="font-size:12px;color:${u.status === 'active' ? 'rgba(22,163,74,1)' : 'rgba(245,158,11,1)'};">
            ${u.status || 'pending'}
          </div>
        </div>
      `).join('')}
    </div>

    <div class="azCard" style="margin-top:16px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
        <div class="azCardTitle">Open Support Tickets</div>
        <a href="#tickets" class="btn sm">View All</a>
      </div>
      ${tickets.filter(t => t.status === 'open').slice(0, 5).map(t => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-bottom:1px solid rgba(229,234,242,.95);">
          <div>
            <div style="font-weight:1000;font-size:13px;">${escapeHtml(t.title)}</div>
            <div class="muted" style="font-size:12px;">${escapeHtml(t.employeeId || 'Unknown')}</div>
          </div>
          <div style="font-size:12px;color:rgba(245,158,11,1);">Open</div>
        </div>
      `).join('') || '<div class="muted">No open tickets</div>'}
    </div>
  `);
}

function renderUsersList(users) {
  setPage("User Management", `
    <div class="azCard">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
        <div class="azCardTitle">All Users</div>
        <div style="display:flex;gap:8px;">
          <input type="text" id="userSearch" placeholder="Search users..." style="padding:8px 12px;border:1px solid rgba(229,234,242,.95);border-radius:8px;font-size:13px;">
          <button class="btn primary" onclick="document.getElementById('addUserModal').style.display='block'">${azIcon("plus")} Add</button>
        </div>
      </div>
      <div id="usersTable">
        ${users.map(u => `
          <div class="user-row" style="display:flex;justify-content:space-between;align-items:center;padding:16px;border-bottom:1px solid rgba(229,234,242,.95);">
            <div style="display:flex;gap:12px;align-items:center;">
              <div style="width:40px;height:40px;border-radius:999px;background:rgba(29,78,216,.10);display:flex;align-items:center;justify-content:center;color:rgba(29,78,216,1);">
                ${azIcon("users")}
              </div>
              <div>
                <div style="font-weight:1000;font-size:14px;">${escapeHtml(u.fullName || 'No Name')}</div>
                <div class="muted" style="font-size:12px;">${escapeHtml(u.email)} • ${escapeHtml(u.employeeId || 'No ID')}</div>
              </div>
            </div>
            <div style="display:flex;gap:8px;">
              <button class="btn sm" onclick="editUser('${u.id}')">${azIcon("edit")}</button>
              <button class="btn sm danger" onclick="deleteUser('${u.id}')">${azIcon("trash")}</button>
            </div>
          </div>
        `).join('')}
      </div>
    </div>

    <div id="addUserModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:10000;align-items:center;justify-content:center;">
      <div style="background:#fff;padding:24px;border-radius:16px;max-width:400px;width:90%;">
        <div class="azCardTitle" style="margin-bottom:16px;">Add New User</div>
        <input type="email" id="newUserEmail" placeholder="Email" style="width:100%;padding:12px;margin-bottom:12px;border:1px solid rgba(229,234,242,.95);border-radius:8px;">
        <input type="text" id="newUserEmpId" placeholder="Employee ID (e.g., SP023)" style="width:100%;padding:12px;margin-bottom:12px;border:1px solid rgba(229,234,242,.95);border-radius:8px;">
        <div style="display:flex;gap:8px;justify-content:flex-end;">
          <button class="btn ghost" onclick="document.getElementById('addUserModal').style.display='none'">Cancel</button>
          <button class="btn primary" onclick="addUser()">Add User</button>
        </div>
      </div>
    </div>
  `);

  document.getElementById('userSearch')?.addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    document.querySelectorAll('.user-row').forEach(row => {
      const text = row.textContent.toLowerCase();
      row.style.display = text.includes(term) ? '' : 'none';
    });
  });
}

function renderTicketsList(tickets) {
  setPage("Support Tickets", `
    <div class="azCard">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
        <div class="azCardTitle">All Tickets</div>
        <div style="display:flex;gap:8px;">
          <select id="ticketFilter" style="padding:8px 12px;border:1px solid rgba(229,234,242,.95);border-radius:8px;font-size:13px;">
            <option value="all">All Status</option>
            <option value="open">Open</option>
            <option value="in-progress">In Progress</option>
            <option value="closed">Closed</option>
          </select>
        </div>
      </div>
      ${tickets.map(t => `
        <div class="ticket-row" data-status="${t.status}" style="padding:16px;border-bottom:1px solid rgba(229,234,242,.95);">
          <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:8px;">
            <div style="font-weight:1000;font-size:14px;">${escapeHtml(t.title)}</div>
            <span style="padding:4px 10px;border-radius:999px;font-size:11px;font-weight:900;text-transform:uppercase;${
              t.status === 'open' ? 'background:rgba(245,158,11,.10);color:rgba(180,83,9,1);' :
              t.status === 'closed' ? 'background:rgba(22,163,74,.10);color:rgba(22,163,74,1);' :
              'background:rgba(29,78,216,.10);color:rgba(29,78,216,1);'
            }">${t.status}</span>
          </div>
          <div class="muted" style="font-size:12px;margin-bottom:8px;">${escapeHtml(t.description || '')}</div>
          <div style="display:flex;gap:8px;">
            <button class="btn sm" onclick="viewTicket('${t.id}')">View</button>
            ${t.status !== 'closed' ? `<button class="btn sm" onclick="closeTicket('${t.id}')">Close</button>` : ''}
          </div>
        </div>
      `).join('') || '<div class="muted" style="text-align:center;padding:40px;">No tickets found</div>'}
    </div>
  `);

  document.getElementById('ticketFilter')?.addEventListener('change', (e) => {
    const status = e.target.value;
    document.querySelectorAll('.ticket-row').forEach(row => {
      row.style.display = (status === 'all' || row.dataset.status === status) ? '' : 'none';
    });
  });
}

export async function initAdminPortal() {
  let currentUser = null;
  let users = [];
  let tickets = [];
  let chats = [];

  onAuth(async (user) => {
    if (!user) {
      location.href = "/index.html";
      return;
    }

    currentUser = user;

    // Check admin status
    const adminRef = doc(db, "admins", user.uid);
    const adminSnap = await getDoc(adminRef);
    if (!adminSnap.exists()) {
      uiToast("Access denied. Admin privileges required.");
      await signOutNow();
      location.href = "/index.html";
      return;
    }

    // Load data
    const usersSnap = await getDocs(query(collection(db, "users"), orderBy("createdAt", "desc")));
    users = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    const ticketsSnap = await getDocs(query(collection(db, "supportTickets"), orderBy("createdAt", "desc")));
    tickets = ticketsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    const chatsSnap = await getDocs(collection(db, "chats"));
    chats = chatsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    renderAdminDashboard(users, tickets, chats);
  });

  // Route handling
  window.addEventListener("hashchange", () => {
    const route = (location.hash || "#dashboard").replace("#", "");
    switch(route) {
      case "users":
        renderUsersList(users);
        break;
      case "tickets":
        renderTicketsList(tickets);
        break;
      default:
        renderAdminDashboard(users, tickets, chats);
    }
  });

  // Global functions for onclick handlers
  window.editUser = (id) => {
    uiToast("Edit user: " + id);
  };

  window.deleteUser = async (id) => {
    if (!confirm("Are you sure you want to delete this user?")) return;
    try {
      await deleteDoc(doc(db, "users", id));
      uiToast("User deleted");
      users = users.filter(u => u.id !== id);
      renderUsersList(users);
    } catch (e) {
      uiToast("Error deleting user");
    }
  };

  window.addUser = async () => {
    const email = document.getElementById('newUserEmail').value;
    const empId = document.getElementById('newUserEmpId').value;
    if (!email || !empId) {
      uiToast("Please fill in all fields");
      return;
    }
    try {
      await addDoc(collection(db, "allowedEmployees"), {
        email,
        employeeId: empId,
        active: true,
        createdAt: serverTimestamp()
      });
      document.getElementById('addUserModal').style.display = 'none';
      uiToast("User added successfully");
    } catch (e) {
      uiToast("Error adding user");
    }
  };

  window.viewTicket = (id) => {
    const ticket = tickets.find(t => t.id === id);
    if (!ticket) return;
    alert(`Ticket: ${ticket.title}\n\n${ticket.description || 'No description'}`);
  };

  window.closeTicket = async (id) => {
    try {
      await updateDoc(doc(db, "supportTickets", id), {
        status: 'closed',
        closedAt: serverTimestamp()
      });
      uiToast("Ticket closed");
      const t = tickets.find(x => x.id === id);
      if (t) t.status = 'closed';
      renderTicketsList(tickets);
    } catch (e) {
      uiToast("Error closing ticket");
    }
  };

  document.getElementById("btnLogout")?.addEventListener("click", async () => {
    await signOutNow();
    location.href = "/index.html";
  });
}
