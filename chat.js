import { db, auth } from "./firebase.js";
import {
  collection, addDoc, query, orderBy, onSnapshot,
  serverTimestamp, deleteDoc, doc, updateDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import {
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// ── State ─────────────────────────────────────────────────
let currentUser       = null;
let currentChatId     = null;
let deleteId          = null;
let msgUnsubscribe    = null;
let pendingAttachment = null;
let isResponding      = false;
let currentMessages   = [];
let pendingDeleteChatId = null;

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

function confirmDeleteChat() {
  if (!pendingDeleteChatId) return;
  const chatId = pendingDeleteChatId;
  pendingDeleteChatId = null;
  document.getElementById("deleteChatModal").style.display = "none";
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
  btn.onclick = () => switchToChat(chat.id);

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
  currentChatId = chatId;
  localStorage.setItem("currentChatId", chatId);
  document.querySelectorAll(".chat-item").forEach(el =>
    el.classList.toggle("active", el.dataset.chatId === chatId)
  );
  startMsgListener();
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

// Click anywhere on the collapsed sidebar strip to open it
document.getElementById("sidebar").addEventListener("click", () => {
  if (!appEl.classList.contains("sidebar-open")) openSidebar();
});

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
  try {
    if (isRegister) await createUserWithEmailAndPassword(auth, email, password);
    else            await signInWithEmailAndPassword(auth, email, password);
  } catch (err) {
    let msg = err.message;
    if (msg.includes("wrong-password") || msg.includes("invalid-credential")) msg = "Incorrect email or password";
    else if (msg.includes("user-not-found"))       msg = "No account with this email";
    else if (msg.includes("email-already-in-use")) msg = "Email already registered";
    else if (msg.includes("weak-password"))        msg = "Password must be at least 6 characters";
    errorEl.textContent = msg;
  }
}
loginBtn.onclick    = () => handleAuth(false);
registerBtn.onclick = () => handleAuth(true);
passInput.addEventListener("keydown", e => { if (e.key === "Enter") handleAuth(!isLoginMode); });
logoutBtn.onclick   = () => signOut(auth);

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
      </div>`;
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
    textDiv.innerHTML = linkify(marked.parse(msg.content || "", { breaks: true, gfm: true }));

    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = `${isOwn ? "You" : "Almail AI"} · ${formatTime(msg.timestamp)}`;

    div.append(textDiv, meta);

    // Context menu button
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

    if (isOwn) {
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
    }

    menuBtn.onclick = (e) => {
      e.stopPropagation();
      const isOpen = menu.classList.contains("open");
      document.querySelectorAll(".menu.open").forEach(m => m.classList.remove("open"));
      if (!isOpen) menu.classList.add("open");
    };

    div.append(menuBtn, menu);
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
}

// ── Regenerate AI response ────────────────────────────────
async function regenerateMessage(docId) {
  if (isResponding) return;
  const msgIndex = currentMessages.findIndex(m => m._id === docId);
  if (msgIndex === -1) return;

  const history = currentMessages.slice(0, msgIndex).map(m => ({ role: m.role, content: m.content }));

  await deleteDoc(doc(db, "users", currentUser.uid, "messages", docId));

  isResponding = true;
  sendBtn.disabled = true;
  inputEl.disabled = true;
  typingEl.classList.add("active");
  messagesEl.scrollTo({ top: messagesEl.scrollHeight, behavior: "smooth" });

  try {
    const aiReply = await getAIResponse(history);
    await addDoc(collection(db, "users", currentUser.uid, "messages"), {
      role: "assistant", content: aiReply,
      chatId: currentChatId, timestamp: serverTimestamp()
    });
  } catch (err) {
    showEphemeralError("Sorry, something went wrong. Please try again.");
  } finally {
    typingEl.classList.remove("active");
    isResponding = false;
    sendBtn.disabled = false;
    inputEl.disabled = false;
    inputEl.focus();
  }
}

// ── Message listener ──────────────────────────────────────
function startMsgListener() {
  if (!currentUser || !currentChatId) return;
  if (msgUnsubscribe) msgUnsubscribe();

  const q = query(
    collection(db, "users", currentUser.uid, "messages"),
    orderBy("timestamp")
  );

  msgUnsubscribe = onSnapshot(q, snapshot => {
    deleteModal.style.display = "none";
    deleteId = null;

    const docs = snapshot.docs.filter(d => d.data().chatId === currentChatId);
    currentMessages = docs.map(d => ({ ...d.data(), _id: d.id }));

    const nearBottom = messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < 100;
    renderMessages(docs);
    if (nearBottom || docs.length <= 1) {
      messagesEl.scrollTo({ top: messagesEl.scrollHeight, behavior: "smooth" });
    }
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
    if (msgUnsubscribe) { msgUnsubscribe(); msgUnsubscribe = null; }
    currentChatId     = null;
    currentMessages   = [];
    isResponding      = false;
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

  isResponding     = true;
  sendBtn.disabled = true;
  inputEl.disabled = true;

  const messagesRef = collection(db, "users", currentUser.uid, "messages");
  const userContent = attachment
    ? `${text}${text ? "\n" : ""}[Attached: ${attachment.name}]`
    : text;

  try {
    await addDoc(messagesRef, {
      role: "user", content: userContent,
      chatId: currentChatId, timestamp: serverTimestamp()
    });

    setChatTitle(currentChatId, text.substring(0, 45) || attachment?.name || "New chat");
    typingEl.classList.add("active");
    messagesEl.scrollTo({ top: messagesEl.scrollHeight, behavior: "smooth" });

    // Use cached messages + the just-sent message as context
    const history = [
      ...currentMessages.slice(-14).map(m => ({ role: m.role, content: m.content })),
      { role: "user", content: userContent }
    ];

    const aiReply = await getAIResponse(history, attachment);

    await addDoc(messagesRef, {
      role: "assistant", content: aiReply,
      chatId: currentChatId, timestamp: serverTimestamp()
    });
  } catch (err) {
    console.error("AI error:", err);
    showEphemeralError("Sorry, something went wrong. Please try again.");
  } finally {
    typingEl.classList.remove("active");
    isResponding     = false;
    sendBtn.disabled = false;
    inputEl.disabled = false;
    inputEl.focus();
  }
}

sendBtn.onclick = sendMessage;
inputEl.addEventListener("keydown", e => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
});

// ── Mistral AI ────────────────────────────────────────────
async function getAIResponse(messages, attachment = null) {
  const API_KEY = "9fJRIRAzrNEvMsciprVznKVYaCDO5gAq";
  const MODEL   = "mistral-small-latest";

  const apiMessages = [
    { role: "system", content: "You are Almail AI, a helpful, clever and friendly assistant. Answer clearly and concisely. You can analyze uploaded files to answer questions. Do not generate images." },
    ...messages.map((msg, i) => {
      const isLastUser = msg.role === "user" && i === messages.length - 1;
      const role = msg.role === "user" ? "user" : "assistant";
      if (isLastUser && attachment?.type === "text") {
        return { role, content: `File: "${attachment.name}"\n${attachment.content}\n\nUser: ${msg.content}` };
      }
      return { role, content: msg.content };
    })
  ];

  const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${API_KEY}` },
    body: JSON.stringify({ model: MODEL, messages: apiMessages })
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

// ── Helpers ───────────────────────────────────────────────
function linkify(text) {
  return text.replace(/(https?:\/\/[^\s<"]+)/g, url =>
    `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`);
}

function formatTime(ts) {
  if (!ts) return "";
  const date = ts.toDate ? ts.toDate() : new Date(ts);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
