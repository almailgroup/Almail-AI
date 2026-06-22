import { db, auth } from "./firebase.js";
import {
  collection,
  addDoc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
  deleteDoc,
  doc,
  getDocs,
  limit,
  writeBatch,
  updateDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

let currentUser = null;
let deleteId = null;

// Elements
const appEl         = document.getElementById("app");
const authModal     = document.getElementById("authModal");
const emailInput    = document.getElementById("emailInput");
const passInput     = document.getElementById("passwordInput");
const loginBtn      = document.getElementById("loginBtn");
const registerBtn   = document.getElementById("registerBtn");
const toggleMode    = document.getElementById("toggleAuthMode");
const errorEl       = document.getElementById("authError");
const openAuthBtn   = document.getElementById("openAuthBtn");
const messagesEl    = document.getElementById("messages");
const inputEl       = document.getElementById("messageInput");
const sendBtn       = document.getElementById("sendBtn");
const typingEl      = document.getElementById("typingIndicator");
const logoutBtn     = document.getElementById("logoutBtn");
const resetBtn      = document.getElementById("resetChatBtn");
const deleteModal   = document.getElementById("deleteModal");
const settingsBtn   = document.getElementById("settingsBtn");
const settingsPopup = document.getElementById("settingsPopup");

// Sidebar
const sidebarToggle   = document.getElementById("sidebarToggle");
const sidebarClose    = document.getElementById("sidebarClose");
const sidebarBackdrop = document.getElementById("sidebarBackdrop");

const isDesktop = () => window.matchMedia("(min-width: 900px)").matches;

function openSidebar()  { appEl.classList.add("sidebar-open"); localStorage.setItem("sidebar", "open"); }
function closeSidebar() { appEl.classList.remove("sidebar-open"); localStorage.setItem("sidebar", "closed"); }

// Restore last state on desktop; always start collapsed on mobile
if (isDesktop()) {
  appEl.classList.toggle("sidebar-open", localStorage.getItem("sidebar") !== "closed");
} else {
  appEl.classList.remove("sidebar-open");
}

sidebarToggle.onclick   = openSidebar;
sidebarClose.onclick    = () => appEl.classList.contains("sidebar-open") ? closeSidebar() : openSidebar();
sidebarBackdrop.onclick = closeSidebar;

// Safety reset
deleteModal.style.display = "none";
deleteId = null;

// Settings popup
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

document.addEventListener("click", (e) => {
  if (!settingsPopup.contains(e.target)) settingsPopup.classList.remove("open");
});

// Theme
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

// Model picker
const MODELS = {
  "1.0": "gemini-2.0-flash",
  "1.1": "gemini-2.5-flash"
};
let currentModelVersion = localStorage.getItem("modelVersion") || "1.0";
const modelPickerBtn    = document.getElementById("modelPickerBtn");
const modelPickerLabel  = document.getElementById("modelPickerLabel");
const modelPickerPopup  = document.getElementById("modelPickerPopup");

function applyModelUI() {
  modelPickerLabel.textContent = `Almail AI ${currentModelVersion}`;
  document.getElementById("check10").classList.toggle("visible", currentModelVersion === "1.0");
  document.getElementById("check11").classList.toggle("visible", currentModelVersion === "1.1");
}
applyModelUI();

modelPickerBtn.onclick = (e) => {
  e.stopPropagation();
  const rect = modelPickerBtn.getBoundingClientRect();
  modelPickerPopup.style.left   = `${rect.left}px`;
  modelPickerPopup.style.bottom = `${window.innerHeight - rect.top + 8}px`;
  modelPickerPopup.classList.toggle("open");
};

document.getElementById("model10Btn").onclick = () => {
  currentModelVersion = "1.0";
  localStorage.setItem("modelVersion", "1.0");
  applyModelUI();
  modelPickerPopup.classList.remove("open");
};

document.getElementById("model11Btn").onclick = () => {
  currentModelVersion = "1.1";
  localStorage.setItem("modelVersion", "1.1");
  applyModelUI();
  modelPickerPopup.classList.remove("open");
};

document.addEventListener("click", (e) => {
  if (!modelPickerPopup.contains(e.target) && e.target !== modelPickerBtn)
    modelPickerPopup.classList.remove("open");
});

// File attachment
const attachBtn      = document.getElementById("attachBtn");
const fileInput      = document.getElementById("fileInput");
const filePreview    = document.getElementById("filePreview");
const filePreviewName = document.getElementById("filePreviewName");
let pendingAttachment = null;

attachBtn.onclick = () => fileInput.click();

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

document.getElementById("fileRemoveBtn").onclick = () => {
  pendingAttachment = null;
  filePreview.style.display = "none";
};

// Global menu close handler
document.addEventListener("click", (e) => {
  if (!e.target.closest(".menu-btn") && !e.target.closest(".menu")) {
    document.querySelectorAll(".menu.open").forEach(m => m.classList.remove("open"));
  }
});

// Reset chat
resetBtn.onclick = async () => {
  if (!currentUser) return;
  if (!confirm("Reset entire chat?\nAll messages will be permanently deleted.")) return;

  try {
    typingEl.dataset.status = "Clearing chat…";
    typingEl.classList.add("status-only");
    const messagesRef = collection(db, "users", currentUser.uid, "messages");
    const snapshot = await getDocs(messagesRef);

    const batch = writeBatch(db);
    snapshot.forEach(d => batch.delete(d.ref));
    await batch.commit();

    messagesEl.innerHTML = "";
    typingEl.dataset.status = "Chat has been reset";
    setTimeout(() => { typingEl.dataset.status = ""; typingEl.classList.remove("status-only"); }, 2000);
  } catch (err) {
    console.error("Reset failed:", err);
    typingEl.dataset.status = "Failed to reset chat";
    setTimeout(() => { typingEl.dataset.status = ""; typingEl.classList.remove("status-only"); }, 3000);
  }
};

// Auth modal
let isLoginMode = true;

function updateAuthUI() {
  const authTitle = document.getElementById("authTitle");
  authTitle.textContent     = isLoginMode ? "Welcome back" : "Create account";
  loginBtn.style.display    = isLoginMode ? "block" : "none";
  registerBtn.style.display = isLoginMode ? "none"  : "block";
  toggleMode.textContent    = isLoginMode
    ? "Don't have an account? Register"
    : "Already have an account? Log in";
  errorEl.textContent = "";
}

function openAuthModal() {
  updateAuthUI();
  authModal.style.display = "flex";
  emailInput.focus();
}

function closeAuthModal() {
  authModal.style.display = "none";
  errorEl.textContent = "";
}

openAuthBtn.onclick  = openAuthModal;
document.getElementById("authClose").onclick = closeAuthModal;
toggleMode.onclick   = () => { isLoginMode = !isLoginMode; updateAuthUI(); };

// Close modal when clicking the backdrop
authModal.addEventListener("click", e => { if (e.target === authModal) closeAuthModal(); });

// Authentication
async function handleAuth(isRegister = false) {
  const email = emailInput.value.trim();
  const password = passInput.value.trim();

  if (!email || !password) {
    errorEl.textContent = "Please fill in all fields";
    return;
  }

  errorEl.textContent = "";
  try {
    if (isRegister) {
      await createUserWithEmailAndPassword(auth, email, password);
    } else {
      await signInWithEmailAndPassword(auth, email, password);
    }
  } catch (error) {
    let msg = error.message;
    if (msg.includes("wrong-password")) msg = "Incorrect password";
    if (msg.includes("user-not-found")) msg = "No account with this email";
    if (msg.includes("email-already-in-use")) msg = "Email already registered";
    errorEl.textContent = msg;
  }
}

loginBtn.onclick    = () => handleAuth(false);
registerBtn.onclick = () => handleAuth(true);

passInput.addEventListener("keydown", e => {
  if (e.key === "Enter") handleAuth(isLoginMode ? false : true);
});

logoutBtn.onclick = () => signOut(auth);

// Auth state
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
    startListening();
  } else {
    openAuthBtn.style.display  = "flex";
    logoutBtn.style.display    = "none";
    inputEl.placeholder        = "Log in to start chatting…";
    inputEl.disabled           = true;
    sendBtn.disabled           = true;
    attachBtn.disabled         = true;
    messagesEl.innerHTML       = "";
    deleteModal.style.display  = "none";
    deleteId = null;
  }
});

// Messages listener
function startListening() {
  if (!currentUser) return;

  const messagesRef = collection(db, "users", currentUser.uid, "messages");
  const q = query(messagesRef, orderBy("timestamp"));

  onSnapshot(q, snapshot => {
    deleteModal.style.display = "none";
    deleteId = null;
    messagesEl.innerHTML = "";

    // Collect into array first so we can compute grouping
    const docs = [];
    snapshot.forEach(d => docs.push(d));

    docs.forEach((docSnap, i) => {
      const msg = docSnap.data();
      const isOwn = msg.role === "user";
      const prevRole = i > 0 ? docs[i - 1].data().role : null;
      const nextRole = i < docs.length - 1 ? docs[i + 1].data().role : null;

      const grouped   = prevRole === msg.role;   // same sender as above → smaller gap
      const groupTail = nextRole !== msg.role;   // last in its run → show the tail corner

      const div = document.createElement("div");
      div.className = [
        "message",
        isOwn ? "self" : "other",
        grouped   ? "grouped"    : "",
        groupTail ? "group-tail" : "",
      ].filter(Boolean).join(" ");

      // Render markdown + links
      let rawText = msg.content || "";
      let htmlText = marked.parse(rawText, { breaks: true, gfm: true });
      htmlText = linkify(htmlText);
      const textDiv = document.createElement("div");
      textDiv.innerHTML = htmlText;

      const meta = document.createElement("div");
      meta.className = "meta";
      meta.textContent = `${isOwn ? "You" : "Almail AI"} · ${formatTime(msg.timestamp)}`;

      div.append(textDiv, meta);

      // Context menu (both user and AI)
      const menuBtn = document.createElement("button");
      menuBtn.className = "menu-btn";
      menuBtn.innerHTML = "⋯";

      const menu = document.createElement("div");
      menu.className = "menu";

      // Copy button for all messages
      const copyBtn = document.createElement("button");
      copyBtn.className = "copy";
      copyBtn.textContent = "Copy";
      copyBtn.onclick = (e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(msg.content || "");
        menu.classList.remove("open");
      };
      menu.appendChild(copyBtn);

      if (isOwn) {
        // Edit button
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
              if (newText && newText !== msg.content) {
                await updateDoc(doc(db, "users", currentUser.uid, "messages", docSnap.id), { content: newText });
              }
            }
            if (ev.key === "Escape") {
              editArea.replaceWith(textDiv);
            }
          });
        };

        // Delete button
        const delBtn = document.createElement("button");
        delBtn.className = "delete";
        delBtn.textContent = "Delete";
        delBtn.onclick = (e) => {
          e.stopPropagation();
          menu.classList.remove("open");
          div.classList.add("wobbly-strong");
          setTimeout(() => {
            div.classList.remove("wobbly-strong");
            setTimeout(() => {
              deleteId = docSnap.id;
              deleteModal.style.display = "flex";
            }, 50);
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

// Send message
async function sendMessage() {
  if (!currentUser) return;
  const text = inputEl.value.trim();
  if (!text && !pendingAttachment) return;

  const messagesRef = collection(db, "users", currentUser.uid, "messages");
  const attachment = pendingAttachment;

  // Clear input and attachment immediately
  inputEl.value = "";
  pendingAttachment = null;
  filePreview.style.display = "none";

  const userContent = attachment
    ? `${text}${text ? "\n" : ""}[Attached: ${attachment.name}]`
    : text;

  await addDoc(messagesRef, {
    role: "user",
    content: userContent,
    timestamp: serverTimestamp()
  });

  typingEl.classList.add("active");

  try {
    const recent = query(messagesRef, orderBy("timestamp", "desc"), limit(12));
    const snap = await getDocs(recent);
    const history = snap.docs.map(d => d.data()).reverse()
      .map(m => ({ role: m.role, content: m.content }));

    const aiReply = await getAIResponse(history, attachment);

    await addDoc(messagesRef, {
      role: "assistant",
      content: aiReply,
      timestamp: serverTimestamp()
    });
  } catch (err) {
    console.error(err);
    await addDoc(messagesRef, {
      role: "assistant",
      content: "Sorry, something went wrong. Please try again.",
      timestamp: serverTimestamp()
    });
  }

  typingEl.classList.remove("active");
}

sendBtn.onclick = sendMessage;

inputEl.addEventListener("keydown", e => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

// AI API
async function getAIResponse(messages, attachment = null) {
  const API_KEY = "AIzaSyAEeEzsi8OB8sWmb8tK3BJTyIsD9KG-bbU";
  const MODEL   = MODELS[currentModelVersion] || MODELS["1.0"];

  const contents = messages.map((msg, i) => {
    const isLastUser = msg.role === "user" && i === messages.length - 1;
    if (isLastUser && attachment) {
      const parts = [{ text: msg.content }];
      if (attachment.type === "image") {
        parts.push({ inlineData: { mimeType: attachment.mimeType, data: attachment.data } });
      } else if (attachment.type === "text") {
        parts[0].text = `File contents of "${attachment.name}":\n${attachment.content}\n\n${msg.content}`;
      }
      return { role: "user", parts };
    }
    return { role: msg.role === "user" ? "user" : "model", parts: [{ text: msg.content }] };
  });

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents,
        systemInstruction: {
          parts: [{ text: "You are Almail AI, a helpful, clever and friendly assistant. You can analyze uploaded images and files to answer questions and provide information. Do not generate images." }]
        }
      })
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`API error ${res.status}: ${err?.error?.message || ""}`);
  }

  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "No response received.";
}

// Delete handlers
document.getElementById("cancelDelete").onclick = () => {
  deleteModal.style.display = "none";
  deleteId = null;
};

document.getElementById("confirmDelete").onclick = async () => {
  if (deleteId && currentUser) {
    await deleteDoc(doc(db, "users", currentUser.uid, "messages", deleteId));
  }
  deleteModal.style.display = "none";
  deleteId = null;
};

// Helpers
function linkify(text) {
  return text.replace(/(https?:\/\/[^\s<]+)/g, url =>
    `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`
  );
}

function formatTime(ts) {
  if (!ts) return "";
  const date = ts.toDate ? ts.toDate() : new Date(ts);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}