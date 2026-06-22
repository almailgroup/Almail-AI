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
  writeBatch
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
const emailInput    = document.getElementById("emailInput");
const passInput     = document.getElementById("passwordInput");
const loginBtn      = document.getElementById("loginBtn");
const registerBtn   = document.getElementById("registerBtn");
const toggleMode    = document.getElementById("toggleAuthMode");
const errorEl       = document.getElementById("authError");
const sidebarAuth   = document.getElementById("sidebarAuth");
const messagesEl    = document.getElementById("messages");
const inputEl       = document.getElementById("messageInput");
const sendBtn       = document.getElementById("sendBtn");
const typingEl      = document.getElementById("typingIndicator");
const logoutBtn     = document.getElementById("logoutBtn");
const themeBtn      = document.getElementById("themeBtn");
const resetBtn      = document.getElementById("resetChatBtn");
const deleteModal   = document.getElementById("deleteModal");

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
sidebarClose.onclick    = closeSidebar;
sidebarBackdrop.onclick = closeSidebar;

// Safety reset
deleteModal.style.display = "none";
deleteId = null;

// Theme
const moonIcon   = document.getElementById("moonIcon");
const sunIcon    = document.getElementById("sunIcon");
const themeLabel = document.getElementById("themeLabel");

function applyThemeUI() {
  moonIcon.style.display = isLight ? "none" : "block";
  sunIcon.style.display  = isLight ? "block" : "none";
  themeLabel.textContent = isLight ? "Dark mode" : "Light mode";
}

let isLight = localStorage.getItem("theme") === "light";
document.body.classList.toggle("light", isLight);
applyThemeUI();

themeBtn.onclick = () => {
  isLight = document.body.classList.toggle("light");
  localStorage.setItem("theme", isLight ? "light" : "dark");
  applyThemeUI();
};

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

// Auth UI (sidebar inline form)
let isLoginMode = true;

function updateAuthUI() {
  loginBtn.style.display   = isLoginMode ? "flex" : "none";
  registerBtn.style.display = isLoginMode ? "none" : "flex";
  toggleMode.textContent   = isLoginMode
    ? "Don't have an account? Register"
    : "Already have an account? Log in";
  errorEl.textContent = "";
}

toggleMode.onclick = () => { isLoginMode = !isLoginMode; updateAuthUI(); };
updateAuthUI();

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
    sidebarAuth.style.display  = "none";
    logoutBtn.style.display    = "flex";
    inputEl.placeholder        = "Ask anything…";
    inputEl.disabled           = false;
    sendBtn.disabled           = false;
    startListening();
  } else {
    sidebarAuth.style.display  = "block";
    logoutBtn.style.display    = "none";
    inputEl.placeholder        = "Log in to start chatting…";
    inputEl.disabled           = true;
    sendBtn.disabled           = true;
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
      let content = `<div>${htmlText}</div>`;
      content += `<div class="meta">${isOwn ? "You" : "AZSCO AI"} · ${formatTime(msg.timestamp)}</div>`;

      div.innerHTML = content;

      if (isOwn) {
        const menuBtn = document.createElement("button");
        menuBtn.className = "menu-btn";
        menuBtn.textContent = "⋯";

        const menu = document.createElement("div");
        menu.className = "menu";
        menu.innerHTML = `<button class="delete">Delete</button>`;

        menuBtn.onclick = e => {
          e.stopPropagation();
          document.querySelectorAll('.menu').forEach(m => m.style.display = 'none');
          menu.style.display = 'block';
        };

        menu.querySelector(".delete").onclick = () => {
          div.classList.add("wobbly-strong");
          setTimeout(() => {
            div.classList.remove("wobbly-strong");
            setTimeout(() => {
              deleteId = docSnap.id;
              deleteModal.style.display = "flex";
            }, 50);
          }, 900);
        };

        div.append(menuBtn, menu);

        setTimeout(() => {
          const closeMenu = e => {
            if (!div.contains(e.target)) {
              menu.style.display = "none";
              document.removeEventListener("click", closeMenu);
            }
          };
          document.addEventListener("click", closeMenu);
        }, 10);
      }

      messagesEl.appendChild(div);
    });

    messagesEl.scrollTo({ top: messagesEl.scrollHeight, behavior: "smooth" });
  });
}

// Send message
async function sendMessage() {
  if (!currentUser) return;
  const text = inputEl.value.trim();
  if (!text) return;

  const messagesRef = collection(db, "users", currentUser.uid, "messages");

  await addDoc(messagesRef, {
    role: "user",
    content: text,
    timestamp: serverTimestamp()
  });

  inputEl.value = "";
  typingEl.classList.add("active");

  try {
    const recent = query(messagesRef, orderBy("timestamp", "desc"), limit(12));
    const snap = await getDocs(recent);
    const history = snap.docs.map(d => d.data()).reverse()
      .map(m => ({ role: m.role, content: m.content }));

    const aiReply = await getAIResponse(history);

    await addDoc(messagesRef, {
      role: "assistant",
      content: aiReply,
      timestamp: serverTimestamp()
    });
  } catch (err) {
    console.error(err);
    await addDoc(messagesRef, {
      role: "assistant",
      content: "Sorry, something went wrong. Try again.",
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

// AI API – replace with your settings
async function getAIResponse(messages) {
  const API_KEY = "AIzaSyAEeEzsi8OB8sWmb8tK3BJTyIsD9KG-bbU";
  const MODEL   = "gemini-2.5-flash";   // or your preferred model

  const contents = messages.map(msg => ({
    role: msg.role === "user" ? "user" : "model",
    parts: [{ text: msg.content }]
  }));

  contents.unshift({
    role: "user",
    parts: [{ text: "You are AZSCO AI, a helpful, clever and friendly assistant." }]
  });

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents })
      }
    );

    if (!res.ok) throw new Error(`API error ${res.status}`);

    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "No response received.";
  } catch (err) {
    console.error("AI error:", err);
    return "Sorry — having connection issues right now.";
  }
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