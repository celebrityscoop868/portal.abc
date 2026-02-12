// ===============================
// UI Helpers - NO Firebase here
// ===============================

export function uiSetText(el, text) {
  if (el) el.textContent = text;
}

export function uiShow(el, show = true) {
  if (el) el.style.display = show ? "" : "none";
}

export function uiToast(message, duration = 3000) {
  // Create toast element
  const toast = document.createElement('div');
  toast.style.cssText = `
    position: fixed;
    bottom: 80px;
    left: 50%;
    transform: translateX(-50%);
    background: #1e3a8a;
    color: white;
    padding: 12px 20px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 600;
    z-index: 10000;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    animation: slideUp 0.3s ease;
  `;
  toast.textContent = message;
  
  // Add animation
  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideUp {
      from { transform: translateX(-50%) translateY(20px); opacity: 0; }
      to { transform: translateX(-50%) translateY(0); opacity: 1; }
    }
  `;
  document.head.appendChild(style);
  
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.style.animation = 'slideUp 0.3s ease reverse';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

export function escapeHtml(text) {
  if (!text) return "";
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Navigation helpers
export function uiActiveNav() {
  const route = (location.hash || "#home").replace("#", "").trim();
  
  // Update sidebar
  document.querySelectorAll('.sidebar .nav-item').forEach(item => {
    item.classList.remove('active');
    if (item.dataset.route === route) {
      item.classList.add('active');
    }
  });
  
  // Update bottom nav
  document.querySelectorAll('#azTabs .az-tab').forEach(tab => {
    tab.classList.remove('active');
    if (tab.dataset.route === route) {
      tab.classList.add('active');
    }
  });
}

export function uiWireGlobalTaps() {
  // Global click handlers can go here
  document.addEventListener('click', (e) => {
    // Handle clicks if needed
  });
}
