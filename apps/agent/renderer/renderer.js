// Window UI. Plain JavaScript, no framework: it only shows what the app
// reports (window.agent.onView) and sends button clicks back.
"use strict";

const root = document.getElementById("app");
let view = null;
let layoutKey = "";
let busy = false;
let loginError = "";

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function hm(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

function hms(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

const time = (iso) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

function ago(ms) {
  if (!ms) return "not yet";
  const min = Math.round((Date.now() - ms) / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  return `${Math.round(min / 60)} h ago`;
}

// ---------------------------------------------------------------------
// Screens
// ---------------------------------------------------------------------
function header() {
  return `<div class="brand"><div class="logo">${esc(view.appName[0])}</div><div><strong>${esc(view.appName)}</strong>${
    view.account ? `<div class="small muted truncate">${esc(view.account.orgName)}</div>` : ""
  }</div></div>`;
}

function loginScreen() {
  const msg = loginError || view.loginMessage;
  return `
    ${header()}
    <div>
      <h1>Log in</h1>
      <p class="muted m0">Use the same email and password as the dashboard.</p>
    </div>
    <form class="card" id="login-form">
      <div class="field"><label for="email">Email</label><input id="email" type="email" autocomplete="email" required /></div>
      <div class="field"><label for="password">Password</label><input id="password" type="password" autocomplete="current-password" required /></div>
      ${msg ? `<p class="error">${esc(msg)}</p>` : ""}
      <button class="primary full" type="submit" ${busy ? "disabled" : ""}>${busy ? "Logging in…" : "Log in"}</button>
      <div class="row mt12">
        <button type="button" class="link small" data-action="forgot">Forgot password?</button>
        <span class="small muted">No account? Ask your admin to invite you.</span>
      </div>
    </form>`;
}

function consentScreen() {
  const s = view.settings;
  const item = (ok, text) => `<li><span class="${ok ? "yes" : "no"}">${ok ? "✓" : "✕"}</span><span>${text}</span></li>`;
  return `
    ${header()}
    <div>
      <h1>Before you start</h1>
      <p class="muted m0">${esc(view.account.orgName)} uses this app to record work time. Here is exactly what it collects.</p>
    </div>
    <div class="card">
      <h2>Only while you are clocked in</h2>
      <ul class="list">
        ${item(true, "When you clock in and out")}
        ${item(true, "Whether the keyboard or mouse is in use, never what you type")}
        ${item(s.track_apps, s.track_apps ? "Which app is open and its window title" : "Apps and websites are <strong>not</strong> recorded")}
        ${item(false, "No screenshots, webcam, microphone or keystrokes")}
      </ul>
      <p class="small muted mt10">Nothing is recorded when you are clocked out. Your company admins and your team manager can see this data, and so can you on <em>My activity</em> in the dashboard.</p>
    </div>
    <button class="primary full" data-action="consent">I understand, continue</button>
    <button class="secondary full" data-action="decline">Log out</button>`;
}

function mainScreen() {
  const v = view;
  const prompt = v.idlePrompt;
  return `
    <div class="row">${header()}<button class="link small" data-action="logout">Log out</button></div>
    ${v.notice ? `<div class="notice"><span>${esc(v.notice)}</span><button class="link small" data-action="dismiss">OK</button></div>` : ""}
    ${
      prompt
        ? `<div class="card idle-card">
             <h2>You were away for ${prompt.minutes} min</h2>
             <p class="small muted mb10">From ${time(prompt.startedAt)} to ${time(prompt.endedAt)}. Was this work (a meeting, a call, reading)?</p>
             <input type="text" id="idle-reason" maxlength="200" placeholder="What were you doing? (optional)" />
             <div class="buttons">
               <button class="primary" data-action="keep-idle" data-id="${esc(prompt.id)}">Yes, count it</button>
               <button class="secondary" data-action="discard-idle" data-id="${esc(prompt.id)}">No, remove it</button>
             </div>
           </div>`
        : ""
    }
    <div class="card">
      <div class="row">
        <span class="status" id="status"></span>
        <span class="small muted">Hi, ${esc(v.account.name.split(" ")[0])}</span>
      </div>
      <div class="timer" id="timer">00:00:00</div>
      ${
        v.clockedIn
          ? `<button class="clock-out full" data-action="clock-out">Clock out</button>`
          : `<button class="clock-in full" data-action="clock-in">Clock in</button>`
      }
    </div>
    <div class="stats">
      <div class="card stat"><div class="small muted">Today</div><div class="value" id="today">0h 00m</div></div>
      <div class="card stat"><div class="small muted">Activity</div><div class="value" id="activity">–</div></div>
    </div>
    <div class="small muted truncate" id="current-app"></div>
    <div class="footer">
      <span id="sync"></span>
      <button class="link small" data-action="my-activity">My activity ↗</button>
    </div>`;
}

// ---------------------------------------------------------------------
// Rendering: rebuild the layout only when it changes, update numbers in place
// ---------------------------------------------------------------------
function render() {
  if (!view) return;
  const key = JSON.stringify([
    view.screen,
    view.clockedIn,
    view.idlePrompt && view.idlePrompt.id,
    view.notice,
    view.loginMessage,
    loginError,
    busy,
    view.screen === "consent" ? view.settings : null,
  ]);
  if (key !== layoutKey) {
    layoutKey = key;
    root.innerHTML =
      view.screen === "login" ? loginScreen() : view.screen === "consent" ? consentScreen() : mainScreen();
    const email = document.getElementById("email");
    if (email) email.focus();
  }
  updateLive();
}

function updateLive() {
  if (!view || view.screen !== "main") return;
  const v = view;
  const set = (id, html) => {
    const el = document.getElementById(id);
    if (el && el.innerHTML !== html) el.innerHTML = html;
  };

  const now = Date.now() + (v.clockOffsetMs || 0);
  const sessionSeconds = v.sessionStartedAt ? (now - Date.parse(v.sessionStartedAt)) / 1000 : 0;
  set("timer", hms(v.clockedIn ? sessionSeconds : 0));

  const dot = v.clockedIn ? (v.idleNow ? "idle" : "on") : "";
  const label = v.clockedIn ? (v.idleNow ? "Idle" : "Working") : "Not clocked in";
  set("status", `<span class="dot ${dot}"></span>${label}`);

  set("today", hm(v.todayTracked));
  set("activity", v.todayTracked > 60 ? `${Math.round((v.todayActive / v.todayTracked) * 100)}%` : "–");
  set(
    "current-app",
    v.clockedIn && v.currentApp ? `Now: ${esc(v.currentApp)}` : v.clockedIn && !v.settings.track_apps ? "Apps are not tracked" : "",
  );

  const s = v.sync;
  set(
    "sync",
    s.error
      ? `<span class="err-text">Upload problem: ${esc(s.error)}</span> <button class="link small" data-action="retry">Retry</button>`
      : !s.online
        ? `● Offline. Your time is saved and uploads when you're back online${s.pending ? ` (${s.pending} waiting)` : ""}.`
        : `● Synced ${ago(s.lastSyncAt)}`,
  );
}

// ---------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------
root.addEventListener("submit", async (e) => {
  if (e.target.id !== "login-form") return;
  e.preventDefault();
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;
  busy = true;
  loginError = "";
  render();
  const res = await window.agent.login(email, password);
  busy = false;
  loginError = res.ok ? "" : res.error;
  render();
  if (!res.ok) {
    const el = document.getElementById("email");
    if (el) el.value = email;
  }
});

root.addEventListener("click", async (e) => {
  const el = e.target.closest("[data-action]");
  if (!el) return;
  const action = el.dataset.action;
  switch (action) {
    case "forgot":
      return window.agent.openDashboard("/forgot-password");
    case "consent":
      return window.agent.consent();
    case "decline":
      return window.agent.declineConsent();
    case "logout":
      return window.agent.logout();
    case "clock-in":
      return window.agent.clockIn();
    case "clock-out":
      el.disabled = true;
      return window.agent.clockOut();
    case "keep-idle": {
      const reason = (document.getElementById("idle-reason") || {}).value || null;
      return window.agent.answerIdle(el.dataset.id, true, reason);
    }
    case "discard-idle":
      return window.agent.answerIdle(el.dataset.id, false, null);
    case "dismiss":
      return window.agent.dismissNotice();
    case "my-activity":
      return window.agent.openDashboard("/dashboard/activity");
    case "retry":
      return window.agent.retrySync();
  }
});

window.agent.onView((v) => {
  view = v;
  render();
});
window.agent.getView().then((v) => {
  view = v;
  render();
});
setInterval(updateLive, 1000);
