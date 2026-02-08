export function uiSetText(el, text) {
  if (!el) return;
  el.textContent = text ?? "";
}

export function uiShow(el, show) {
  if (!el) return;
  el.style.display = show ? "" : "none";
}

export function escapeHtml(s) {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function uiRoute() {
  return (location.hash || "#home").replace("#", "").trim().toLowerCase();
}

export function uiGo(route) {
  const r = String(route || "").replace("#", "").trim().toLowerCase();
  location.hash = "#" + (r || "home");
}

let toastEl = null;
let toastTimer = null;

export function uiToast(text, ms = 3000) {
  const msg = String(text || "").trim();
  if (!msg) return;

  if (!toastEl) {
    toastEl = document.createElement("div");
    toastEl.style.cssText = `
      position: fixed;
      bottom: 100px;
      left: 50%;
      transform: translateX(-50%);
      background: #1a1a2e;
      color: white;
      padding: 16px 24px;
      border-radius: 12px;
      font-size: 14px;
      font-weight: 500;
      box-shadow: 0 10px 40px rgba(0,0,0,0.3);
      z-index: 99999;
      max-width: 90vw;
      text-align: center;
      opacity: 0;
      transition: opacity 0.3s ease;
    `;
    document.body.appendChild(toastEl);
  }

  if (toastTimer) clearTimeout(toastTimer);

  toastEl.textContent = msg;
  toastEl.style.opacity = "1";

  toastTimer = setTimeout(() => {
    if (toastEl) toastEl.style.opacity = "0";
  }, ms);
}

export function uiWireDrawer({ btnId = "btnMenu", sidebarId = "sidebar", overlayId = "drawerOverlay" } = {}) {
  const btn = document.getElementById(btnId);
  const sidebar = document.getElementById(sidebarId);
  const overlay = document.getElementById(overlayId);

  if (!btn || !sidebar || !overlay) return;

  const isMobile = () => window.innerWidth <= 920;

  const open = () => {
    sidebar.classList.add("open");
    overlay.classList.add("show");
    document.body.style.overflow = "hidden";
  };

  const close = () => {
    sidebar.classList.remove("open");
    overlay.classList.remove("show");
    document.body.style.overflow = "";
  };

  btn.addEventListener("click", () => {
    sidebar.classList.contains("open") ? close() : open();
  });

  overlay.addEventListener("click", close);

  document.querySelectorAll(".nav-item").forEach(a => {
    a.addEventListener("click", () => {
      if (isMobile()) close();
    });
  });
}
