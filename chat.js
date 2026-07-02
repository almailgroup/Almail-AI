import { db, auth } from "./firebase.js";
import {
  collection, addDoc, query, onSnapshot,
  serverTimestamp, deleteDoc, doc, updateDoc, getDocs, where
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import {
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, onAuthStateChanged, sendPasswordResetEmail, deleteUser
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

import { AI_CONFIG, PROVIDERS, DEFAULT_PROVIDER } from "./config.js";

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
let tempMode          = false;  // temporary chat: nothing is saved
let prevChatId        = null;   // chat to return to when leaving temp mode

// ── Chat metadata in localStorage ─────────────────────────
function loadChats()    { try { return JSON.parse(localStorage.getItem("chats_v2") || "[]"); } catch (e) { return []; } }
function saveChats(c)   { localStorage.setItem("chats_v2", JSON.stringify(c)); }
function genId()        { return Date.now().toString(36) + Math.random().toString(36).slice(2); }

function createChat(projectId) {
  const id = genId();
  const chats = loadChats();
  const chat = { id, title: "New chat", ts: Date.now(), pinned: false };
  if (projectId) chat.projectId = projectId;
  chats.unshift(chat);
  saveChats(chats);
  return id;
}

// ── Projects in localStorage ──────────────────────────────
function loadProjects()  { try { return JSON.parse(localStorage.getItem("projects_v1") || "[]"); } catch (e) { return []; } }
function saveProjects(p) { localStorage.setItem("projects_v1", JSON.stringify(p)); }

let pendingDeleteProjectId = null;
let autoRenameProjectId = null;

function createProject() {
  const id = genId();
  const projects = loadProjects();
  projects.unshift({ id, name: "New project", ts: Date.now(), collapsed: false });
  saveProjects(projects);
  return id;
}

function renameProject(id, name) {
  const projects = loadProjects();
  const p = projects.find(p => p.id === id);
  if (p && name.trim()) { p.name = name.trim(); saveProjects(projects); }
  renderChatList();
}

function toggleProjectCollapsed(id) {
  const projects = loadProjects();
  const p = projects.find(p => p.id === id);
  if (p) { p.collapsed = !p.collapsed; saveProjects(projects); }
  renderChatList();
}

function deleteProject(id) {
  pendingDeleteProjectId = id;
  document.getElementById("deleteProjectModal").style.display = "flex";
}

function confirmDeleteProject() {
  const id = pendingDeleteProjectId;
  pendingDeleteProjectId = null;
  document.getElementById("deleteProjectModal").style.display = "none";
  if (!id) return;
  const chats = loadChats();
  let changed = false;
  chats.forEach(c => { if (c.projectId === id) { delete c.projectId; changed = true; } });
  if (changed) saveChats(chats);
  saveProjects(loadProjects().filter(p => p.id !== id));
  renderChatList();
}

function moveChatToProject(chatId, projectId) {
  const chats = loadChats();
  const c = chats.find(c => c.id === chatId);
  if (!c) return;
  if (projectId) c.projectId = projectId; else delete c.projectId;
  saveChats(chats);
  if (projectId) {
    const projects = loadProjects();
    const p = projects.find(p => p.id === projectId);
    if (p && p.collapsed) { p.collapsed = false; saveProjects(projects); }
  }
  renderChatList();
}

// ── Projects dashboard page ───────────────────────────────
let pvTab = "all";
let pvSearchQ = "";

function openProjectsView() {
  if (!currentUser) return;
  appEl.classList.add("projects-page");
  renderProjectsView();
  if (window.innerWidth < 900) closeSidebar();
}
function closeProjectsView() { appEl.classList.remove("projects-page"); }
function projectsViewOpen() { return appEl.classList.contains("projects-page"); }

function renderProjectsView() {
  const grid = document.getElementById("pvGrid");
  if (!grid) return;
  grid.innerHTML = "";

  let projects = (pvTab === "shared") ? [] : loadProjects();
  const q = pvSearchQ.trim().toLowerCase();
  if (q) projects = projects.filter(p => (p.name || "").toLowerCase().includes(q));

  if (!projects.length) {
    grid.classList.add("empty");
    const empty = document.createElement("div");
    empty.className = "pv-empty";
    empty.innerHTML =
      `<div class="pv-empty-icon"><svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg></div>`;
    const t = document.createElement("div");
    t.className = "pv-empty-text";
    t.textContent = pvTab === "shared" ? "Nothing shared with you" : (q ? "No projects found" : "No projects yet");
    empty.appendChild(t);
    grid.appendChild(empty);
    return;
  }

  grid.classList.remove("empty");
  const allChats = loadChats();
  projects.forEach(p => grid.appendChild(buildProjectCard(p, allChats)));
}

function buildProjectCard(project, allChats) {
  const wrap = document.createElement("div");
  wrap.className = "pv-card-wrap";

  const card = document.createElement("button");
  card.className = "pv-card";
  const icon = document.createElement("div");
  icon.className = "pv-card-icon";
  icon.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`;
  const name = document.createElement("div");
  name.className = "pv-card-name";
  name.textContent = project.name;
  const count = allChats.filter(c => c.projectId === project.id).length;
  const meta = document.createElement("div");
  meta.className = "pv-card-meta";
  meta.textContent = count === 1 ? "1 chat" : `${count} chats`;
  card.append(icon, name, meta);
  card.onclick = () => openProjectFromCard(project.id);

  const actions = document.createElement("div");
  actions.className = "pv-card-actions";
  const renBtn = document.createElement("button");
  renBtn.className = "chat-action-btn";
  renBtn.title = "Rename";
  renBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
  renBtn.onclick = (e) => { e.stopPropagation(); startProjectCardRename(project, name); };
  const delBtn = document.createElement("button");
  delBtn.className = "chat-action-btn delete";
  delBtn.title = "Delete";
  delBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
  delBtn.onclick = (e) => { e.stopPropagation(); deleteProject(project.id); };
  actions.append(renBtn, delBtn);

  wrap.append(card, actions);
  return wrap;
}

function startProjectCardRename(project, nameEl) {
  const input = document.createElement("input");
  input.className = "pv-card-rename";
  input.value = project.name;
  input.onclick = (e) => e.stopPropagation();
  nameEl.replaceWith(input);
  input.focus();
  input.select();
  const save = () => renameProject(project.id, input.value || project.name);
  input.addEventListener("keydown", ev => {
    if (ev.key === "Enter") { ev.preventDefault(); save(); }
    if (ev.key === "Escape") renderProjectsView();
  });
  input.addEventListener("blur", save);
}

function openProjectFromCard(projectId) {
  closeProjectsView();
  const projects = loadProjects();
  const p = projects.find(x => x.id === projectId);
  if (p && p.collapsed) { p.collapsed = false; saveProjects(projects); }
  const chats = loadChats().filter(c => c.projectId === projectId);
  renderChatList();
  switchToChat(chats.length ? chats[0].id : createChat(projectId));
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

let chatFilter = "";

function renderChatList() {
  const chatList = document.getElementById("chatList");
  if (!chatList) return;
  chatList.innerHTML = "";

  const all = loadChats();
  const q   = chatFilter.trim().toLowerCase();

  const recentsLabel = document.getElementById("recentsLabel");
  const projectsSection = document.getElementById("projectsSection");
  if (recentsLabel) recentsLabel.style.display = q ? "none" : "";
  if (projectsSection) projectsSection.style.display = q ? "none" : "";

  // While searching, show a flat, filtered list across all chats.
  if (q) {
    const matches = all.filter(c => (c.title || "").toLowerCase().includes(q));
    if (!matches.length) {
      const empty = document.createElement("div");
      empty.className = "chat-empty-hint";
      empty.textContent = "No conversations found";
      chatList.appendChild(empty);
      return;
    }
    matches.forEach(chat => chatList.appendChild(buildChatItem(chat)));
    return;
  }

  renderProjects(all);

  // Recents = chats not in any project (pinned first, like before)
  const pinned = all.filter(c => c.pinned && !c.projectId);
  const normal = all.filter(c => !c.pinned && !c.projectId);

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

  if (projectsViewOpen()) renderProjectsView();
  updateTopbar();
}

// Brief, self-dismissing toast notification.
let toastTimer = null;
function showToast(message) {
  let t = document.getElementById("toast");
  if (!t) {
    t = document.createElement("div");
    t.id = "toast";
    t.className = "toast";
    document.body.appendChild(t);
  }
  t.textContent = message;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
}

// Keep the top bar's title in sync with the active view/chat.
function updateTopbar() {
  const titleEl = document.getElementById("topbarTitle");
  if (!titleEl) return;
  let label = "Almail AI";
  if (tempMode) {
    label = "Temporary chat";
  } else if (currentChatId) {
    const c = loadChats().find(ch => ch.id === currentChatId);
    label = (c && c.title) ? c.title : "New chat";
  } else if (currentUser) {
    label = "New chat";
  }
  titleEl.textContent = label;
  // Keep the browser tab in sync with the conversation.
  document.title = (label && label !== "Almail AI" && label !== "New chat")
    ? `${label} — Almail AI` : "Almail AI";
}

function renderProjects(allChats) {
  const list = document.getElementById("projectList");
  if (!list) return;
  list.innerHTML = "";
  const chats = allChats || loadChats();
  const projects = loadProjects();
  if (!projects.length) {
    const hint = document.createElement("div");
    hint.className = "project-hint";
    hint.textContent = "No projects yet — tap + to create one";
    list.appendChild(hint);
    return;
  }
  projects.forEach(project => list.appendChild(buildProjectRow(project, chats)));
}

function startProjectRename(project, nameSpan) {
  const input = document.createElement("input");
  input.className = "project-rename-input";
  input.value = project.name;
  input.onclick = (e) => e.stopPropagation();
  nameSpan.replaceWith(input);
  input.focus();
  input.select();
  const save = () => renameProject(project.id, input.value || project.name);
  input.addEventListener("keydown", ev => {
    if (ev.key === "Enter") { ev.preventDefault(); save(); }
    if (ev.key === "Escape") renderChatList();
  });
  input.addEventListener("blur", save);
}

function buildProjectRow(project, allChats) {
  const wrap = document.createElement("div");
  wrap.className = "project-wrap" + (project.collapsed ? "" : " expanded");

  const row = document.createElement("div");
  row.className = "project-row";

  const item = document.createElement("button");
  item.className = "project-item";
  item.innerHTML =
    `<svg class="project-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 6 15 12 9 18"/></svg>` +
    `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`;
  const nameSpan = document.createElement("span");
  nameSpan.className = "project-name";
  nameSpan.textContent = project.name;
  item.appendChild(nameSpan);
  item.onclick = () => toggleProjectCollapsed(project.id);

  const actions = document.createElement("div");
  actions.className = "project-actions";

  const newBtn = document.createElement("button");
  newBtn.className = "chat-action-btn";
  newBtn.title = "New chat in project";
  newBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
  newBtn.onclick = (e) => { e.stopPropagation(); switchToChat(createChat(project.id)); };

  const renBtn = document.createElement("button");
  renBtn.className = "chat-action-btn";
  renBtn.title = "Rename project";
  renBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
  renBtn.onclick = (e) => { e.stopPropagation(); startProjectRename(project, nameSpan); };

  const delBtn = document.createElement("button");
  delBtn.className = "chat-action-btn delete";
  delBtn.title = "Delete project";
  delBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
  delBtn.onclick = (e) => { e.stopPropagation(); deleteProject(project.id); };

  actions.append(newBtn, renBtn, delBtn);
  row.append(item, actions);
  wrap.appendChild(row);

  const chatsWrap = document.createElement("div");
  chatsWrap.className = "project-chats";
  const projChats = allChats
    .filter(c => c.projectId === project.id)
    .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
  if (projChats.length === 0) {
    const empty = document.createElement("div");
    empty.className = "project-empty";
    empty.textContent = "No chats yet";
    chatsWrap.appendChild(empty);
  } else {
    projChats.forEach(c => chatsWrap.appendChild(buildChatItem(c)));
  }
  const addChat = document.createElement("button");
  addChat.className = "project-newchat";
  addChat.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> New chat`;
  addChat.onclick = () => switchToChat(createChat(project.id));
  chatsWrap.appendChild(addChat);
  wrap.appendChild(chatsWrap);

  if (autoRenameProjectId === project.id) {
    autoRenameProjectId = null;
    setTimeout(() => startProjectRename(project, nameSpan), 0);
  }
  return wrap;
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

  const moveBtn = document.createElement("button");
  moveBtn.className = "chat-action-btn";
  moveBtn.title = "Move to project";
  moveBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`;
  moveBtn.onclick = (e) => { e.stopPropagation(); openMoveMenu(chat.id, moveBtn); };

  const expBtn = document.createElement("button");
  expBtn.className = "chat-action-btn";
  expBtn.title = "Export as Markdown";
  expBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;
  expBtn.onclick = (e) => { e.stopPropagation(); exportChat(chat.id, chat.title); };

  const delBtn = document.createElement("button");
  delBtn.className = "chat-action-btn delete";
  delBtn.title = "Delete";
  delBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
  delBtn.onclick = (e) => { e.stopPropagation(); deleteChat(chat.id); };

  actions.append(pinBtn, renBtn, moveBtn, expBtn, delBtn);
  wrap.append(btn, actions);
  return wrap;
}

// ── Move-to-project popup ─────────────────────────────────
function closeMoveMenu() { document.getElementById("moveMenu")?.remove(); }

function openMoveMenu(chatId, anchorBtn) {
  closeMoveMenu();
  const projects = loadProjects();
  const chat = loadChats().find(c => c.id === chatId);

  const menu = document.createElement("div");
  menu.className = "move-menu";
  menu.id = "moveMenu";

  const label = document.createElement("div");
  label.className = "move-menu-label";
  label.textContent = "Move to";
  menu.appendChild(label);

  const folderSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`;

  if (chat && chat.projectId) {
    const rec = document.createElement("button");
    rec.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`;
    rec.appendChild(document.createTextNode(" Recents (remove)"));
    rec.onclick = () => { moveChatToProject(chatId, null); closeMoveMenu(); };
    menu.appendChild(rec);
  }

  if (!projects.length) {
    const none = document.createElement("button");
    none.disabled = true;
    none.textContent = "No projects yet";
    menu.appendChild(none);
  } else {
    projects.forEach(p => {
      const b = document.createElement("button");
      if (chat && chat.projectId === p.id) b.className = "current";
      b.innerHTML = folderSvg;
      b.appendChild(document.createTextNode(" " + p.name));
      b.onclick = () => { moveChatToProject(chatId, p.id); closeMoveMenu(); };
      menu.appendChild(b);
    });
  }

  document.body.appendChild(menu);
  const r = anchorBtn.getBoundingClientRect();
  const top = Math.min(r.bottom + 6, window.innerHeight - menu.offsetHeight - 10);
  const left = Math.min(r.left, window.innerWidth - menu.offsetWidth - 10);
  menu.style.top = `${Math.max(10, top)}px`;
  menu.style.left = `${Math.max(10, left)}px`;
}

function switchToChat(chatId) {
  closeProjectsView();
  if (tempMode) { tempMode = false; appEl.classList.remove("temp-mode"); }
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
  updateTopbar();
}

// ── Temporary chat (nothing is saved) ─────────────────────
function localTs() { const t = Date.now(); return { toMillis: () => t, toDate: () => new Date(t) }; }

function enterTempChat() {
  if (tempMode) return;
  closeProjectsView();
  cancelGeneration();
  if (msgUnsubscribe) { msgUnsubscribe(); msgUnsubscribe = null; }
  prevChatId = currentChatId;
  tempMode = true;
  currentChatId = null;
  currentMessages = [];
  document.querySelectorAll(".chat-item.active").forEach(el => el.classList.remove("active"));
  appEl.classList.add("temp-mode");
  if (window.innerWidth < 900) closeSidebar();
  renderMessages([]);
  updateTopbar();
  inputEl.focus();
}

function exitTempChat() {
  if (!tempMode) return;
  tempMode = false;
  currentMessages = [];
  appEl.classList.remove("temp-mode");
  const chats = loadChats();
  const id = (prevChatId && chats.some(c => c.id === prevChatId))
    ? prevChatId
    : (chats[0] ? chats[0].id : createChat());
  switchToChat(id);
}

function toggleTempChat() {
  if (!currentUser) return;
  tempMode ? exitTempChat() : enterTempChat();
}

// Generate an assistant reply for the in-memory temp conversation.
async function generateTempReply(history, attachment = null) {
  setResponding(true);
  let ok = false, aiReply = "";
  try {
    aiReply = await streamAssistantReply(history, attachment);
  } catch (err) {
    console.error("Temp AI error:", err);
  }
  setResponding(false);
  // The user may have left temp mode mid-stream (Esc / chat switch); in that
  // case currentMessages now belongs to a real chat — don't leak into it.
  if (!tempMode) return;
  if (aiReply && aiReply.trim()) {
    currentMessages.push({ _id: "t" + genId(), role: "assistant", content: aiReply, timestamp: localTs() });
    ok = true;
  }
  document.getElementById("streamingMsg")?.remove();
  renderMessages(currentMessages);
  if (!ok) showEphemeralError("Sorry, something went wrong.");
  inputEl.focus();
}

async function sendTempMessage(userContent, attachment) {
  const priorHistory = currentMessages
    .slice(-AI_CONFIG.historyLimit)
    .map(m => ({ role: m.role, content: m.content }));
  currentMessages.push({ _id: "t" + genId(), role: "user", content: userContent, timestamp: localTs() });
  renderMessages(currentMessages);
  scrollToBottom();
  await generateTempReply([...priorHistory, { role: "user", content: userContent }], attachment);
}

// Abort an in-flight AI stream and clear its transient bubble.
function cancelGeneration() {
  if (abortController) { try { abortController.abort(); } catch (_) {} }
  streaming = null;
  document.getElementById("streamingMsg")?.remove();
  stopSpeaking();
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
const accountBtn      = document.getElementById("accountBtn");
const accountModal    = document.getElementById("accountModal");
const messagesEl      = document.getElementById("messages");
const inputEl         = document.getElementById("messageInput");
const sendBtn         = document.getElementById("sendBtn");
const typingEl        = document.getElementById("typingIndicator");
const resetBtn        = document.getElementById("resetChatBtn");
const deleteModal     = document.getElementById("deleteModal");
const settingsBtn     = document.getElementById("settingsBtn");
const settingsPopup   = document.getElementById("settingsPopup");
const attachBtn       = document.getElementById("attachBtn");
const fileInput       = document.getElementById("fileInput");
const filePreview     = document.getElementById("filePreview");
const filePreviewName = document.getElementById("filePreviewName");
const attachPopup     = document.getElementById("attachPopup");
const modelSwitcherBtn  = document.getElementById("modelSwitcherBtn");
const modelSwitcherName = document.getElementById("modelSwitcherName");
const modelMenu         = document.getElementById("modelMenu");

// ── Splash + first-visit welcome ──────────────────────────
const splashEl     = document.getElementById("splash");
const welcomeModal = document.getElementById("welcomeModal");
const welcomeStart = document.getElementById("welcomeStart");
const welcomeClose = document.getElementById("welcomeClose");

const splashStart = Date.now();
let splashDone = false;

function hideSplash() {
  if (splashDone) return;
  splashDone = true;
  const wait = Math.max(0, 850 - (Date.now() - splashStart)); // let the intro play
  setTimeout(() => {
    if (splashEl) {
      splashEl.classList.add("hide");
      setTimeout(() => splashEl.remove(), 550);
    }
    maybeShowWelcome();
  }, wait);
}
setTimeout(hideSplash, 2600); // safety net if auth never resolves

function maybeShowWelcome() {
  let seen = false;
  try { seen = !!localStorage.getItem("almail_welcomed"); } catch (e) { seen = true; }
  if (!seen) welcomeModal.style.display = "flex";
}
function closeWelcome() {
  try { localStorage.setItem("almail_welcomed", "1"); } catch (e) {}
  welcomeModal.style.display = "none";
}
welcomeClose.onclick = closeWelcome;
welcomeStart.onclick = () => {
  closeWelcome();
  if (!currentUser) openAuthModal();
  else inputEl.focus();
};
welcomeModal.addEventListener("click", e => { if (e.target === welcomeModal) closeWelcome(); });

// Re-open the welcome tour from Settings → What's new
document.getElementById("settingsWhatsNew").onclick = () => {
  settingsPopup.classList.remove("open");
  welcomeModal.style.display = "flex";
};

document.getElementById("settingsFeedbackBtn").onclick = () => {
  settingsPopup.classList.remove("open");
  window.location.href = "mailto:shelbysog@gmail.com?subject=" + encodeURIComponent("Almail AI feedback");
};

document.getElementById("settingsHelpBtn").onclick = () => {
  settingsPopup.classList.remove("open");
  shortcutsModal.style.display = "flex";   // defined later; available at click time
};

// ── Personalization modal ─────────────────────────────────
const personalizeModal   = document.getElementById("personalizeModal");
const customInstructions = document.getElementById("customInstructions");
const creativitySeg      = document.getElementById("creativitySeg");

function openPersonalize() {
  settingsPopup.classList.remove("open");
  const s = getUserSettings();
  customInstructions.value = s.instructions;
  let matched = false;
  creativitySeg.querySelectorAll(".seg-btn").forEach(b => {
    const on = parseFloat(b.dataset.temp) === s.temperature;
    b.classList.toggle("active", on);
    if (on) matched = true;
  });
  if (!matched) creativitySeg.querySelector('[data-temp="0.7"]').classList.add("active");
  personalizeModal.style.display = "flex";
  setTimeout(() => customInstructions.focus(), 50);
}
function closePersonalize() { personalizeModal.style.display = "none"; }

document.getElementById("settingsPersonalize").onclick = openPersonalize;
document.getElementById("personalizeClose").onclick = closePersonalize;
document.getElementById("personalizeCancel").onclick = closePersonalize;
personalizeModal.addEventListener("click", e => { if (e.target === personalizeModal) closePersonalize(); });

creativitySeg.querySelectorAll(".seg-btn").forEach(btn => {
  btn.onclick = () => {
    creativitySeg.querySelectorAll(".seg-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
  };
});

document.getElementById("personalizeSave").onclick = () => {
  const active = creativitySeg.querySelector(".seg-btn.active");
  saveUserSettings({
    instructions: customInstructions.value.trim(),
    temperature: active ? parseFloat(active.dataset.temp) : 0.7
  });
  closePersonalize();
};

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
// Action buttons stopPropagation so the strip's expand-on-click handler
// doesn't also pop the sidebar open underneath them.
document.getElementById("si-new").onclick    = (e) => { e.stopPropagation(); document.getElementById("resetChatBtn").click(); };
document.getElementById("si-chats").onclick  = openSidebar;
document.getElementById("si-expand").onclick = openSidebar;
document.getElementById("si-account").onclick = (e) => {
  e.stopPropagation();
  currentUser ? openAccountModal() : openAuthModal();
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

// Reflect auth state on the sidebar Account tab.
function updateAccountUI(user) {
  const nameEl = document.getElementById("accountNavName");
  const subEl  = document.getElementById("accountNavSub");
  const avatar = document.getElementById("accountNavAvatar");
  const letter = avatar && avatar.querySelector(".account-nav-letter");
  if (!nameEl) return;
  if (user && user.email) {
    nameEl.textContent = friendlyName(user) || "Your account";
    subEl.textContent  = user.email;
    if (letter) letter.textContent = user.email[0].toUpperCase();
    avatar.classList.add("has-user");
  } else {
    nameEl.textContent = "Sign in";
    subEl.textContent  = "Save & sync your chats";
    if (letter) letter.textContent = "";
    avatar.classList.remove("has-user");
  }
}

accountBtn.onclick = () => { currentUser ? openAccountModal() : openAuthModal(); };

// ── Account modal ─────────────────────────────────────────
function openAccountModal() {
  if (!currentUser) { openAuthModal(); return; }
  const email = currentUser.email || "";
  document.getElementById("accountAvatar").textContent   = (email[0] || "A").toUpperCase();
  document.getElementById("accountName").textContent     = friendlyName(currentUser) || "Your account";
  document.getElementById("accountEmailTop").textContent = email;
  document.getElementById("accountRowEmail").textContent = email;
  let since = "—";
  try {
    const t = currentUser.metadata && currentUser.metadata.creationTime;
    if (t) since = new Date(t).toLocaleDateString([], { year: "numeric", month: "long", day: "numeric" });
  } catch (e) {}
  document.getElementById("accountRowSince").textContent = since;
  document.getElementById("accountRowChats").textContent = String(loadChats().length);
  applyAvatar();
  resetDeleteAccountBtn();
  settingsPopup.classList.remove("open");
  accountModal.style.display = "flex";
  if (window.innerWidth < 900) closeSidebar();
}
function closeAccountModal() { accountModal.style.display = "none"; resetDeleteAccountBtn(); }

document.getElementById("accountClose").onclick = closeAccountModal;
accountModal.addEventListener("click", e => { if (e.target === accountModal) closeAccountModal(); });

// ── Profile picture (stored locally per account) ──────────
function avatarKey(uid)   { return "avatar:" + uid; }
function getAvatar(uid)   { try { return uid ? (localStorage.getItem(avatarKey(uid)) || "") : ""; } catch (e) { return ""; } }
function storeAvatar(uid, dataUrl) {
  try { dataUrl ? localStorage.setItem(avatarKey(uid), dataUrl) : localStorage.removeItem(avatarKey(uid)); } catch (e) {}
}

function paintAvatar(el, url) {
  if (!el) return;
  if (url) { el.style.backgroundImage = `url("${url}")`; el.classList.add("has-photo"); }
  else     { el.style.backgroundImage = "";              el.classList.remove("has-photo"); }
}

// Push the current account's picture to every avatar slot — the sidebar
// tab, the collapsed mini-strip (visible when the sidebar is closed), and
// the account modal.
function applyAvatar() {
  const url = currentUser ? getAvatar(currentUser.uid) : "";
  paintAvatar(document.getElementById("accountNavAvatar"), url);
  paintAvatar(document.getElementById("si-account"), url);
  paintAvatar(document.getElementById("accountAvatar"), url);
  const removeBtn = document.getElementById("accountRemovePhoto");
  if (removeBtn) removeBtn.style.display = url ? "inline-block" : "none";
}

// Resize/centre-crop a chosen image to a small square data URL, then store it.
function handleAvatarFile(file) {
  if (!file || !currentUser) return;
  if (!file.type || !file.type.startsWith("image/")) { showToast("Please choose an image file."); return; }
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      const size = 256;
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = size;
      const ctx = canvas.getContext("2d");
      const min = Math.min(img.width, img.height);
      const sx = (img.width - min) / 2, sy = (img.height - min) / 2;
      ctx.drawImage(img, sx, sy, min, min, 0, 0, size, size);
      let dataUrl;
      try { dataUrl = canvas.toDataURL("image/jpeg", 0.85); }
      catch (e) { showToast("Couldn't process that image."); return; }
      storeAvatar(currentUser.uid, dataUrl);
      applyAvatar();
      showToast("Profile picture updated");
    };
    img.onerror = () => showToast("Couldn't load that image.");
    img.src = reader.result;
  };
  reader.onerror = () => showToast("Couldn't read that file.");
  reader.readAsDataURL(file);
}

const avatarInput = document.getElementById("avatarInput");
document.getElementById("accountAvatarBtn").onclick = () => avatarInput.click();
avatarInput.onchange = (e) => { handleAvatarFile(e.target.files && e.target.files[0]); e.target.value = ""; };
document.getElementById("accountRemovePhoto").onclick = () => {
  if (!currentUser) return;
  storeAvatar(currentUser.uid, "");
  applyAvatar();
  showToast("Profile picture removed");
};

document.getElementById("accountReset").onclick = async () => {
  if (!currentUser || !currentUser.email) return;
  try {
    await sendPasswordResetEmail(auth, currentUser.email);
    showToast("Password reset link sent to " + currentUser.email);
  } catch (e) {
    showToast("Couldn't send reset link — please try again.");
  }
};

document.getElementById("accountLogout").onclick = () => { closeAccountModal(); signOut(auth); };

// Delete account: two-step confirm to avoid accidental taps.
let deleteAcctArmed = false, deleteAcctTimer = null;
function resetDeleteAccountBtn() {
  deleteAcctArmed = false;
  clearTimeout(deleteAcctTimer);
  const b = document.getElementById("accountDelete");
  if (b) { b.classList.remove("armed"); b.querySelector(".acc-action-label").textContent = "Delete account"; }
}
document.getElementById("accountDelete").onclick = async () => {
  if (!currentUser) return;
  const btn = document.getElementById("accountDelete");
  const label = btn.querySelector(".acc-action-label");
  if (!deleteAcctArmed) {
    deleteAcctArmed = true;
    btn.classList.add("armed");
    label.textContent = "Tap again to permanently delete";
    deleteAcctTimer = setTimeout(resetDeleteAccountBtn, 4000);
    return;
  }
  clearTimeout(deleteAcctTimer);
  try {
    await deleteUser(currentUser);
    closeAccountModal();
    showToast("Your account has been deleted.");
  } catch (e) {
    if (e && e.code === "auth/requires-recent-login") {
      showToast("For security, log out and back in, then delete again.");
    } else {
      showToast("Couldn't delete account — please try again.");
    }
    resetDeleteAccountBtn();
  }
};

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
  document.querySelectorAll(".brand-logo, .empty-logo").forEach(img => {
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
const COMPOSER_MAX_H = 180;
function autoResize() {
  inputEl.style.height = "24px";
  inputEl.style.height = Math.min(inputEl.scrollHeight, COMPOSER_MAX_H) + "px";
  inputEl.style.lineHeight = inputEl.scrollHeight > 24 ? "1.5" : "24px";
  inputEl.style.overflowY = inputEl.scrollHeight >= COMPOSER_MAX_H ? "auto" : "hidden";
}

// The whole composer behaves like one big input: clicking anywhere on it
// (except a button) focuses the textarea.
document.querySelector(".footer-input-row").addEventListener("click", (e) => {
  if (!e.target.closest("button") && !inputEl.disabled) inputEl.focus();
});

// Light up the send button only when there's something to send.
function updateSendState() {
  sendBtn.classList.toggle("has-text", inputEl.value.trim().length > 0 && !isResponding);
}

inputEl.addEventListener("input", () => { autoResize(); updateSendState(); });

// ── Conversation search ───────────────────────────────────
const chatSearch = document.getElementById("chatSearch");
if (chatSearch) {
  chatSearch.addEventListener("input", () => { chatFilter = chatSearch.value; renderChatList(); });
}

// ── Attach popup ──────────────────────────────────────────
attachBtn.onclick = (e) => { e.stopPropagation(); attachPopup.classList.toggle("open"); };
document.getElementById("attachFilesBtn").onclick = () => { attachPopup.classList.remove("open"); fileInput.click(); };

// Camera capture (mobile/touch devices) — opens the camera directly.
const cameraInput = document.getElementById("cameraInput");
const takePhotoBtn = document.getElementById("takePhotoBtn");
const hasCamera = (navigator.maxTouchPoints > 0) ||
  (window.matchMedia && window.matchMedia("(pointer: coarse)").matches);
if (takePhotoBtn) {
  if (!hasCamera) {
    takePhotoBtn.style.display = "none";   // capture is a mobile feature
  } else {
    takePhotoBtn.onclick = () => { attachPopup.classList.remove("open"); cameraInput.click(); };
  }
}
if (cameraInput) {
  cameraInput.onchange = () => {
    const file = cameraInput.files[0];
    cameraInput.value = "";
    handleAttachedFile(file);
  };
}

const MAX_ATTACH_TEXT = 20000; // chars — keep prompts within a sane size
const MAX_IMAGE_DIM   = 1600;  // px — phone photos get downscaled to this
const TEXT_FILE_RE = /\.(txt|md|markdown|csv|tsv|json|ya?ml|xml|html?|css|js|jsx|ts|tsx|py|java|c|cpp|cs|rb|go|rs|php|sh|sql|log)$/i;

function showAttachmentPreview(name, thumbUrl) {
  filePreviewName.textContent = name;
  const thumb = document.getElementById("filePreviewThumb");
  if (thumb) {
    if (thumbUrl) { thumb.src = thumbUrl; thumb.style.display = "block"; }
    else          { thumb.removeAttribute("src"); thumb.style.display = "none"; }
  }
  filePreview.style.display = "flex";
}

// Downscale/compress large images so photos don't blow the API payload
// limits. Resolves null when the original is already small (or can't be
// decoded — HEIC on non-Safari, for instance), in which case we send as-is.
function downscaleImage(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, MAX_IMAGE_DIM / Math.max(img.width, img.height));
      if (scale === 1 && file.size < 900 * 1024) { resolve(null); return; }
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      try { resolve(canvas.toDataURL("image/jpeg", 0.85)); }
      catch (_) { resolve(null); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

async function handleAttachedFile(file) {
  if (!file || !currentUser) return;

  if (file.type.startsWith("image/")) {
    const scaled = await downscaleImage(file);
    if (scaled) {
      pendingAttachment = { type: "image", data: scaled.split(",")[1], mimeType: "image/jpeg", name: file.name };
      showAttachmentPreview(file.name, scaled);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      pendingAttachment = { type: "image", data: reader.result.split(",")[1], mimeType: file.type, name: file.name };
      showAttachmentPreview(file.name, reader.result);
    };
    reader.readAsDataURL(file);
    return;
  }

  // Only read text-like files; binary (pdf/doc/…) can't be extracted client-side.
  if (file.type.startsWith("text/") || TEXT_FILE_RE.test(file.name)) {
    let text = await file.text();
    if (text.length > MAX_ATTACH_TEXT) text = text.slice(0, MAX_ATTACH_TEXT) + "\n…(truncated)";
    pendingAttachment = { type: "text", content: text, name: file.name };
  } else {
    pendingAttachment = { type: "note", name: file.name }; // filename referenced, content not read
  }
  showAttachmentPreview(file.name);
}

fileInput.onchange = () => {
  const file = fileInput.files[0];
  fileInput.value = "";
  handleAttachedFile(file);
};
document.getElementById("fileRemoveBtn").onclick = () => { pendingAttachment = null; filePreview.style.display = "none"; };

// ── Drag-and-drop & paste to attach ───────────────────────
const dropOverlay = document.getElementById("dropOverlay");
let dragDepth = 0;
const dragHasFiles = (e) => e.dataTransfer && Array.from(e.dataTransfer.types || []).includes("Files");

window.addEventListener("dragenter", (e) => {
  if (!currentUser || !dragHasFiles(e)) return;
  dragDepth++;
  dropOverlay.classList.add("show");
});
window.addEventListener("dragover", (e) => { if (dragHasFiles(e)) e.preventDefault(); });
window.addEventListener("dragleave", () => {
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) dropOverlay.classList.remove("show");
});
window.addEventListener("drop", (e) => {
  if (!dragHasFiles(e)) return;
  e.preventDefault();
  dragDepth = 0;
  dropOverlay.classList.remove("show");
  if (currentUser && e.dataTransfer.files[0]) handleAttachedFile(e.dataTransfer.files[0]);
});

inputEl.addEventListener("paste", (e) => {
  if (!currentUser) return;
  const items = e.clipboardData && e.clipboardData.items;
  if (!items) return;
  for (const it of items) {
    if (it.kind === "file" && it.type.startsWith("image/")) {
      const file = it.getAsFile();
      if (file) { e.preventDefault(); handleAttachedFile(file); }
      break;
    }
  }
});

// ── Global popups close on outside click ──────────────────
document.addEventListener("click", (e) => {
  if (!settingsPopup.contains(e.target) && e.target !== settingsBtn) settingsPopup.classList.remove("open");
  if (!attachPopup.contains(e.target)   && e.target !== attachBtn)   attachPopup.classList.remove("open");
  if (!modelMenu.contains(e.target)     && e.target !== modelSwitcherBtn && !modelSwitcherBtn.contains(e.target)) modelMenu.classList.remove("open");
  if (!e.target.closest(".menu-btn") && !e.target.closest(".menu"))
    document.querySelectorAll(".menu.open").forEach(m => m.classList.remove("open"));
  if (!e.target.closest(".move-menu")) closeMoveMenu();
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
emailInput.addEventListener("keydown", e => { if (e.key === "Enter") passInput.focus(); });
passInput.addEventListener("keydown", e => { if (e.key === "Enter") handleAuth(!isLoginMode); });

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
    // textContent (not innerHTML): the language comes from model output and
    // could otherwise smuggle markup through the class attribute.
    const langSpan = document.createElement("span");
    langSpan.className = "code-lang";
    langSpan.textContent = lang || "code";
    header.appendChild(langSpan);

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
  const near = isNearBottom();
  scrollBottomBtn.classList.toggle("visible", !near);
  if (near) scrollBottomBtn.classList.remove("has-new"); // caught up — clear badge
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
function renderMessages(list = currentMessages) {
  // Remember which IDs are already rendered so we don't re-animate them
  const alreadyRendered = new Set(
    [...messagesEl.querySelectorAll(".message[data-id]")].map(el => el.dataset.id)
  );

  messagesEl.innerHTML = "";

  if (list.length === 0) {
    const logoSrc = isLight ? "Almail-AI-Black-Logo.png" : "Almail AI Logo.png";
    const name = friendlyName(currentUser);
    const heading = name ? `${timeGreeting()}, ${name}` : timeGreeting();
    messagesEl.innerHTML = `
      <div class="empty-state">
        <img src="${logoSrc}" alt="Almail AI" class="empty-logo" />
        <h2 id="greetingText"></h2>
        <p>How can I help you today?</p>
        <div class="suggestions" id="suggestionRow"></div>
      </div>`;
    const row = document.getElementById("suggestionRow");
    // A fresh random sample each visit keeps the home screen feeling alive.
    const pool = [...SUGGESTION_POOL].sort(() => Math.random() - 0.5).slice(0, 4);
    pool.forEach(sug => {
      const chip = document.createElement("button");
      chip.className = "chip";
      chip.innerHTML = sug.icon; // static, developer-authored SVG strings
      chip.appendChild(document.createTextNode(" " + sug.label));
      chip.onclick = () => {
        if (!currentUser || isResponding) return;
        inputEl.value = sug.prompt;
        sendMessage();
      };
      row.appendChild(chip);
    });
    typeText(document.getElementById("greetingText"), heading);
    return;
  }

  let lastDayKey = null;
  list.forEach((msg, i) => {
    // Date separator whenever the calendar day changes (Today / Yesterday / date).
    if (msg.timestamp && msg.timestamp.toDate) {
      const d = msg.timestamp.toDate();
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (key !== lastDayKey) {
        lastDayKey = key;
        const sep = document.createElement("div");
        sep.className = "date-sep";
        const span = document.createElement("span");
        span.textContent = dayLabel(d);
        sep.appendChild(span);
        messagesEl.appendChild(sep);
      }
    }
    const isOwn     = msg.role === "user";
    const prevRole  = i > 0 ? list[i - 1].role : null;
    const nextRole  = i < list.length - 1 ? list[i + 1].role : null;
    const grouped   = prevRole === msg.role;
    const groupTail = nextRole !== msg.role;

    const div = document.createElement("div");
    div.dataset.id = msg._id;
    div.className = ["message", isOwn ? "self" : "other",
      grouped ? "grouped" : "", groupTail ? "group-tail" : ""].filter(Boolean).join(" ");
    if (alreadyRendered.has(msg._id)) div.style.animation = "none";

    const textDiv = document.createElement("div");
    textDiv.className = "message-text";
    textDiv.innerHTML = renderMarkdown(msg.content);
    enhanceCodeBlocks(textDiv);

    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = `${isOwn ? "You" : "Almail AI"} · ${relativeTime(msg.timestamp)}`;
    if (msg.timestamp) meta.title = formatTime(msg.timestamp);

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

        const editor = document.createElement("div");
        editor.className = "edit-wrap";
        const editArea = document.createElement("textarea");
        editArea.className = "edit-textarea";
        editArea.value = msg.content || "";
        const row = document.createElement("div");
        row.className = "edit-actions";
        const cancelBtn = document.createElement("button");
        cancelBtn.className = "edit-cancel";
        cancelBtn.textContent = "Cancel";
        const saveBtn = document.createElement("button");
        saveBtn.className = "edit-save";
        saveBtn.textContent = "Save & submit";
        row.append(cancelBtn, saveBtn);
        editor.append(editArea, row);
        textDiv.replaceWith(editor);
        editArea.focus();
        editArea.setSelectionRange(editArea.value.length, editArea.value.length);

        const cancel = () => editor.replaceWith(textDiv);
        const save = () => {
          const newText = editArea.value.trim();
          if (!newText) return;
          if (newText === (msg.content || "").trim()) { cancel(); return; }
          editAndResubmit(msg._id, newText);   // re-renders on snapshot
        };
        cancelBtn.onclick = cancel;
        saveBtn.onclick = save;
        editArea.addEventListener("keydown", (ev) => {
          if (ev.key === "Enter" && !ev.shiftKey) { ev.preventDefault(); save(); }
          if (ev.key === "Escape") cancel();
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
          setTimeout(() => { deleteId = msg._id; deleteModal.style.display = "flex"; }, 50);
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
      regenBtn.onclick = () => regenerateMessage(msg._id);

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

      actions.append(regenBtn);

      // Read-aloud (only where speech synthesis is available)
      if (window.speechSynthesis) {
        const speakBtn = document.createElement("button");
        speakBtn.className = "msg-action-btn";
        speakBtn.title = "Read aloud";
        speakBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>`;
        speakBtn.onclick = () => toggleSpeak(msg.content || "", speakBtn);
        actions.append(speakBtn);
      }

      actions.append(cpBtn);

      // Lightweight, local feedback (👍/👎) — acknowledges, exclusive toggle.
      const upBtn = document.createElement("button");
      upBtn.className = "msg-action-btn";
      upBtn.title = "Good response";
      upBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>`;
      const downBtn = document.createElement("button");
      downBtn.className = "msg-action-btn";
      downBtn.title = "Bad response";
      downBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"/></svg>`;
      upBtn.onclick = () => {
        const on = upBtn.classList.toggle("rated");
        downBtn.classList.remove("rated");
        if (on) showToast("Thanks for your feedback");
      };
      downBtn.onclick = () => {
        const on = downBtn.classList.toggle("rated");
        upBtn.classList.remove("rated");
        if (on) showToast("Thanks — we'll use this to improve");
      };
      actions.append(upBtn, downBtn);

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

  const history = currentMessages.slice(0, msgIndex)
    .slice(-AI_CONFIG.historyLimit)
    .map(m => ({ role: m.role, content: m.content }));

  if (tempMode) {
    currentMessages.splice(msgIndex);   // drop this reply (and anything after)
    renderMessages(currentMessages);
    await generateTempReply(history);
    return;
  }

  const targetChatId = currentChatId;

  // Remove this reply AND everything after it, so the regenerated reply
  // becomes the new tail (otherwise it would append after later messages
  // and scramble the conversation order).
  const toDelete = currentMessages.slice(msgIndex).map(m => m._id);
  await Promise.all(toDelete.map(id => deleteDoc(doc(db, "users", currentUser.uid, "messages", id))));

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

// ── Edit a user message and regenerate from that point ────
async function editAndResubmit(docId, newText) {
  if (isResponding || !currentUser) return;
  const idx = currentMessages.findIndex(m => m._id === docId);
  if (idx === -1) return;

  if (tempMode) {
    currentMessages[idx].content = newText;
    currentMessages.splice(idx + 1);    // truncate everything after the edit
    renderMessages(currentMessages);
    await generateTempReply(currentMessages.slice(-AI_CONFIG.historyLimit).map(m => ({ role: m.role, content: m.content })));
    return;
  }

  const targetChatId = currentChatId;
  const history = currentMessages.slice(0, idx)
    .slice(-AI_CONFIG.historyLimit)
    .map(m => ({ role: m.role, content: m.content }));
  history.push({ role: "user", content: newText });
  const toDelete = currentMessages.slice(idx + 1).map(m => m._id);

  try {
    await updateDoc(doc(db, "users", currentUser.uid, "messages", docId), { content: newText });
    await Promise.all(toDelete.map(id => deleteDoc(doc(db, "users", currentUser.uid, "messages", id))));
  } catch (err) {
    console.error("Edit failed:", err);
    return;
  }

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
    console.error("Edit regenerate error:", err);
    document.getElementById("streamingMsg")?.remove();
    showEphemeralError("Sorry, something went wrong.", () => retryReply(targetChatId));
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

  let firstSnap = true;
  let lastSeenId = null;

  msgUnsubscribe = onSnapshot(q, snapshot => {
    if (chatId !== currentChatId || tempMode) return; // ignore stale / temp-chat

    deleteModal.style.display = "none";
    deleteId = null;

    const docs = snapshot.docs
      .slice()
      .sort((a, b) => tsMillis(a.data().timestamp) - tsMillis(b.data().timestamp));
    currentMessages = docs.map(d => ({ ...d.data(), _id: d.id }));

    const nearBottom = messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < 100;
    renderMessages(currentMessages);

    const last = currentMessages[currentMessages.length - 1];

    if (firstSnap) {
      // Opening a chat always lands on the latest message.
      firstSnap = false;
      lastSeenId = last ? last._id : null;
      scrollBottomBtn.classList.remove("has-new"); // don't carry a stale badge over
      scrollToBottom(false);
      return;
    }

    if (nearBottom || currentMessages.length <= 1) {
      scrollToBottom();
    } else if (last && last.role === "assistant" && last._id !== lastSeenId) {
      // A reply arrived while the user was scrolled up reading — badge the
      // jump-to-latest button instead of yanking their scroll position.
      scrollBottomBtn.classList.add("has-new");
    }
    lastSeenId = last ? last._id : null;
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
  updateAccountUI(user);
  applyAvatar();
  if (user) {
    closeAuthModal();
    inputEl.disabled           = false;
    sendBtn.disabled           = false;
    attachBtn.disabled         = false;
    micBtn.disabled            = false;
    startPlaceholders();
    initChats();
  } else {
    cancelGeneration();
    stopPlaceholders();
    tempMode = false;
    appEl.classList.remove("temp-mode");
    if (msgUnsubscribe) { msgUnsubscribe(); msgUnsubscribe = null; }
    currentChatId     = null;
    currentMessages   = [];
    isResponding      = false;
    typingEl.classList.remove("active");
    sendBtn.classList.remove("generating");
    sendBtn.title              = "Send";
    closeAccountModal();
    inputEl.placeholder        = "Log in to start chatting…";
    inputEl.disabled           = true;
    sendBtn.disabled           = true;
    attachBtn.disabled         = true;
    micBtn.disabled            = true;
    messagesEl.innerHTML       = "";
    document.getElementById("chatList").innerHTML = "";
    document.getElementById("projectList").innerHTML = "";
    closeProjectsView();
    deleteModal.style.display  = "none";
    deleteId = null;
    updateSendState();
    updateTopbar();
  }
  hideSplash();
});

// ── New chat button ───────────────────────────────────────
resetBtn.onclick = () => {
  if (!currentUser) return;
  switchToChat(createChat());
  if (window.innerWidth < 900) closeSidebar();
};

const tempChatBtn = document.getElementById("tempChatBtn");
if (tempChatBtn) tempChatBtn.onclick = toggleTempChat;
const siTempBtn = document.getElementById("si-temp");
if (siTempBtn) siTempBtn.onclick = (e) => { e.stopPropagation(); toggleTempChat(); };

const newProjectBtn = document.getElementById("newProjectBtn");
if (newProjectBtn) newProjectBtn.onclick = () => {
  if (!currentUser) return;
  openProjectsView();
};
document.getElementById("cancelDeleteProject").onclick = () => {
  document.getElementById("deleteProjectModal").style.display = "none";
  pendingDeleteProjectId = null;
};
document.getElementById("confirmDeleteProject").onclick = confirmDeleteProject;
document.getElementById("deleteProjectModal").addEventListener("click", e => {
  if (e.target.id === "deleteProjectModal") { e.currentTarget.style.display = "none"; pendingDeleteProjectId = null; }
});

// ── Projects dashboard page wiring ────────────────────────
const openProjectsBtn = document.getElementById("openProjectsBtn");
if (openProjectsBtn) openProjectsBtn.onclick = openProjectsView;

const pvSearch = document.getElementById("pvSearch");
if (pvSearch) pvSearch.addEventListener("input", () => { pvSearchQ = pvSearch.value; renderProjectsView(); });

document.querySelectorAll(".pv-tab").forEach(tab => {
  tab.onclick = () => {
    document.querySelectorAll(".pv-tab").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    pvTab = tab.dataset.tab;
    renderProjectsView();
  };
});

const pvNew = document.getElementById("pvNew");
if (pvNew) pvNew.onclick = () => {
  if (!currentUser) return;
  createProject();
  renderChatList();      // refreshes sidebar + (since page is open) the grid
};

// ── Ephemeral error bubble ────────────────────────────────
function showEphemeralError(msg, onRetry) {
  const div = document.createElement("div");
  div.className = "message other error-msg group-tail";
  div.style.marginTop = "12px";
  const span = document.createElement("span");
  span.textContent = msg;
  div.appendChild(span);
  if (onRetry) {
    const btn = document.createElement("button");
    btn.className = "retry-btn";
    btn.textContent = "Retry";
    btn.onclick = () => { div.remove(); onRetry(); };
    div.appendChild(btn);
  }
  messagesEl.appendChild(div);
  messagesEl.scrollTo({ top: messagesEl.scrollHeight, behavior: "smooth" });
}

// ── Send message ──────────────────────────────────────────
async function sendMessage() {
  if (!currentUser || isResponding) return;
  if (!currentChatId && !tempMode) return;
  const text = inputEl.value.trim();
  if (!text && !pendingAttachment) return;

  if (!navigator.onLine) { updateOnline(); return; } // keep the user's text; banner shows why

  const attachment  = pendingAttachment;
  inputEl.value     = "";
  inputEl.style.height = "24px";
  inputEl.style.lineHeight = "24px";
  inputEl.style.overflowY = "hidden";
  pendingAttachment = null;
  filePreview.style.display = "none";

  const userContent = attachment
    ? `${text}${text ? "\n" : ""}[Attached: ${attachment.name}]`
    : text;

  if (tempMode) { await sendTempMessage(userContent, attachment); return; }

  // Snapshot the context BEFORE writing the new message so it isn't duplicated
  // when the Firestore listener updates currentMessages.
  const priorHistory = currentMessages
    .slice(-AI_CONFIG.historyLimit)
    .map(m => ({ role: m.role, content: m.content }));

  setResponding(true);

  const targetChatId = currentChatId;   // keep the reply in this chat even if the user switches
  const messagesRef = collection(db, "users", currentUser.uid, "messages");

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
    showEphemeralError("Sorry, something went wrong.", () => retryReply(targetChatId));
  } finally {
    setResponding(false);
    inputEl.focus();
  }
}

// Toggle UI between idle and "generating" (where the send button stops the stream).
// The composer stays enabled so the user can type their next message while
// the reply streams in (sendMessage guards against double-send).
function setResponding(on) {
  isResponding       = on;
  attachBtn.disabled = on;
  sendBtn.disabled   = false;          // stays clickable so it can act as Stop
  sendBtn.classList.toggle("generating", on);
  sendBtn.title = on ? "Stop generating" : "Send";
  if (!on) typingEl.classList.remove("active");
  updateSendState();
}

function stopGenerating() {
  if (abortController) abortController.abort();
}

sendBtn.onclick = () => { if (isResponding) stopGenerating(); else sendMessage(); };
inputEl.addEventListener("keydown", e => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
});

// ── Voice input (speech-to-text) ──────────────────────────
const micBtn = document.getElementById("micBtn");
(function () {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR || !micBtn) { if (micBtn) micBtn.style.display = "none"; return; }
  const rec = new SR();
  rec.continuous = false;
  rec.interimResults = true;
  rec.lang = navigator.language || "en-US";
  let listening = false, baseText = "";

  rec.onresult = (e) => {
    let interim = "", final = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const tr = e.results[i][0].transcript;
      if (e.results[i].isFinal) final += tr; else interim += tr;
    }
    inputEl.value = [baseText, final, interim].filter(Boolean).join(" ").replace(/\s+/g, " ");
    autoResize(); updateSendState();
  };
  const stop = () => { listening = false; micBtn.classList.remove("listening"); };
  rec.onend = stop;
  rec.onerror = stop;

  micBtn.onclick = () => {
    if (!currentUser) return;
    if (listening) { rec.stop(); return; }
    baseText = inputEl.value.trim();
    try { rec.start(); listening = true; micBtn.classList.add("listening"); inputEl.focus(); } catch (_) {}
  };
})();

// ── Read aloud (text-to-speech) ───────────────────────────
let speakingBtn = null;
function toggleSpeak(content, btn) {
  const synth = window.speechSynthesis;
  if (!synth) return;
  if (speakingBtn === btn) { synth.cancel(); return; }   // tapping the active one stops
  synth.cancel();
  const tmp = document.createElement("div");
  tmp.innerHTML = renderMarkdown(content);
  const text = (tmp.textContent || "").trim();
  if (!text) return;
  const u = new SpeechSynthesisUtterance(text);
  u.onend = u.onerror = () => { btn.classList.remove("speaking"); if (speakingBtn === btn) speakingBtn = null; };
  speakingBtn = btn;
  btn.classList.add("speaking");
  synth.speak(u);
}
function stopSpeaking() { if (window.speechSynthesis) window.speechSynthesis.cancel(); speakingBtn = null; }

// ── Retry a failed reply ──────────────────────────────────
async function retryReply(targetChatId) {
  if (isResponding || !currentUser) return;
  setResponding(true);
  try {
    const history = currentMessages.slice(-AI_CONFIG.historyLimit).map(m => ({ role: m.role, content: m.content }));
    const aiReply = await streamAssistantReply(history, null);
    if (aiReply && aiReply.trim()) {
      await addDoc(collection(db, "users", currentUser.uid, "messages"), {
        role: "assistant", content: aiReply, chatId: targetChatId, timestamp: serverTimestamp()
      });
    } else {
      document.getElementById("streamingMsg")?.remove();
    }
  } catch (err) {
    console.error("Retry error:", err);
    document.getElementById("streamingMsg")?.remove();
    showEphemeralError("Still couldn't get a response. Please try again.", () => retryReply(targetChatId));
  } finally {
    setResponding(false);
    inputEl.focus();
  }
}

// ── Keyboard shortcuts ────────────────────────────────────
const shortcutsModal = document.getElementById("shortcutsModal");
function toggleShortcuts() {
  shortcutsModal.style.display = shortcutsModal.style.display === "flex" ? "none" : "flex";
}
document.getElementById("shortcutsClose").onclick = () => { shortcutsModal.style.display = "none"; };
shortcutsModal.addEventListener("click", e => { if (e.target === shortcutsModal) shortcutsModal.style.display = "none"; });

document.addEventListener("keydown", (e) => {
  const mod = e.metaKey || e.ctrlKey;
  const tag = (document.activeElement && document.activeElement.tagName || "").toLowerCase();
  const inField = tag === "input" || tag === "textarea" || (document.activeElement && document.activeElement.isContentEditable);

  if (e.key === "Escape" && accountModal.style.display === "flex") { closeAccountModal(); return; }
  if (mod && e.key.toLowerCase() === "k") { e.preventDefault(); if (currentUser) resetBtn.click(); return; }
  if (mod && e.key.toLowerCase() === "b") { e.preventDefault(); appEl.classList.contains("sidebar-open") ? closeSidebar() : openSidebar(); return; }
  if ((mod && e.key === "/") || (e.key === "?" && !inField)) { e.preventDefault(); toggleShortcuts(); return; }
  if (e.key === "/" && !mod && !inField) { e.preventDefault(); inputEl.focus(); return; }
});

// ── Offline detection ─────────────────────────────────────
const offlineBanner = document.getElementById("offlineBanner");
function updateOnline() { offlineBanner.classList.toggle("show", !navigator.onLine); }
window.addEventListener("online", updateOnline);
window.addEventListener("offline", updateOnline);
updateOnline();

// ── Home-screen suggestion pool (4 sampled at random per visit) ─
const SUG_ICON = (paths) => `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
const SUGGESTION_POOL = [
  { icon: SUG_ICON('<path d="M9.66 18h4.68M12 2a7 7 0 0 1 4 12.7c-.5.4-.8 1-.8 1.6V17H8.8v-.7c0-.6-.3-1.2-.8-1.6A7 7 0 0 1 12 2z"/>'),
    label: "Explain something simply", prompt: "Explain a complex topic in simple terms" },
  { icon: SUG_ICON('<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 5L2 7"/>'),
    label: "Draft a professional email", prompt: "Help me write a professional email" },
  { icon: SUG_ICON('<path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3z"/>'),
    label: "Brainstorm creative ideas", prompt: "Give me some creative ideas to brainstorm" },
  { icon: SUG_ICON('<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>'),
    label: "Write some code", prompt: "Write a Python function to check if a number is prime, with comments" },
  { icon: SUG_ICON('<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>'),
    label: "Summarize an article", prompt: "Summarize this article for me — I'll paste it in my next message" },
  { icon: SUG_ICON('<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>'),
    label: "Practice a language", prompt: "Help me practice conversational Spanish — start a simple beginner dialogue with me" },
  { icon: SUG_ICON('<path d="M12 2v20M2 12h20"/><circle cx="12" cy="12" r="9"/>'),
    label: "Plan a quick dinner", prompt: "Suggest a quick dinner recipe using common pantry ingredients" },
  { icon: SUG_ICON('<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>'),
    label: "Plan my day", prompt: "Help me plan a productive day — start by asking what's on my plate" },
  { icon: SUG_ICON('<path d="m8 2 1.88 1.88M14.12 3.88 16 2M9 7.13v-1a3.003 3.003 0 1 1 6 0v1"/><path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6z"/><path d="M12 20v-9"/>'),
    label: "Debug my code", prompt: "Help me debug some code — I'll paste it in my next message" },
  { icon: SUG_ICON('<path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/>'),
    label: "Tell me a story", prompt: "Write a very short story with a twist ending" },
  { icon: SUG_ICON('<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>'),
    label: "Quiz me on trivia", prompt: "Quiz me with 5 general-knowledge questions, one at a time — wait for my answer each time" },
  { icon: SUG_ICON('<path d="M6.5 6.5 12 12l5.5-5.5M12 12v9"/><circle cx="12" cy="5" r="3"/>'),
    label: "Make a workout plan", prompt: "Create a simple 20-minute home workout plan, no equipment" },
];

// ── Rotating composer placeholder ─────────────────────────
const PLACEHOLDERS = [
  "Ask anything…", "Summarize an article…", "Write me a poem…",
  "Explain a tricky concept…", "Draft a polite email…",
  "Help me debug some code…", "Brainstorm a few ideas…"
];
let phIdx = 0, phTimer = null;
function startPlaceholders() {
  stopPlaceholders();
  inputEl.placeholder = PLACEHOLDERS[0];
  phTimer = setInterval(() => {
    if (document.activeElement === inputEl || inputEl.value || isResponding) return;
    phIdx = (phIdx + 1) % PLACEHOLDERS.length;
    inputEl.placeholder = PLACEHOLDERS[phIdx];
  }, 3500);
}
function stopPlaceholders() { if (phTimer) { clearInterval(phTimer); phTimer = null; } }

// ── AI providers (Mistral / Gemini) ───────────────────────
// User personalization (custom instructions + creativity).
function getUserSettings() {
  let s = {};
  try { s = JSON.parse(localStorage.getItem("almail_settings") || "{}"); } catch (e) {}
  return {
    instructions: typeof s.instructions === "string" ? s.instructions : "",
    temperature: typeof s.temperature === "number" ? s.temperature : 0.7
  };
}
function saveUserSettings(s) {
  try { localStorage.setItem("almail_settings", JSON.stringify(s)); } catch (e) {}
}

// Which provider answers new messages — persisted across reloads.
// A saved choice whose key was removed falls back to the default.
let currentProvider = (() => {
  try {
    const saved = localStorage.getItem("aiProvider");
    if (saved && PROVIDERS[saved] && PROVIDERS[saved].apiKey) return saved;
  } catch (e) {}
  return DEFAULT_PROVIDER;
})();

// ── Model switcher (top bar) ──────────────────────────────
function buildModelMenu() {
  modelMenu.innerHTML = "";
  Object.keys(PROVIDERS).forEach(id => {
    const p = PROVIDERS[id];
    const item = document.createElement("button");
    item.className = "model-menu-item";
    item.dataset.provider = id;
    const noKey = !p.apiKey;
    item.innerHTML = `
      <span class="model-menu-check"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span>
      <span class="model-menu-text"><strong>${p.label}</strong><small>${noKey ? "Coming soon" : (p.tagline || p.model)}</small></span>`;
    if (noKey) item.classList.add("unavailable");
    item.onclick = () => setProvider(id);
    modelMenu.appendChild(item);
  });
  updateModelMenuChecks();
}

function updateModelMenuChecks() {
  modelMenu.querySelectorAll(".model-menu-item").forEach(el => {
    el.classList.toggle("active", el.dataset.provider === currentProvider);
  });
}

function updateModelSwitcherUI() {
  const p = PROVIDERS[currentProvider];
  modelSwitcherName.textContent = p ? p.label : "Model";
  updateModelMenuChecks();
}

function openModelMenu()  { modelMenu.classList.add("open"); }
function closeModelMenu() { modelMenu.classList.remove("open"); }

function setProvider(id) {
  if (!PROVIDERS[id]) return;
  if (!PROVIDERS[id].apiKey) { showToast(`${PROVIDERS[id].label} isn't available yet`); return; }
  const changed = id !== currentProvider;
  currentProvider = id;
  try { localStorage.setItem("aiProvider", id); } catch (e) {}
  updateModelSwitcherUI();
  closeModelMenu();
  if (changed) showToast(`Now chatting with ${PROVIDERS[id].label}`);
}

modelSwitcherBtn.onclick = (e) => {
  e.stopPropagation();
  modelMenu.classList.contains("open") ? closeModelMenu() : openModelMenu();
};

buildModelMenu();
updateModelSwitcherUI();

function fullSystemPrompt() {
  const { instructions } = getUserSettings();
  return AI_CONFIG.systemPrompt +
    (instructions ? `\n\nThe user has provided these custom instructions — follow them:\n${instructions}` : "");
}

// Build the OpenAI-style message array (Mistral) — with optional file/image context.
function buildOpenAIMessages(messages, attachment = null) {
  return [
    { role: "system", content: fullSystemPrompt() },
    ...messages.map((msg, i) => {
      const isLastUser = msg.role === "user" && i === messages.length - 1;
      const role = msg.role === "user" ? "user" : "assistant";
      if (isLastUser && attachment?.type === "text") {
        return { role, content: `File: "${attachment.name}"\n${attachment.content}\n\nUser: ${msg.content}` };
      }
      if (isLastUser && attachment?.type === "image" && attachment.data) {
        return {
          role,
          content: [
            { type: "text", text: msg.content || "Describe this image." },
            { type: "image_url", image_url: { url: `data:${attachment.mimeType};base64,${attachment.data}` } }
          ]
        };
      }
      return { role, content: msg.content };
    })
  ];
}

// Build Gemini's { systemInstruction, contents } request shape (roles are
// "user" / "model", and images go in inline_data instead of image_url).
function buildGeminiContents(messages, attachment = null) {
  const contents = messages.map((msg, i) => {
    const isLastUser = msg.role === "user" && i === messages.length - 1;
    const role = msg.role === "user" ? "user" : "model";
    if (isLastUser && attachment?.type === "text") {
      return { role, parts: [{ text: `File: "${attachment.name}"\n${attachment.content}\n\nUser: ${msg.content}` }] };
    }
    if (isLastUser && attachment?.type === "image" && attachment.data) {
      return {
        role,
        parts: [
          { text: msg.content || "Describe this image." },
          { inline_data: { mime_type: attachment.mimeType, data: attachment.data } }
        ]
      };
    }
    return { role, parts: [{ text: msg.content || "" }] };
  });
  return { systemInstruction: { parts: [{ text: fullSystemPrompt() }] }, contents };
}

// Drive a streamed reply: manages the live bubble, typing indicator, abort,
// and falls back to a single request if streaming fails. Returns final text.
// Dispatches to whichever provider is currently selected.
async function streamAssistantReply(history, attachment) {
  abortController = new AbortController();
  streaming = { text: "", started: false };
  typingEl.classList.add("active");
  scrollToBottom();

  const onDelta = (full) => {
    if (!streaming) return;
    if (!streaming.started) {
      streaming.started = true;
      typingEl.classList.remove("active");
    }
    const stick = isNearBottom();
    streaming.text = full;
    scheduleStreamRender(stick);
  };

  let finalText = "";
  try {
    finalText = (currentProvider === "gemini")
      ? await streamGemini(history, attachment, abortController.signal, onDelta)
      : await streamMistral(buildOpenAIMessages(history, attachment), abortController.signal, onDelta);
  } catch (err) {
    if (err.name === "AbortError") {
      finalText = streaming ? streaming.text : "";
    } else {
      console.error("Stream failed, falling back:", err);
      typingEl.classList.add("active");
      try {
        // Pass the signal so Stop also aborts the fallback request.
        finalText = await getAIResponse(history, attachment, abortController.signal);
      } catch (err2) {
        if (err2.name === "AbortError") finalText = "";
        else throw err2; // real failure → handled by caller
      }
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
  const p = PROVIDERS.mistral;
  const res = await fetch(p.endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${p.apiKey}` },
    body: JSON.stringify({ model: p.model, messages: apiMessages, stream: true, temperature: getUserSettings().temperature }),
    signal
  });

  if (!res.ok || !res.body) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`API ${res.status}: ${err?.error?.message || res.statusText}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "", full = "";

  const handleLine = (line) => {
    const t = line.trim();
    if (!t.startsWith("data:")) return;
    const payload = t.slice(5).trim();
    if (!payload || payload === "[DONE]") return;
    try {
      const json = JSON.parse(payload);
      const delta = json.choices?.[0]?.delta?.content || "";
      if (delta) { full += delta; onDelta(full); }
    } catch (_) { /* partial JSON spanning chunks — ignore */ }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    lines.forEach(handleLine);
  }
  handleLine(buffer); // flush a final line that arrived without a trailing \n

  if (!full) throw new Error("Empty stream response");
  return full;
}

// SSE streaming for Gemini (data: {candidates:[{content:{parts:[{text}]}}]}).
// Each chunk's text is an incremental delta, same shape as Mistral's stream.
async function streamGemini(history, attachment, signal, onDelta) {
  const p = PROVIDERS.gemini;
  if (!p.apiKey) throw new Error("No Gemini API key configured — add one in config.js.");

  const { systemInstruction, contents } = buildGeminiContents(history, attachment);
  const res = await fetch(`${p.endpoint}/${p.model}:streamGenerateContent?alt=sse`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": p.apiKey },
    body: JSON.stringify({ contents, systemInstruction, generationConfig: { temperature: getUserSettings().temperature } }),
    signal
  });

  if (!res.ok || !res.body) {
    const err = await res.json().catch(() => ({}));
    const msg = Array.isArray(err) ? err[0]?.error?.message : err?.error?.message;
    throw new Error(`API ${res.status}: ${msg || res.statusText}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "", full = "";

  const handleLine = (line) => {
    const t = line.trim();
    if (!t.startsWith("data:")) return;
    const payload = t.slice(5).trim();
    if (!payload) return;
    try {
      const json = JSON.parse(payload);
      const delta = (json.candidates?.[0]?.content?.parts || []).map(pt => pt.text || "").join("");
      if (delta) { full += delta; onDelta(full); }
    } catch (_) { /* partial JSON spanning chunks — ignore */ }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    lines.forEach(handleLine);
  }
  handleLine(buffer); // flush a final line that arrived without a trailing \n

  if (!full) throw new Error("Empty stream response");
  return full;
}

// Non-streaming fallback — dispatches to whichever provider is selected.
async function getAIResponse(messages, attachment = null, signal = undefined) {
  return (currentProvider === "gemini")
    ? getGeminiResponse(messages, attachment, signal)
    : getMistralResponse(messages, attachment, signal);
}

async function getMistralResponse(messages, attachment = null, signal = undefined) {
  const p = PROVIDERS.mistral;
  const res = await fetch(p.endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${p.apiKey}` },
    body: JSON.stringify({ model: p.model, messages: buildOpenAIMessages(messages, attachment), temperature: getUserSettings().temperature }),
    signal
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`API ${res.status}: ${err?.error?.message || res.statusText}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || "No response received.";
}

async function getGeminiResponse(messages, attachment = null, signal = undefined) {
  const p = PROVIDERS.gemini;
  if (!p.apiKey) throw new Error("No Gemini API key configured — add one in config.js.");

  const { systemInstruction, contents } = buildGeminiContents(messages, attachment);
  const res = await fetch(`${p.endpoint}/${p.model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": p.apiKey },
    body: JSON.stringify({ contents, systemInstruction, generationConfig: { temperature: getUserSettings().temperature } }),
    signal
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = Array.isArray(err) ? err[0]?.error?.message : err?.error?.message;
    throw new Error(`API ${res.status}: ${msg || res.statusText}`);
  }

  const data = await res.json();
  const parts = data.candidates?.[0]?.content?.parts || [];
  return parts.map(pt => pt.text || "").join("").trim() || "No response received.";
}

// ── Delete message handlers ───────────────────────────────
document.getElementById("cancelDelete").onclick = () => { deleteModal.style.display = "none"; deleteId = null; };
document.getElementById("confirmDelete").onclick = async () => {
  if (deleteId) {
    if (tempMode) {
      const i = currentMessages.findIndex(m => m._id === deleteId);
      if (i !== -1) { currentMessages.splice(i, 1); renderMessages(currentMessages); }
    } else if (currentUser) {
      await deleteDoc(doc(db, "users", currentUser.uid, "messages", deleteId));
    }
  }
  deleteModal.style.display = "none";
  deleteId = null;
};

// ── Delete chat handlers ──────────────────────────────────
const deleteChatModal = document.getElementById("deleteChatModal");
const deleteProjectModal = document.getElementById("deleteProjectModal");
document.getElementById("cancelDeleteChat").onclick = () => {
  deleteChatModal.style.display = "none";
  pendingDeleteChatId = null;
};
document.getElementById("confirmDeleteChat").onclick = confirmDeleteChat;
deleteChatModal.addEventListener("click", e => { if (e.target === deleteChatModal) { deleteChatModal.style.display = "none"; pendingDeleteChatId = null; } });

// ── Esc closes the topmost overlay ────────────────────────
document.addEventListener("keydown", e => {
  if (e.key !== "Escape") return;
  if (document.getElementById("moveMenu")) { closeMoveMenu(); return; }
  if (settingsPopup.classList.contains("open")) { settingsPopup.classList.remove("open"); return; }
  if (attachPopup.classList.contains("open"))   { attachPopup.classList.remove("open");   return; }
  if (modelMenu.classList.contains("open"))     { closeModelMenu(); return; }
  const openMenu = document.querySelector(".menu.open");
  if (openMenu) { openMenu.classList.remove("open"); return; }
  if (welcomeModal.style.display === "flex") { closeWelcome(); return; }
  for (const m of [authModal, deleteModal, deleteChatModal, deleteProjectModal, shortcutsModal, personalizeModal]) {
    if (m.style.display === "flex") {
      m.style.display = "none";
      deleteId = null;
      pendingDeleteChatId = null;
      pendingDeleteProjectId = null;
      return;
    }
  }
  if (projectsViewOpen()) { closeProjectsView(); return; }
});

// ── Helpers ───────────────────────────────────────────────
function tsMillis(ts) {
  return ts && ts.toMillis ? ts.toMillis() : Number.POSITIVE_INFINITY;
}

function timeGreeting() {
  const h = new Date().getHours();
  if (h < 5)  return "Good evening";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function friendlyName(user) {
  if (!user || !user.email) return "";
  const local = user.email.split("@")[0].split(/[._\-+]/)[0];
  return local ? local.charAt(0).toUpperCase() + local.slice(1) : "";
}

// Typewriter effect (used for the home greeting). A token cancels any earlier
// run if the empty state re-renders, and reduced-motion gets the text instantly.
let typeToken = 0;
function typeText(el, text) {
  if (!el) return;
  const myToken = ++typeToken;
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce) { el.textContent = text; return; }
  el.textContent = "";
  el.classList.add("typing-caret");
  let i = 0;
  (function tick() {
    if (myToken !== typeToken || !el.isConnected) return;
    if (i <= text.length) {
      el.textContent = text.slice(0, i++);
      setTimeout(tick, 42);
    } else {
      setTimeout(() => { if (myToken === typeToken) el.classList.remove("typing-caret"); }, 700);
    }
  })();
}

function formatTime(ts) {
  if (!ts) return "";
  const date = ts.toDate ? ts.toDate() : new Date(ts);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// "Today" / "Yesterday" / a readable date — used by the in-chat day separators.
function dayLabel(date) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const that  = new Date(date); that.setHours(0, 0, 0, 0);
  const diff = Math.round((today - that) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  const sameYear = that.getFullYear() === today.getFullYear();
  return date.toLocaleDateString([], sameYear
    ? { month: "long", day: "numeric" }
    : { month: "long", day: "numeric", year: "numeric" });
}

// Compact relative time for message meta ("just now", "5m ago", "Mar 5").
function relativeTime(ts) {
  if (!ts || !ts.toMillis) return "now";
  const sec = Math.floor((Date.now() - ts.toMillis()) / 1000);
  if (sec < 45) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return ts.toDate().toLocaleDateString([], { month: "short", day: "numeric" });
}

// Export a conversation as a Markdown file.
async function exportChat(chatId, title) {
  if (!currentUser) return;
  try {
    const snap = await getDocs(query(
      collection(db, "users", currentUser.uid, "messages"),
      where("chatId", "==", chatId)
    ));
    const msgs = snap.docs
      .map(d => d.data())
      .sort((a, b) => tsMillis(a.timestamp) - tsMillis(b.timestamp));
    if (!msgs.length) { return; }

    const safeTitle = (title || "Conversation").trim();
    let md = `# ${safeTitle}\n\n*Exported from Almail AI · ${new Date().toLocaleString()}*\n\n---\n\n`;
    for (const m of msgs) {
      md += `**${m.role === "user" ? "You" : "Almail AI"}**\n\n${m.content || ""}\n\n`;
    }

    const filename = (safeTitle.replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").toLowerCase() || "chat") + ".md";
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error("Export failed:", err);
  }
}
