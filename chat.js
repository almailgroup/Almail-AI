import { db, auth } from "./firebase.js";
import {
  collection, addDoc, query, orderBy, onSnapshot,
  serverTimestamp, deleteDoc, doc, getDocs, limit, updateDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import {
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// ── State ─────────────────────────────────────────────────
let currentUser      = null;
let currentChatId    = null;
let deleteId         = null;
let msgUnsubscribe   = null;
let pendingAttachment = null;

// ── Chat metadata stored in localStorage (no extra Firestore collection needed)
function loadChats()        { return JSON.parse(localStorage.getItem("chats_v2") || "[]"); }
function saveChats(chats)   { localStorage.setItem("chats_v2", JSON.stringify(chats)); }
function genId()            { return Date.now().toString(36) + Math.random().toString(36).slice(2); }

function createChat() {
  const id = genId();
  const chats = loadChats();
  chats.unshift({ id, title: "New chat", ts: Date.now() });
  saveChats(chats);
  return id;
}

function setChatTitle(chatId, title) {
  const chats = loadChats();
  const c = chats.find(c => c.id === chatId);
  if (c && c.title === "New chat") { c.title = title; saveChats(chats); }
  renderChatList();
}

function renderChatList() {
  const chatList = document.getElementById("chatList");
  if (!chatList) return;
  chatList.innerHTML = "";
  loadChats().forEach(chat => {
    const btn = document.createElement("button");
    btn.className = `chat-item${chat.id === currentChatId ? " active" : ""}`;
    btn.dataset.chatId = chat.id;
    btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg><span>${chat.title}</span>`;
    btn.onclick = () => switchToChat(chat.id);
    chatList.appendChild(btn);
  });
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
  let chats = loadChats();
  // First-ever launch: create a default chat
  if (chats.length === 0) {
    const id = createChat();
    currentChatId = id;
  } else {
    const savedId = localStorage.getItem("currentChatId");
    const exists  = chats.some(c => c.id === savedId);
    currentChatId = (savedId && exists) ? savedId : chats[0].id;
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
sidebarClose.onclick    = () => appEl.classList.contains("sidebar-open") ? closeSidebar() : openSidebar();
sidebarBackdrop.onclick = closeSidebar;

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
let isLight = localStorage.getItem("theme") === "light";
document.body.classList.toggle("light", isLight);

function applyThemeUI() {
  document.getElementById("checkDark").classList.toggle("visible", !isLight);
  document.getElementById("checkLight").classList.toggle("visible", isLight);
}
applyThemeUI();

function setTheme(light) {
  isLight = light;
  document.body.classList.toggle("light", isLight);
  localStorage.setItem("theme", isLight ? "light" : "dark");
  applyThemeUI();
  settingsPopup.classList.remove("open");
}
document.getElementById("themeDarkBtn").onclick  = () => setTheme(false);
document.getElementById("themeLightBtn").onclick = () => setTheme(true);


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
  if (!e.target.closest(".menu-btn")       && !e.target.closest(".menu"))
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
    if (msg.includes("wrong-password"))       msg = "Incorrect password";
    if (msg.includes("user-not-found"))       msg = "No account with this email";
    if (msg.includes("email-already-in-use")) msg = "Email already registered";
    errorEl.textContent = msg;
  }
}
loginBtn.onclick    = () => handleAuth(false);
registerBtn.onclick = () => handleAuth(true);
passInput.addEventListener("keydown", e => { if (e.key === "Enter") handleAuth(!isLoginMode); });
logoutBtn.onclick   = () => signOut(auth);

// ── Message listener ──────────────────────────────────────
// Messages are stored at users/{uid}/messages with a chatId field.
// This keeps the original Firestore path so existing security rules work.
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
    messagesEl.innerHTML = "";

    const docs = snapshot.docs.filter(d => {
      const data = d.data();
      // Show messages that belong to current chat, or legacy messages (no chatId) if it's the first chat
      return data.chatId === currentChatId;
    });

    docs.forEach((docSnap, i) => {
      const msg     = docSnap.data();
      const isOwn   = msg.role === "user";
      const prev    = i > 0 ? docs[i - 1].data().role : null;
      const next    = i < docs.length - 1 ? docs[i + 1].data().role : null;
      const grouped   = prev === msg.role;
      const groupTail = next !== msg.role;

      const div = document.createElement("div");
      div.className = ["message", isOwn ? "self" : "other",
        grouped ? "grouped" : "", groupTail ? "group-tail" : ""].filter(Boolean).join(" ");

      const textDiv = document.createElement("div");
      textDiv.innerHTML = linkify(marked.parse(msg.content || "", { breaks: true, gfm: true }));

      const meta = document.createElement("div");
      meta.className = "meta";
      meta.textContent = `${isOwn ? "You" : "Almail AI"} · ${formatTime(msg.timestamp)}`;

      div.append(textDiv, meta);

      // Context menu
      const menuBtn = document.createElement("button");
      menuBtn.className = "menu-btn";
      menuBtn.textContent = "⋯";

      const menu = document.createElement("div");
      menu.className = "menu";

      const copyBtn = document.createElement("button");
      copyBtn.className = "copy";
      copyBtn.textContent = "Copy";
      copyBtn.onclick = (e) => { e.stopPropagation(); navigator.clipboard.writeText(msg.content || ""); menu.classList.remove("open"); };
      menu.appendChild(copyBtn);

      if (isOwn) {
        const editBtn = document.createElement("button");
        editBtn.className = "edit";
        editBtn.textContent = "Edit";
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
        delBtn.textContent = "Delete";
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
    });

    messagesEl.scrollTo({ top: messagesEl.scrollHeight, behavior: "smooth" });
  });
}

// ── Auth state ────────────────────────────────────────────
onAuthStateChanged(auth, user => {
  currentUser = user;
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
    currentChatId = null;
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
  const id = createChat();
  switchToChat(id);
};

// ── Send message ──────────────────────────────────────────
async function sendMessage() {
  if (!currentUser || !currentChatId) return;
  const text = inputEl.value.trim();
  if (!text && !pendingAttachment) return;

  const attachment  = pendingAttachment;
  inputEl.value     = "";
  pendingAttachment = null;
  filePreview.style.display = "none";

  const messagesRef = collection(db, "users", currentUser.uid, "messages");
  const userContent = attachment
    ? `${text}${text ? "\n" : ""}[Attached: ${attachment.name}]`
    : text;

  // Save user message (same Firestore path as before, now with chatId field)
  await addDoc(messagesRef, {
    role: "user",
    content: userContent,
    chatId: currentChatId,
    timestamp: serverTimestamp()
  });

  // Set chat title from first message
  setChatTitle(currentChatId, text.substring(0, 45));

  typingEl.classList.add("active");

  try {
    const snap = await getDocs(query(messagesRef, orderBy("timestamp", "desc"), limit(12)));
    const history = snap.docs
      .filter(d => d.data().chatId === currentChatId)
      .map(d => d.data())
      .reverse()
      .map(m => ({ role: m.role, content: m.content }));

    const aiReply = await getAIResponse(history, attachment);

    await addDoc(messagesRef, {
      role: "assistant",
      content: aiReply,
      chatId: currentChatId,
      timestamp: serverTimestamp()
    });
  } catch (err) {
    console.error("AI error:", err);
    await addDoc(messagesRef, {
      role: "assistant",
      content: "Sorry, something went wrong. Please try again.",
      chatId: currentChatId,
      timestamp: serverTimestamp()
    });
  }

  typingEl.classList.remove("active");
}

sendBtn.onclick = sendMessage;
inputEl.addEventListener("keydown", e => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
});

// ── OpenRouter API ────────────────────────────────────────
async function getAIResponse(messages, attachment = null) {
  const API_KEY = "9fJRIRAzrNEvMsciprVznKVYaCDO5gAq";
  const MODEL   = "mistral-small-latest";

  const oarMessages = [
    { role: "system", content: "You are Almail AI, a helpful, clever and friendly assistant. You can analyze uploaded files to answer questions. Do not generate images." },
    ...messages.map((msg, i) => {
      const isLastUser = msg.role === "user" && i === messages.length - 1;
      const role = msg.role === "user" ? "user" : "assistant";
      if (isLastUser && attachment && attachment.type === "text") {
        return { role, content: `File: "${attachment.name}"\n${attachment.content}\n\nUser: ${msg.content}` };
      }
      return { role, content: msg.content };
    })
  ];

  const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${API_KEY}`
    },
    body: JSON.stringify({ model: MODEL, messages: oarMessages })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`API ${res.status}: ${err?.error?.message || res.statusText}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || "No response received.";
}

// ── Delete handlers ───────────────────────────────────────
document.getElementById("cancelDelete").onclick = () => { deleteModal.style.display = "none"; deleteId = null; };
document.getElementById("confirmDelete").onclick = async () => {
  if (deleteId && currentUser)
    await deleteDoc(doc(db, "users", currentUser.uid, "messages", deleteId));
  deleteModal.style.display = "none";
  deleteId = null;
};

// ── Helpers ───────────────────────────────────────────────
function linkify(text) {
  return text.replace(/(https?:\/\/[^\s<]+)/g, url =>
    `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`);
}

function formatTime(ts) {
  if (!ts) return "";
  const date = ts.toDate ? ts.toDate() : new Date(ts);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
