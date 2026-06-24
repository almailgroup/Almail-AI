import { db, auth } from "./firebase.js";
import {
  collection, addDoc, query, onSnapshot,
  serverTimestamp, deleteDoc, doc, updateDoc, getDocs, where
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import {
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

import { AI_CONFIG } from "./config.js";

// ── State ─────────────────────────────────────────────────
let currentUser       = null;
let currentChatId     = null;
let deleteId          = null;
let msgUnsubscribe    = null;
let pendingAttachment = null;
let isResponding      = false;
let currentMessages   = [];
let pendingDeleteChatId = null;
let abortController    = null;   // aborts an in-flight AI stream
let streaming         = null;   // { text, started } while a reply streams in

// ── Chat metadata in localStorage ─────────────────────────
function loadChats()    { return JSON.parse(localStorage.getItem("chats_v2") || "[]"); }
function saveChats(c)   { localStorage.setItem("chats_v2", JSON.stringify(c)); }
function genId()        { return Date.now().toString(36) + Math.random().toString(36).slice(2); }

function createChat() {
  const id = genId();
  const chats = loadChats();
  chats.unshift({ id, title: "New chat", ts: Date.now(), pinned: false });
  saveChats(chats);
  return id;
}

function deleteChat(chatId) {
  pendingDeleteChatId = chatId;
  document.getElementById("deleteChatModal").style.display = "flex";
}

async function confirmDeleteChat() {
  if (!pendingDeleteChatId) return;
  const chatId = pendingDeleteChatId;
  pendingDeleteChatId = null;
  document.getElementById("deleteChatModal").style.display = "none";

  // Remove this chat's messages from Firestore so they don't pile up as orphans.
  if (currentUser) {
    try {
      const snap = await getDocs(query(
        collection(db, "users", currentUser.uid, "messages"),
        where("chatId", "==", chatId)
      ));
      await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
    } catch (err) {
      console.error("Failed to delete chat messages:", err);
    }
  }

  saveChats(loadChats().filter(c => c.id !== chatId));
  if (currentChatId === chatId) {
    const remaining = loadChats();
    const newId = remaining.length ? remaining[0].id : createChat();
    switchToChat(newId);
  } else {
    renderChatList();
  }
}

function togglePin(chatId) {
  const chats = loadChats();
  const c = chats.find(c => c.id === chatId);
  if (c) { c.pinned = !c.pinned; saveChats(chats); }
  renderChatList();
}

function renameChat(chatId, newTitle) {
  const chats = loadChats();
  const c = chats.find(c => c.id === chatId);
  if (c && newTitle.trim()) { c.title = newTitle.trim(); saveChats(chats); }
  renderChatList();
}

function setChatTitle(chatId, title) {
  const chats = loadChats();
  const c = chats.find(c => c.id === chatId);
  if (c && c.title === "New chat" && title) { c.title = title; saveChats(chats); }
  renderChatList();
}

function renderChatList() {
  const chatList = document.getElementById("chatList");
  if (!chatList) return;
  chatList.innerHTML = "";

  const all    = loadChats();
  const pinned = all.filter(c => c.pinned);
  const normal = all.filter(c => !c.pinned);

  if (pinned.length) {
    const label = document.createElement("div");
    label.className = "chat-section-label";
    label.textContent = "Pinned";
    chatList.appendChild(label);
    pinned.forEach(chat => chatList.appendChild(buildChatItem(chat)));

    if (normal.length) {
      const label2 = document.createElement("div");
      label2.className = "chat-section-label";
      label2.textContent = "Chats";
      chatList.appendChild(label2);
    }
  }

  normal.forEach(chat => chatList.appendChild(buildChatItem(chat)));
}

function buildChatItem(chat) {
  const wrap = document.createElement("div");
  wrap.className = "chat-item-wrap";

  const btn = document.createElement("button");
  btn.className = `chat-item${chat.id === currentChatId ? " active" : ""}${chat.pinned ? " pinned" : ""}`;
  btn.dataset.chatId = chat.id;

  const titleSpan = document.createElement("span");
  titleSpan.className = "chat-title";
  titleSpan.textContent = chat.title;

  btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`;
  btn.appendChild(titleSpan);
  btn.onclick = (e) => { e.stopPropagation(); switchToChat(chat.id); };

  // Actions: pin, rename, delete
  const actions = document.createElement("div");
  actions.className = "chat-item-actions";

  const pinBtn = document.createElement("button");
  pinBtn.className = `chat-action-btn${chat.pinned ? " active" : ""}`;
  pinBtn.title = chat.pinned ? "Unpin" : "Pin";
  pinBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="${chat.pinned ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`;
  pinBtn.onclick = (e) => { e.stopPropagation(); togglePin(chat.id); };

  const renBtn = document.createElement("button");
  renBtn.className = "chat-action-btn";
  renBtn.title = "Rename";
  renBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
  renBtn.onclick = (e) => {
    e.stopPropagation();
    const input = document.createElement("input");
    input.className = "chat-rename-input";
    input.value = chat.title;
    titleSpan.replaceWith(input);
    input.focus();
    input.select();
    const save = () => renameChat(chat.id, input.value || chat.title);
    input.addEventListener("keydown", ev => {
      if (ev.key === "Enter") { ev.preventDefault(); save(); }
      if (ev.key === "Escape") renderChatList();
    });
    input.addEventListener("blur", save);
  };

  const delBtn = document.createElement("button");
  delBtn.className = "chat-action-btn delete";
  delBtn.title = "Delete";
  delBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
  delBtn.onclick = (e) => { e.stopPropagation(); deleteChat(chat.id); };

  actions.append(pinBtn, renBtn, delBtn);
  wrap.append(btn, actions);
  return wrap;
}

function switchToChat(chatId) {
  // Leaving a chat mid-generation: stop the stream so the reply doesn't bleed
  // into the new chat. (Re-selecting the current chat must NOT cancel it.)
  if (chatId !== currentChatId) cancelGeneration();
  currentChatId = chatId;
  localStorage.setItem("currentChatId", chatId);
  document.querySelectorAll(".chat-item").forEach(el =>
    el.classList.toggle("active", el.dataset.chatId === chatId)
  );
  if (window.innerWidth < 900) closeSidebar();
  startMsgListener();
}

// Abort an in-flight AI stream and clear its transient bubble.
function cancelGeneration() {
  if (abortController) { try { abortController.abort(); } catch (_) {} }
  streaming = null;
  document.getElementById("streamingMsg")?.remove();
}

function initChats() {
  const chats = loadChats();
  if (chats.length === 0) {
    currentChatId = createChat();
  } else {
    const savedId = localStorage.getItem("currentChatId");
    currentChatId = (savedId && chats.some(c => c.id === savedId)) ? savedId : chats[0].id;
  }
  localStorage.setItem("currentChatId", currentChatId);
  renderChatList();
  startMsgListener();
}

// ── Elements ──────────────────────────────────────────────
const appEl           = document.getElementById("app");
const authModal       = document.getElementById("authModal");
const emailInput      = document.getElementById("emailInput");
const passInput       = document.getElementById("passwordInput");
const loginBtn        = document.getElementById("loginBtn");
const registerBtn     = document.getElementById("registerBtn");
const toggleMode      = document.getElementById("toggleAuthMode");
const errorEl         = document.getElementById("authError");
const openAuthBtn     = document.getElementById("openAuthBtn");
const messagesEl      = document.getElementById("messages");
const inputEl         = document.getElementById("messageInput");
const sendBtn         = document.getElementById("sendBtn");
const typingEl        = document.getElementById("typingIndicator");
const logoutBtn       = document.getElementById("logoutBtn");
const resetBtn        = document.getElementById("resetChatBtn");
const deleteModal     = document.getElementById("deleteModal");
const settingsBtn     = document.getElementById("settingsBtn");
const settingsPopup   = document.getElementById("settingsPopup");
const attachBtn       = document.getElementById("attachBtn");
const fileInput       = document.getElementById("fileInput");
const filePreview     = document.getElementById("filePreview");
const filePreviewName = document.getElementById("filePreviewName");
const attachPopup     = document.getElementById("attachPopup");

// ── Sidebar ───────────────────────────────────────────────
const sidebarToggle   = document.getElementById("sidebarToggle");
const sidebarClose    = document.getElementById("sidebarClose");
const sidebarBackdrop = document.getElementById("sidebarBackdrop");
const isDesktop = () => window.matchMedia("(min-width: 900px)").matches;

function openSidebar()  { appEl.classList.add("sidebar-open"); localStorage.setItem("sidebar", "open"); }
function closeSidebar() { appEl.classList.remove("sidebar-open"); localStorage.setItem("sidebar", "closed"); }

if (isDesktop()) {
  appEl.classList.toggle("sidebar-open", localStorage.getItem("sidebar") !== "closed");
} else {
  appEl.classList.remove("sidebar-open");
}

sidebarToggle.onclick   = openSidebar;
sidebarClose.onclick    = (e) => { e.stopPropagation(); appEl.classList.contains("sidebar-open") ? closeSidebar() : openSidebar(); };
sidebarBackdrop.onclick = closeSidebar;

// Click on collapsed sidebar strip to open it (desktop only)
document.getElementById("sidebar").addEventListener("click", () => {
  if (window.innerWidth >= 900 && !appEl.classList.contains("sidebar-open")) openSidebar();
});

// ── Mobile swipe gestures for sidebar ────────────────────
(function () {
  const EDGE_ZONE = 60;   // px from left edge to trigger open-swipe
  const MIN_SWIPE = 45;   // px horizontal travel to fire action
  const MAX_VERT  = 70;   // px vertical drift before cancelling

  let startX = 0, startY = 0, active = false, done = false;

  document.addEventListener("touchstart", (e) => {
    if (e.touches.length > 1) return;
    const t = e.touches[0];
    startX = t.clientX;
    startY = t.clientY;
    done = false;
    const open = appEl.classList.contains("sidebar-open");
    active = open || startX <= EDGE_ZONE;
  }, { passive: true });

  document.addEventListener("touchmove", (e) => {
    if (!active || done || e.touches.length > 1) return;
    const t = e.touches[0];
    const dx = t.clientX - startX;
    const dy = t.clientY - startY;
    if (Math.abs(dy) > MAX_VERT) { active = false; return; }
    const open = appEl.classList.contains("sidebar-open");
    if (!open && dx >= MIN_SWIPE)  { done = true; openSidebar(); }
    else if (open && dx <= -MIN_SWIPE) { done = true; closeSidebar(); }
  }, { passive: true });

  document.addEventListener("touchend", () => { active = false; done = false; }, { passive: true });
})();

// ── Disable zoom on mobile ────────────────────────────────
// iOS: block pinch zoom via gesture events
document.addEventListener("gesturestart",  (e) => e.preventDefault(), { passive: false });
document.addEventListener("gesturechange", (e) => e.preventDefault(), { passive: false });
// Android + iOS: block pinch zoom via multi-touch move
document.addEventListener("touchmove", (e) => {
  if (e.touches.length > 1) e.preventDefault();
}, { passive: false });

// ── Collapsed icon strip ──────────────────────────────────
document.getElementById("si-new").onclick    = () => document.getElementById("resetChatBtn").click();
document.getElementById("si-chats").onclick  = openSidebar;
document.getElementById("si-expand").onclick = openSidebar;
document.getElementById("si-account").onclick = () => {
  if (currentUser) document.getElementById("logoutBtn").click();
  else document.getElementById("openAuthBtn").click();
};

function updateSiAccount(user) {
  const btn    = document.getElementById("si-account");
  const letter = btn.querySelector(".si-avatar-letter");
  if (user && user.email) {
    letter.textContent = user.email[0].toUpperCase();
    btn.classList.add("has-avatar");
    btn.title = user.email;
  } else {
    letter.textContent = "";
    btn.classList.remove("has-avatar");
    btn.title = "Account";
  }
}

// ── Settings popup ────────────────────────────────────────
function openSettingsPopup() {
  const rect = settingsBtn.getBoundingClientRect();
  settingsPopup.style.left   = `${rect.left}px`;
  settingsPopup.style.bottom = `${window.innerHeight - rect.top + 8}px`;
  settingsPopup.classList.add("open");
}
settingsBtn.onclick = (e) => {
  e.stopPropagation();
  settingsPopup.classList.contains("open") ? settingsPopup.classList.remove("open") : openSettingsPopup();
};

// ── Theme ─────────────────────────────────────────────────
let isLight = localStorage.getItem("theme") !== "dark";
document.body.classList.toggle("light", isLight);

function applyThemeUI() {
  document.getElementById("checkDark").classList.toggle("visible", !isLight);
  document.getElementById("checkLight").classList.toggle("visible", isLight);
}
applyThemeUI();

function applyLogoTheme() {
  document.querySelectorAll(".brand-logo").forEach(img => {
    img.src = isLight ? "Almail-AI-Black-Logo.png" : "Almail AI Logo.png";
  });
}

function setTheme(light) {
  isLight = light;
  document.body.classList.toggle("light", isLight);
  localStorage.setItem("theme", isLight ? "light" : "dark");
  applyThemeUI();
  applyLogoTheme();
  settingsPopup.classList.remove("open");
}

applyLogoTheme();
document.getElementById("themeDarkBtn").onclick  = () => setTheme(false);
document.getElementById("themeLightBtn").onclick = () => setTheme(true);

// ── Textarea auto-resize ──────────────────────────────────
function autoResize() {
  inputEl.style.height = "24px";
  inputEl.style.height = Math.min(inputEl.scrollHeight, 130) + "px";
  inputEl.style.lineHeight = inputEl.scrollHeight > 24 ? "1.5" : "24px";
  inputEl.style.overflowY = inputEl.scrollHeight >= 130 ? "auto" : "hidden";
}
inputEl.addEventListener("input", autoResize);

// ── Attach popup ──────────────────────────────────────────
attachBtn.onclick = (e) => { e.stopPropagation(); attachPopup.classList.toggle("open"); };
document.getElementById("attachFilesBtn").onclick = () => { attachPopup.classList.remove("open"); fileInput.click(); };

fileInput.onchange = async () => {
  const file = fileInput.files[0];
  if (!file) return;
  fileInput.value = "";
  if (file.type.startsWith("image/")) {
    const reader = new FileReader();
    reader.onload = () => {
      pendingAttachment = { type: "image", data: reader.result.split(",")[1], mimeType: file.type, name: file.name };
      filePreviewName.textContent = file.name;
      filePreview.style.display = "flex";
    };
    reader.readAsDataURL(file);
  } else {
    const text = await file.text();
    pendingAttachment = { type: "text", content: text, name: file.name };
    filePreviewName.textContent = file.name;
    filePreview.style.display = "flex";
  }
};
document.getElementById("fileRemoveBtn").onclick = () => { pendingAttachment = null; filePreview.style.display = "none"; };

// ── Global popups close on outside click ──────────────────
document.addEventListener("click", (e) => {
  if (!settingsPopup.contains(e.target) && e.target !== settingsBtn) settingsPopup.classList.remove("open");
  if (!attachPopup.contains(e.target)   && e.target !== attachBtn)   attachPopup.classList.remove("open");
  if (!e.target.closest(".menu-btn") && !e.target.closest(".menu"))
    document.querySelectorAll(".menu.open").forEach(m => m.classList.remove("open"));
});

// ── Auth modal ────────────────────────────────────────────
let isLoginMode = true;

function updateAuthUI() {
  document.getElementById("authTitle").textContent = isLoginMode ? "Welcome back" : "Create account";
  loginBtn.style.display    = isLoginMode ? "block" : "none";
  registerBtn.style.display = isLoginMode ? "none"  : "block";
  toggleMode.textContent    = isLoginMode ? "Don't have an account? Register" : "Already have an account? Log in";
  errorEl.textContent = "";
}
function openAuthModal()  { updateAuthUI(); authModal.style.display = "flex"; emailInput.focus(); }
function closeAuthModal() { authModal.style.display = "none"; errorEl.textContent = ""; }

openAuthBtn.onclick = openAuthModal;
document.getElementById("authClose").onclick = closeAuthModal;
toggleMode.onclick  = () => { isLoginMode = !isLoginMode; updateAuthUI(); };
authModal.addEventListener("click", e => { if (e.target === authModal) closeAuthModal(); });

async function handleAuth(isRegister = false) {
  const email = emailInput.value.trim(), password = passInput.value.trim();
  if (!email || !password) { errorEl.textContent = "Please fill in all fields"; return; }
  errorEl.textContent = "";
  const btn = isRegister ? registerBtn : loginBtn;
  btn.disabled = true;
  try {
    if (isRegister) await createUserWithEmailAndPassword(auth, email, password);
    else            await signInWithEmailAndPassword(auth, email, password);
  } catch (err) {
    const map = {
      "auth/invalid-email": "That doesn't look like a valid email.",
      "auth/user-not-found": "No account with this email.",
      "auth/wrong-password": "Incorrect email or password.",
      "auth/invalid-credential": "Incorrect email or password.",
      "auth/email-already-in-use": "This email is already registered.",
      "auth/weak-password": "Password must be at least 6 characters.",
      "auth/too-many-requests": "Too many attempts. Please wait a moment.",
      "auth/network-request-failed": "Network error. Check your connection."
    };
    errorEl.textContent = map[err.code] || "Something went wrong. Please try again.";
  } finally {
    btn.disabled = false;
  }
}
loginBtn.onclick    = () => handleAuth(false);
registerBtn.onclick = () => handleAuth(true);
passInput.addEventListener("keydown", e => { if (e.key === "Enter") handleAuth(!isLoginMode); });
logoutBtn.onclick   = () => signOut(auth);

// ── Markdown, sanitizing & code highlighting ──────────────
// Open links in a new tab safely.
if (window.DOMPurify) {
  DOMPurify.addHook("afterSanitizeAttributes", node => {
    if (node.tagName === "A") {
      node.setAttribute("target", "_blank");
      node.setAttribute("rel", "noopener noreferrer");
    }
  });
}

// marked already autolinks URLs (gfm); DOMPurify strips any unsafe HTML.
function renderMarkdown(text) {
  const raw = marked.parse(text || "", { breaks: true, gfm: true });
  return window.DOMPurify ? DOMPurify.sanitize(raw) : raw;
}

const COPY_SVG  = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
const CHECK_SVG = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;

// Wrap each <pre><code> in a header bar (language + copy button) and highlight.
function enhanceCodeBlocks(container) {
  container.querySelectorAll("pre > code").forEach(codeEl => {
    const pre = codeEl.parentElement;
    if (pre.parentElement?.classList.contains("code-block")) return;

    const langClass = [...codeEl.classList].find(c => c.startsWith("language-"));
    const lang = langClass ? langClass.replace("language-", "") : "";

    if (window.hljs) { try { hljs.highlightElement(codeEl); } catch (_) {} }

    const wrapper = document.createElement("div");
    wrapper.className = "code-block";

    const header = document.createElement("div");
    header.className = "code-block-header";
    header.innerHTML = `<span class="code-lang">${lang || "code"}</span>`;

    const copyBtn = document.createElement("button");
    copyBtn.className = "copy-code";
    copyBtn.innerHTML = `${COPY_SVG} Copy`;
    copyBtn.onclick = () => {
      navigator.clipboard.writeText(codeEl.innerText);
      copyBtn.innerHTML = `${CHECK_SVG} Copied`;
      setTimeout(() => { copyBtn.innerHTML = `${COPY_SVG} Copy`; }, 1500);
    };
    header.appendChild(copyBtn);

    pre.replaceWith(wrapper);
    wrapper.append(header, pre);
  });
}

// ── Scroll helpers ────────────────────────────────────────
function isNearBottom() {
  return messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < 120;
}
function scrollToBottom(smooth = true) {
  messagesEl.scrollTo({ top: messagesEl.scrollHeight, behavior: smooth ? "smooth" : "auto" });
}

// Floating "jump to latest" button — visible only when scrolled up.
const scrollBottomBtn = document.getElementById("scrollBottomBtn");
messagesEl.addEventListener("scroll", () => {
  scrollBottomBtn.classList.toggle("visible", !isNearBottom());
});
scrollBottomBtn.onclick = () => scrollToBottom(true);

// ── Streaming reply bubble ────────────────────────────────
// Renders/updates the transient assistant bubble while a reply streams in.
// Survives Firestore snapshot re-renders because renderMessages re-invokes it.
function renderStreamingBubble() {
  if (!streaming || !streaming.started) return;
  let div = document.getElementById("streamingMsg");
  if (!div) {
    div = document.createElement("div");
    div.className = "message other group-tail";
    div.id = "streamingMsg";
    const textDiv = document.createElement("div");
    textDiv.className = "message-text";
    textDiv.id = "streamText";
    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = "Almail AI";
    div.append(textDiv, meta);
    messagesEl.appendChild(div);
  }
  document.getElementById("streamText").innerHTML =
    renderMarkdown(streaming.text) + '<span class="stream-cursor"></span>';
}

let rafPending = false, rafStick = false;
function scheduleStreamRender(stick) {
  rafStick = rafStick || stick;
  if (rafPending) return;
  rafPending = true;
  requestAnimationFrame(() => {
    rafPending = false;
    renderStreamingBubble();
    if (rafStick) { scrollToBottom(false); rafStick = false; }
  });
}

// ── Render messages ───────────────────────────────────────
function renderMessages(docs) {
  // Remember which IDs are already rendered so we don't re-animate them
  const alreadyRendered = new Set(
    [...messagesEl.querySelectorAll(".message[data-id]")].map(el => el.dataset.id)
  );

  messagesEl.innerHTML = "";

  if (docs.length === 0) {
    messagesEl.innerHTML = `
      <div class="empty-state">
        <h2>How can I help you?</h2>
        <p>Ask me anything — I'm ready to help.</p>
        <div class="suggestions">
          <button class="chip" data-prompt="Explain a complex topic in simple terms">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.66 18h4.68M12 2a7 7 0 0 1 4 12.7c-.5.4-.8 1-.8 1.6V17H8.8v-.7c0-.6-.3-1.2-.8-1.6A7 7 0 0 1 12 2z"/></svg>
            Explain something simply
          </button>
          <button class="chip" data-prompt="Help me write a professional email">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 5L2 7"/></svg>
            Draft a professional email
          </button>
          <button class="chip" data-prompt="Give me some creative ideas to brainstorm">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3z"/></svg>
            Brainstorm creative ideas
          </button>
          <button class="chip" data-prompt="Write a Python function to check if a number is prime, with comments">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
            Write some code
          </button>
        </div>
      </div>`;
    messagesEl.querySelectorAll(".chip").forEach(chip => {
      chip.onclick = () => {
        if (!currentUser || isResponding) return;
        inputEl.value = chip.dataset.prompt;
        sendMessage();
      };
    });
    return;
  }

  docs.forEach((docSnap, i) => {
    const msg       = docSnap.data();
    const isOwn     = msg.role === "user";
    const prevRole  = i > 0 ? docs[i - 1].data().role : null;
    const nextRole  = i < docs.length - 1 ? docs[i + 1].data().role : null;
    const grouped   = prevRole === msg.role;
    const groupTail = nextRole !== msg.role;

    const div = document.createElement("div");
    div.dataset.id = docSnap.id;
    div.className = ["message", isOwn ? "self" : "other",
      grouped ? "grouped" : "", groupTail ? "group-tail" : ""].filter(Boolean).join(" ");
    if (alreadyRendered.has(docSnap.id)) div.style.animation = "none";

    const textDiv = document.createElement("div");
    textDiv.className = "message-text";
    textDiv.innerHTML = renderMarkdown(msg.content);
    enhanceCodeBlocks(textDiv);

    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = `${isOwn ? "You" : "Almail AI"} · ${formatTime(msg.timestamp)}`;

    div.append(textDiv, meta);

    // Context menu button (own messages only)
    if (isOwn) {
      const menuBtn = document.createElement("button");
      menuBtn.className = "menu-btn";
      menuBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="1.2" fill="currentColor"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/><circle cx="12" cy="19" r="1.2" fill="currentColor"/></svg>`;

      const menu = document.createElement("div");
      menu.className = "menu";

      const copyBtn = document.createElement("button");
      copyBtn.className = "copy";
      copyBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copy`;
      copyBtn.onclick = (e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(msg.content || "");
        copyBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Copied!`;
        setTimeout(() => { copyBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copy`; }, 1500);
        menu.classList.remove("open");
      };
      menu.appendChild(copyBtn);

      const editBtn = document.createElement("button");
      editBtn.className = "edit";
      editBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> Edit`;
      editBtn.onclick = (e) => {
        e.stopPropagation();
        menu.classList.remove("open");
        const editArea = document.createElement("textarea");
        editArea.className = "edit-textarea";
        editArea.value = msg.content || "";
        textDiv.replaceWith(editArea);
        editArea.focus();
        editArea.addEventListener("keydown", async (ev) => {
          if (ev.key === "Enter" && !ev.shiftKey) {
            ev.preventDefault();
            const newText = editArea.value.trim();
            if (newText && newText !== msg.content)
              await updateDoc(doc(db, "users", currentUser.uid, "messages", docSnap.id), { content: newText });
          }
          if (ev.key === "Escape") editArea.replaceWith(textDiv);
        });
      };

      const delBtn = document.createElement("button");
      delBtn.className = "delete";
      delBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg> Delete`;
      delBtn.onclick = (e) => {
        e.stopPropagation();
        menu.classList.remove("open");
        div.classList.add("wobbly-strong");
        setTimeout(() => {
          div.classList.remove("wobbly-strong");
          setTimeout(() => { deleteId = docSnap.id; deleteModal.style.display = "flex"; }, 50);
        }, 900);
      };

      menu.append(editBtn, delBtn);

      menuBtn.onclick = (e) => {
        e.stopPropagation();
        const isOpen = menu.classList.contains("open");
        document.querySelectorAll(".menu.open").forEach(m => m.classList.remove("open"));
        if (!isOpen) menu.classList.add("open");
      };

      div.append(menuBtn, menu);
    }

    messagesEl.appendChild(div);

    // Action row below AI messages
    if (!isOwn) {
      const actions = document.createElement("div");
      actions.className = "msg-actions";

      const regenBtn = document.createElement("button");
      regenBtn.className = "msg-action-btn";
      regenBtn.title = "Regenerate response";
      regenBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.7L1 10"/></svg>`;
      regenBtn.onclick = () => regenerateMessage(docSnap.id);

      const cpBtn = document.createElement("button");
      cpBtn.className = "msg-action-btn";
      cpBtn.title = "Copy response";
      cpBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
      cpBtn.onclick = () => {
        navigator.clipboard.writeText(msg.content || "");
        cpBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
        setTimeout(() => {
          cpBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
        }, 1500);
      };

      actions.append(regenBtn, cpBtn);
      messagesEl.appendChild(actions);
    }
  });

  // Re-attach the live streaming bubble if a reply is in flight.
  if (streaming && streaming.started) renderStreamingBubble();
}

// ── Regenerate AI response ────────────────────────────────
async function regenerateMessage(docId) {
  if (isResponding) return;
  const msgIndex = currentMessages.findIndex(m => m._id === docId);
  if (msgIndex === -1) return;

  const history = currentMessages.slice(0, msgIndex).map(m => ({ role: m.role, content: m.content }));
  const targetChatId = currentChatId;

  await deleteDoc(doc(db, "users", currentUser.uid, "messages", docId));

  setResponding(true);
  try {
    const aiReply = await streamAssistantReply(history, null);
    if (aiReply && aiReply.trim()) {
      await addDoc(collection(db, "users", currentUser.uid, "messages"), {
        role: "assistant", content: aiReply,
        chatId: targetChatId, timestamp: serverTimestamp()
      });
    } else {
      document.getElementById("streamingMsg")?.remove();
    }
  } catch (err) {
    console.error("Regenerate error:", err);
    document.getElementById("streamingMsg")?.remove();
    showEphemeralError("Sorry, something went wrong. Please try again.");
  } finally {
    setResponding(false);
    inputEl.focus();
  }
}

// ── Message listener ──────────────────────────────────────
function startMsgListener() {
  if (!currentUser || !currentChatId) return;
  if (msgUnsubscribe) msgUnsubscribe();

  // Only fetch THIS chat's messages (where on a single field needs no composite
  // index); order client-side so a pending serverTimestamp sorts last.
  const chatId = currentChatId;
  const q = query(
    collection(db, "users", currentUser.uid, "messages"),
    where("chatId", "==", chatId)
  );

  msgUnsubscribe = onSnapshot(q, snapshot => {
    if (chatId !== currentChatId) return; // ignore a stale listener

    deleteModal.style.display = "none";
    deleteId = null;

    const docs = snapshot.docs
      .slice()
      .sort((a, b) => tsMillis(a.data().timestamp) - tsMillis(b.data().timestamp));
    currentMessages = docs.map(d => ({ ...d.data(), _id: d.id }));

    const nearBottom = messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < 100;
    renderMessages(docs);
    if (nearBottom || docs.length <= 1) scrollToBottom();
  });
}

// ── Auth state ────────────────────────────────────────────
let lastUserId = undefined;
onAuthStateChanged(auth, user => {
  const uid = user ? user.uid : null;
  if (uid === lastUserId) return;
  lastUserId = uid;
  currentUser = user;
  updateSiAccount(user);
  if (user) {
    closeAuthModal();
    openAuthBtn.style.display  = "none";
    logoutBtn.style.display    = "flex";
    inputEl.placeholder        = "Ask anything…";
    inputEl.disabled           = false;
    sendBtn.disabled           = false;
    attachBtn.disabled         = false;
    initChats();
  } else {
    cancelGeneration();
    if (msgUnsubscribe) { msgUnsubscribe(); msgUnsubscribe = null; }
    currentChatId     = null;
    currentMessages   = [];
    isResponding      = false;
    typingEl.classList.remove("active");
    sendBtn.classList.remove("generating");
    sendBtn.title              = "Send";
    openAuthBtn.style.display  = "flex";
    logoutBtn.style.display    = "none";
    inputEl.placeholder        = "Log in to start chatting…";
    inputEl.disabled           = true;
    sendBtn.disabled           = true;
    attachBtn.disabled         = true;
    messagesEl.innerHTML       = "";
    document.getElementById("chatList").innerHTML = "";
    deleteModal.style.display  = "none";
    deleteId = null;
  }
});

// ── New chat button ───────────────────────────────────────
resetBtn.onclick = () => {
  if (!currentUser) return;
  switchToChat(createChat());
  if (window.innerWidth < 900) closeSidebar();
};

// ── Ephemeral error bubble ────────────────────────────────
function showEphemeralError(msg) {
  const div = document.createElement("div");
  div.className = "message other error-msg group-tail";
  div.style.marginTop = "12px";
  div.textContent = msg;
  messagesEl.appendChild(div);
  messagesEl.scrollTo({ top: messagesEl.scrollHeight, behavior: "smooth" });
}

// ── Send message ──────────────────────────────────────────
async function sendMessage() {
  if (!currentUser || !currentChatId || isResponding) return;
  const text = inputEl.value.trim();
  if (!text && !pendingAttachment) return;

  const attachment  = pendingAttachment;
  inputEl.value     = "";
  inputEl.style.height = "24px";
  inputEl.style.lineHeight = "24px";
  inputEl.style.overflowY = "hidden";
  pendingAttachment = null;
  filePreview.style.display = "none";

  // Snapshot the context BEFORE writing the new message so it isn't duplicated
  // when the Firestore listener updates currentMessages.
  const priorHistory = currentMessages
    .slice(-AI_CONFIG.historyLimit)
    .map(m => ({ role: m.role, content: m.content }));

  setResponding(true);

  const targetChatId = currentChatId;   // keep the reply in this chat even if the user switches
  const messagesRef = collection(db, "users", currentUser.uid, "messages");
  const userContent = attachment
    ? `${text}${text ? "\n" : ""}[Attached: ${attachment.name}]`
    : text;

  try {
    await addDoc(messagesRef, {
      role: "user", content: userContent,
      chatId: targetChatId, timestamp: serverTimestamp()
    });

    setChatTitle(targetChatId, text.substring(0, 45) || attachment?.name || "New chat");
    scrollToBottom();

    const history = [...priorHistory, { role: "user", content: userContent }];
    const aiReply = await streamAssistantReply(history, attachment);

    if (aiReply && aiReply.trim()) {
      await addDoc(messagesRef, {
        role: "assistant", content: aiReply,
        chatId: targetChatId, timestamp: serverTimestamp()
      });
    } else {
      document.getElementById("streamingMsg")?.remove();
    }
  } catch (err) {
    console.error("AI error:", err);
    document.getElementById("streamingMsg")?.remove();
    showEphemeralError("Sorry, something went wrong. Please try again.");
  } finally {
    setResponding(false);
    inputEl.focus();
  }
}

// Toggle UI between idle and "generating" (where the send button stops the stream).
function setResponding(on) {
  isResponding       = on;
  inputEl.disabled   = on;
  attachBtn.disabled = on;
  sendBtn.disabled   = false;          // stays clickable so it can act as Stop
  sendBtn.classList.toggle("generating", on);
  sendBtn.title = on ? "Stop generating" : "Send";
  if (!on) typingEl.classList.remove("active");
}

function stopGenerating() {
  if (abortController) abortController.abort();
}

sendBtn.onclick = () => { if (isResponding) stopGenerating(); else sendMessage(); };
inputEl.addEventListener("keydown", e => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
});

// ── Mistral AI ────────────────────────────────────────────
// Build the OpenAI-style message array (with optional text-file context).
function buildApiMessages(messages, attachment = null) {
  return [
    { role: "system", content: AI_CONFIG.systemPrompt },
    ...messages.map((msg, i) => {
      const isLastUser = msg.role === "user" && i === messages.length - 1;
      const role = msg.role === "user" ? "user" : "assistant";
      if (isLastUser && attachment?.type === "text") {
        return { role, content: `File: "${attachment.name}"\n${attachment.content}\n\nUser: ${msg.content}` };
      }
      return { role, content: msg.content };
    })
  ];
}

// Drive a streamed reply: manages the live bubble, typing indicator, abort,
// and falls back to a single request if streaming fails. Returns final text.
async function streamAssistantReply(history, attachment) {
  abortController = new AbortController();
  streaming = { text: "", started: false };
  typingEl.classList.add("active");
  scrollToBottom();

  const apiMessages = buildApiMessages(history, attachment);
  let finalText = "";

  try {
    finalText = await streamMistral(apiMessages, abortController.signal, (full) => {
      if (!streaming) return;
      if (!streaming.started) {
        streaming.started = true;
        typingEl.classList.remove("active");
      }
      const stick = isNearBottom();
      streaming.text = full;
      scheduleStreamRender(stick);
    });
  } catch (err) {
    if (err.name === "AbortError") {
      finalText = streaming ? streaming.text : "";
    } else {
      console.error("Stream failed, falling back:", err);
      typingEl.classList.add("active");
      finalText = await getAIResponse(history, attachment); // may throw → handled by caller
    }
  } finally {
    streaming = null;
    abortController = null;
    typingEl.classList.remove("active");
  }
  return finalText;
}

// SSE streaming (Mistral / OpenAI-compatible: data: {…delta…}\n\n … data: [DONE]).
async function streamMistral(apiMessages, signal, onDelta) {
  const res = await fetch(AI_CONFIG.endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${AI_CONFIG.apiKey}` },
    body: JSON.stringify({ model: AI_CONFIG.model, messages: apiMessages, stream: true }),
    signal
  });

  if (!res.ok || !res.body) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`API ${res.status}: ${err?.error?.message || res.statusText}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "", full = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      const t = line.trim();
      if (!t.startsWith("data:")) continue;
      const payload = t.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const json = JSON.parse(payload);
        const delta = json.choices?.[0]?.delta?.content || "";
        if (delta) { full += delta; onDelta(full); }
      } catch (_) { /* partial JSON spanning chunks — ignore */ }
    }
  }

  if (!full) throw new Error("Empty stream response");
  return full;
}

// Non-streaming fallback.
async function getAIResponse(messages, attachment = null) {
  const res = await fetch(AI_CONFIG.endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${AI_CONFIG.apiKey}` },
    body: JSON.stringify({ model: AI_CONFIG.model, messages: buildApiMessages(messages, attachment) })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`API ${res.status}: ${err?.error?.message || res.statusText}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || "No response received.";
}

// ── Delete message handlers ───────────────────────────────
document.getElementById("cancelDelete").onclick = () => { deleteModal.style.display = "none"; deleteId = null; };
document.getElementById("confirmDelete").onclick = async () => {
  if (deleteId && currentUser)
    await deleteDoc(doc(db, "users", currentUser.uid, "messages", deleteId));
  deleteModal.style.display = "none";
  deleteId = null;
};

// ── Delete chat handlers ──────────────────────────────────
const deleteChatModal = document.getElementById("deleteChatModal");
document.getElementById("cancelDeleteChat").onclick = () => {
  deleteChatModal.style.display = "none";
  pendingDeleteChatId = null;
};
document.getElementById("confirmDeleteChat").onclick = confirmDeleteChat;
deleteChatModal.addEventListener("click", e => { if (e.target === deleteChatModal) { deleteChatModal.style.display = "none"; pendingDeleteChatId = null; } });

// ── Esc closes the topmost overlay ────────────────────────
document.addEventListener("keydown", e => {
  if (e.key !== "Escape") return;
  if (settingsPopup.classList.contains("open")) { settingsPopup.classList.remove("open"); return; }
  if (attachPopup.classList.contains("open"))   { attachPopup.classList.remove("open");   return; }
  const openMenu = document.querySelector(".menu.open");
  if (openMenu) { openMenu.classList.remove("open"); return; }
  for (const m of [authModal, deleteModal, deleteChatModal]) {
    if (m.style.display === "flex") {
      m.style.display = "none";
      deleteId = null;
      pendingDeleteChatId = null;
      return;
    }
  }
});

// ── Helpers ───────────────────────────────────────────────
function tsMillis(ts) {
  return ts && ts.toMillis ? ts.toMillis() : Number.POSITIVE_INFINITY;
}

function formatTime(ts) {
  if (!ts) return "";
  const date = ts.toDate ? ts.toDate() : new Date(ts);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
