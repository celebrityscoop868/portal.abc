export function uiSetText(el, text) {
  if (!el) return;
  el.textContent = text ?? "";
}

export function uiShow(el, show) {
  if (!el) return;
  el.style.display = show ? "" : "none";
}

export function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

let __toastEl = null;
let __toastHideTimer = null;

export function uiToast(text, ms = 2200) {
  const msg = String(text ?? "").trim();
  if (!msg) return;

  if (!__toastEl) {
    __toastEl = document.createElement("div");
    __toastEl.style.cssText = `
      position: fixed;
      bottom: 100px;
      left: 50%;
      transform: translateX(-50%);
      background: #333;
      color: white;
      padding: 12px 24px;
      border-radius: 8px;
      font-size: 14px;
      z-index: 9999;
      opacity: 0;
      transition: opacity 0.3s;
    `;
    document.body.appendChild(__toastEl);
  }

  if (__toastHideTimer) clearTimeout(__toastHideTimer);

  __toastEl.textContent = msg;
  requestAnimationFrame(() => __toastEl.style.opacity = "1");

  __toastHideTimer = setTimeout(() => {
    if (__toastEl) __toastEl.style.opacity = "0";
  }, ms);
}
