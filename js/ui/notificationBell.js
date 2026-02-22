// js/ui/notificationBell.js
// Drop-in notification bell for the WorkLynx header.
//
// Usage:
//   import { initNotificationBell, destroyNotificationBell } from "../ui/notificationBell.js";
//
//   // Call AFTER renderHeader() has been added to the DOM:
//   await initNotificationBell();
//
//   // On page unload / SPA nav:
//   destroyNotificationBell();
//
// The module looks for <button id="wlBell"> in the DOM, which renderHeader()
// already produces. It wraps it, injects a badge, and builds the dropdown.

import {
  listNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  clearAllNotifications,
  subscribeToNotifications,
} from "../data/notifications.api.js";

// ─── Icon map ─────────────────────────────────────────────────────────────────
const ICONS = {
  SHIFT_ASSIGNED:        "📋",
  SHIFT_CANCELLED:       "🚫",
  SHIFT_UPDATED:         "✏️",
  TIMESHEET_SUBMITTED:   "📤",
  INVITE_ACCEPTED:       "🤝",
  SHIFT_REMINDER:        "⏰",
  SHIFT_STARTED:         "🟢",
  SHIFT_CLOCK_IN_MISSED: "⚠️",
  SHIFT_ENDING_SOON:     "⏳",
  SHIFT_ENDED:           "✅",
  CLOCK_OUT_REMINDER:    "⚠️",
  DEFAULT:               "🔔",
};

// ─── Module state ─────────────────────────────────────────────────────────────
let _notifs      = [];
let _unread      = 0;
let _open        = false;
let _unsubscribe = null;
let $bell        = null;
let $badge       = null;
let $panel       = null;

// ─── Public API ───────────────────────────────────────────────────────────────

export async function initNotificationBell() {
  $bell = document.querySelector("#wlBell");
  if (!$bell) {
    console.warn("[notifications] #wlBell not found in DOM.");
    return;
  }

  // ── Wrap bell in a positioned container ───────────────────────────────────
  const wrapper = document.createElement("div");
  wrapper.id    = "wlBellWrapper";
  wrapper.style.cssText = "position:relative; display:inline-flex; align-items:center;";
  $bell.parentNode.insertBefore(wrapper, $bell);
  wrapper.appendChild($bell);

  // Strip old click listeners by replacing the node
  const fresh = $bell.cloneNode(true);
  $bell.replaceWith(fresh);
  $bell = fresh;

  // ── Badge ─────────────────────────────────────────────────────────────────
  $badge = document.createElement("span");
  $badge.id = "wlBellBadge";
  $badge.setAttribute("aria-hidden", "true");
  $badge.style.cssText = `
    position:absolute; top:2px; right:2px;
    min-width:17px; height:17px;
    background:var(--wl-brand, #6d28d9);
    color:#fff; border-radius:999px;
    font-size:10px; font-weight:800;
    display:none; align-items:center; justify-content:center;
    padding:0 4px; line-height:1;
    border:2px solid var(--wl-card, #fff);
    pointer-events:none;
    z-index:1;
  `;
  wrapper.appendChild($badge);

  // ── Panel ─────────────────────────────────────────────────────────────────
  $panel = buildPanel();
  wrapper.appendChild($panel);

  // ── Events ───────────────────────────────────────────────────────────────
  $bell.addEventListener("click", onBellClick);
  document.addEventListener("click", onOutsideClick);

  // ── Load data ─────────────────────────────────────────────────────────────
  await refresh();

  // ── Realtime ──────────────────────────────────────────────────────────────
  _unsubscribe = await subscribeToNotifications(onNewNotification);
}

export async function destroyNotificationBell() {
  if (_unsubscribe) { await _unsubscribe(); _unsubscribe = null; }
  document.removeEventListener("click", onOutsideClick);
}

// ─── Panel HTML ───────────────────────────────────────────────────────────────

function buildPanel() {
  const panel = document.createElement("div");
  panel.id = "wlNotifsPanel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Notifications");
  panel.style.cssText = `
    display:none;
    position:absolute;
    top:calc(100% + 10px); right:0;
    width:360px; max-width:calc(100vw - 24px);
    background:var(--wl-card, #fff);
    border:1px solid var(--wl-border, rgba(15,23,42,.1));
    border-radius:16px;
    box-shadow:0 20px 48px rgba(15,23,42,.16), 0 4px 12px rgba(15,23,42,.08);
    z-index:9999;
    overflow:hidden;
  `;

  panel.innerHTML = `
    <style>
      @keyframes wlPanelIn {
        from { opacity:0; transform:translateY(-6px) scale(.97); }
        to   { opacity:1; transform:translateY(0) scale(1); }
      }
      @keyframes wlBellShake {
        0%,100% { transform:rotate(0); }
        20%      { transform:rotate(16deg); }
        40%      { transform:rotate(-12deg); }
        60%      { transform:rotate(8deg); }
        80%      { transform:rotate(-4deg); }
      }
      #wlNotifsPanel.wl-panel-open { animation:wlPanelIn .18s cubic-bezier(.22,.68,0,1.2); }
      #wlNotifsPanel .wln-header {
        display:flex; align-items:center; justify-content:space-between;
        padding:14px 16px 12px;
        border-bottom:1px solid var(--wl-border, rgba(15,23,42,.08));
      }
      #wlNotifsPanel .wln-header-title {
        font-weight:800; font-size:15px; margin:0;
      }
      #wlNotifsPanel .wln-header-actions { display:flex; gap:6px; }
      #wlNotifsPanel .wln-list {
        max-height:400px; overflow-y:auto; overscroll-behavior:contain;
      }
      #wlNotifsPanel .wln-item {
        display:flex; gap:10px; padding:12px 14px;
        border-bottom:1px solid var(--wl-border, rgba(15,23,42,.06));
        cursor:pointer; transition:background .1s;
        position:relative; text-decoration:none; color:inherit;
        align-items:flex-start;
      }
      #wlNotifsPanel .wln-item:last-child { border-bottom:none; }
      #wlNotifsPanel .wln-item:hover      { background:rgba(15,23,42,.03); }
      #wlNotifsPanel .wln-item.unread     { background:rgba(109,40,217,.06); }
      #wlNotifsPanel .wln-item.unread:hover { background:rgba(109,40,217,.10); }
      #wlNotifsPanel .wln-icon {
        width:36px; height:36px; font-size:18px;
        background:rgba(15,23,42,.06); border-radius:10px;
        display:flex; align-items:center; justify-content:center; flex-shrink:0;
      }
      #wlNotifsPanel .wln-body { flex:1; min-width:0; padding-right:22px; }
      #wlNotifsPanel .wln-title { font-weight:700; font-size:13px; line-height:1.3; }
      #wlNotifsPanel .wln-text  { font-size:12px; color:var(--wl-muted,#64748b); margin-top:2px; line-height:1.4; }
      #wlNotifsPanel .wln-time  { font-size:11px; color:var(--wl-muted,#94a3b8); margin-top:4px; }
      #wlNotifsPanel .wln-unread-dot {
        width:7px; height:7px; border-radius:50%;
        background:var(--wl-brand,#6d28d9);
        position:absolute; top:50%; right:14px; transform:translateY(-50%);
        flex-shrink:0;
      }
      #wlNotifsPanel .wln-dismiss {
        position:absolute; top:8px; right:10px;
        background:none; border:none; cursor:pointer;
        font-size:13px; line-height:1; padding:2px 5px; border-radius:6px;
        color:var(--wl-muted,#94a3b8); opacity:0; transition:opacity .12s;
      }
      #wlNotifsPanel .wln-item:hover .wln-dismiss { opacity:1; }
      #wlNotifsPanel .wln-empty {
        padding:44px 20px; text-align:center;
        color:var(--wl-muted,#64748b); font-size:13px;
      }
      #wlNotifsPanel .wln-empty-icon { font-size:36px; margin-bottom:10px; }
    </style>

    <div class="wln-header">
      <h3 class="wln-header-title">
        Notifications
        <span id="wlNotifsTotal" style="font-weight:400; font-size:12px; color:var(--wl-muted,#94a3b8); margin-left:4px;"></span>
      </h3>
      <div class="wln-header-actions">
        <button id="wlNotifsReadAll"  class="wl-btn" type="button" style="font-size:11px; padding:4px 10px; font-weight:700;">Mark all read</button>
        <button id="wlNotifsClearAll" class="wl-btn" type="button" style="font-size:11px; padding:4px 10px;">Clear all</button>
      </div>
    </div>
    <div id="wlNotifsList" class="wln-list"></div>
  `;

  // Header button listeners
  panel.querySelector("#wlNotifsReadAll").addEventListener("click", async (e) => {
    e.stopPropagation();
    await markAllAsRead();
    _notifs = _notifs.map(n => ({ ...n, is_read: true }));
    _unread = 0;
    renderBadge();
    renderList();
  });

  panel.querySelector("#wlNotifsClearAll").addEventListener("click", async (e) => {
    e.stopPropagation();
    if (!confirm("Clear all notifications?")) return;
    await clearAllNotifications();
    _notifs = [];
    _unread = 0;
    renderBadge();
    renderList();
  });

  return panel;
}

// ─── Render ───────────────────────────────────────────────────────────────────

function renderList() {
  const list = document.querySelector("#wlNotifsList");
  if (!list) return;

  const countEl = document.querySelector("#wlNotifsTotal");
  if (countEl) countEl.textContent = _notifs.length ? `(${_notifs.length})` : "";

  if (!_notifs.length) {
    list.innerHTML = `
      <div class="wln-empty">
        <div class="wln-empty-icon">🔔</div>
        <strong>All caught up</strong>
        <p style="margin:6px 0 0;">New notifications will appear here.</p>
      </div>`;
    return;
  }

  list.innerHTML = _notifs.map(itemHTML).join("");

  // Wire item events
  list.querySelectorAll("[data-nid]").forEach((el) => {
    const id   = el.dataset.nid;
    const link = el.dataset.link;

    el.addEventListener("click", async (evt) => {
      if (evt.target.closest(".wln-dismiss")) return;
      await handleRead(id);
      if (link) window.location.href = link;
    });

    el.querySelector(".wln-dismiss")?.addEventListener("click", async (evt) => {
      evt.stopPropagation();
      await handleDelete(id);
    });
  });
}

function itemHTML(n) {
  const icon   = ICONS[n.type] ?? ICONS.DEFAULT;
  const unread = !n.is_read;
  return `
    <div class="wln-item${unread ? " unread" : ""}"
         data-nid="${esc(n.id)}"
         data-link="${esc(n.link ?? "")}"
         role="button" tabindex="0"
         aria-label="${esc(n.title)}">
      <div class="wln-icon">${icon}</div>
      <div class="wln-body">
        <div class="wln-title">${esc(n.title)}</div>
        ${n.body ? `<div class="wln-text">${esc(n.body)}</div>` : ""}
        <div class="wln-time">${relativeTime(n.created_at)}</div>
      </div>
      <button class="wln-dismiss" type="button" aria-label="Dismiss">✕</button>
      ${unread ? `<span class="wln-unread-dot" aria-hidden="true"></span>` : ""}
    </div>`;
}

function renderBadge() {
  if (!$badge) return;
  if (_unread > 0) {
    $badge.textContent = _unread > 99 ? "99+" : String(_unread);
    $badge.style.display = "flex";
  } else {
    $badge.style.display = "none";
  }
}

// ─── Event handlers ───────────────────────────────────────────────────────────

function onBellClick(e) {
  e.stopPropagation();
  _open = !_open;

  if (_open) {
    $panel.style.display = "block";
    $panel.classList.add("wl-panel-open");
    renderList();
    // Remove class after animation so re-opening re-triggers it
    setTimeout(() => $panel.classList.remove("wl-panel-open"), 200);
  } else {
    $panel.style.display = "none";
  }
}

function onOutsideClick(e) {
  if (!_open) return;
  const wrapper = document.querySelector("#wlBellWrapper");
  if (wrapper && !wrapper.contains(e.target)) {
    _open = false;
    $panel.style.display = "none";
  }
}

function onNewNotification(row) {
  _notifs = [row, ..._notifs].slice(0, 40);
  _unread++;
  renderBadge();
  if (_open) renderList();

  // Shake the bell
  if ($bell) {
    $bell.style.animation = "none";
    requestAnimationFrame(() => {
      $bell.style.animation = "wlBellShake .5s ease";
    });
  }
}

// ─── State helpers ────────────────────────────────────────────────────────────

async function refresh() {
  try {
    const [notifs, count] = await Promise.all([
      listNotifications({ limit: 40 }),
      getUnreadCount(),
    ]);
    _notifs = notifs;
    _unread = count;
    renderBadge();
  } catch (err) {
    console.warn("[notifications] Failed to load:", err.message);
  }
}

async function handleRead(id) {
  const n = _notifs.find(x => x.id === id);
  if (!n || n.is_read) return;
  try {
    await markAsRead(id);
    n.is_read = true;
    _unread = Math.max(0, _unread - 1);
    renderBadge();
    renderList();
  } catch (err) {
    console.warn("[notifications] markAsRead failed:", err.message);
  }
}

async function handleDelete(id) {
  const n = _notifs.find(x => x.id === id);
  try {
    await deleteNotification(id);
    if (n && !n.is_read) _unread = Math.max(0, _unread - 1);
    _notifs = _notifs.filter(x => x.id !== id);
    renderBadge();
    renderList();
  } catch (err) {
    console.warn("[notifications] delete failed:", err.message);
  }
}

// ─── Utils ────────────────────────────────────────────────────────────────────

function relativeTime(iso) {
  if (!iso) return "";
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60)    return "Just now";
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

function esc(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}
