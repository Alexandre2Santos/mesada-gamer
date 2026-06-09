/*
  js/app.js
  - Frontend da Mesada Gamer
  - Mantém estado local, autenticação, renderização de views e
    integração com o backend via API REST.
  - Em modo offline, usa localStorage; em modo online, usa rotas /api.
*/

// ─── STATE (estado local do frontend)
// `state` mantém os dados do aplicativo quando o backend não está
// disponível ou em modo local. Também é usado para renderizar a UI.
let state = {
  users: [],
  currentUserId: null,
  currentUsername: null,
  currentChildId: null,
  currentChildName: null,
  currentChildAvatar: null,
  children: [],
  tasks: [],
  childTasks: [],
  transactions: [],
  childTransactions: [],
  rewards: [
    {
      id: r(),
      emoji: "💰",
      name: "Resgate em Pix / Espécie",
      cost: 0,
      special: "cash",
    },
    { id: r(), emoji: "🎮", name: "1h extra de videogame", cost: 10 },
    { id: r(), emoji: "🎬", name: "Escolher filme do fim de semana", cost: 8 },
    { id: r(), emoji: "🌙", name: "Dormir mais tarde no sábado", cost: 12 },
    { id: r(), emoji: "🍕", name: "Escolher o jantar", cost: 6 },
    { id: r(), emoji: "🎠", name: "Passeio especial", cost: 30 },
  ],
  transactions: [],
};
let pendingCompleteTask = null;
let pendingRedeemReward = null;

function r() {
  return Math.random().toString(36).slice(2, 8);
}

// Salva o estado atual da aplicação no localStorage do navegador.
function save() {
  try {
    localStorage.setItem("mesadaGamer", JSON.stringify(state));
  } catch (e) {}
}
// Carrega o estado salvo do localStorage, se existir.
function load() {
  try {
    const d = localStorage.getItem("mesadaGamer");
    if (d) state = JSON.parse(d);
  } catch (e) {}
}
load();

// --- SUPABASE INTEGRATION (opcional)
// Configure SUPABASE_URL e SUPABASE_ANON_KEY para usar Supabase como banco.
// Para criar as tabelas necessárias, veja supabase-schema.sql na raiz do projeto.
// O SDK é carregado via CDN no index.html.
const SUPABASE_URL = "https://ejzuwpdbigeypggodwlq.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVqenV3cGRidWJnZXlwZ2dvZHdscSIsInJvbGUiOiJhbm9uIiwiaWF0IjoxNzAxODYxODQyLCJleHAiOjE5MjcyNTc4NDJ9CvL5pxK-lwOgYpN7emnK0GduMIPKWtLwqP6H7ICMUh8";
let supabase = null;
const usingSupabase = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

// Inicializa o cliente Supabase na primeira necessidade
function ensureSupabase() {
  if (!usingSupabase) return false;
  if (supabase) return true;
  if (typeof window.supabase === "undefined") {
    console.warn("Supabase SDK não carregado");
    return false;
  }
  supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  console.log("✓ Supabase cliente inicializado");
  return true;
}

async function supabaseSelect(table, conditions = {}) {
  if (!ensureSupabase()) return [];
  let query = supabase.from(table).select("*");
  Object.entries(conditions).forEach(([key, value]) => {
    query = query.eq(key, value);
  });
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

async function supabaseInsert(table, row) {
  if (!ensureSupabase()) return null;
  const { data, error } = await supabase.from(table).insert([row]);
  if (error) throw error;
  return data?.[0] || null;
}

async function supabaseDelete(table, conditions = {}) {
  if (!ensureSupabase()) return null;
  let query = supabase.from(table).delete();
  Object.entries(conditions).forEach(([key, value]) => {
    query = query.eq(key, value);
  });
  const { data, error } = await query;
  if (error) throw error;
  return data || null;
}

// Ensure a default parent account exists and migrate existing data
// Gera um hash local de senha para o modo offline/localStorage.
// Em modo backend, a API usa bcrypt no servidor.
async function hashPassword(pwd) {
  try {
    const enc = new TextEncoder();
    const data = enc.encode(pwd);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch (e) {
    return btoa(pwd);
  }
}

// Garante que um usuário pai padrão esteja sempre disponível
// para iniciar o aplicativo localmente sem backend.
// Garante que exista um usuário pai padrão no modo local.
// Isso permite usar o app mesmo sem backend configurado.
async function ensureDefaultUser() {
  if (!state.users || !state.users.length) {
    const id = r();
    const pwdHash = await hashPassword("admin");
    state.users = [
      {
        id,
        username: "admin",
        passwordHash: pwdHash,
        created_at: new Date().toISOString(),
      },
    ];
    // Migrate existing children/tasks/transactions to default user
    state.children = state.children.map((c) => ({ ...c, ownerId: id }));
    state.tasks = state.tasks.map((t) => ({ ...t, ownerId: id }));
    state.transactions = state.transactions.map((t) => ({ ...t, ownerId: id }));
    save();
    renderAll();
  }
}
ensureDefaultUser();

// --- API client + auth token handling (integração com backend)
const TOKEN_KEY = "mesadaToken";
const CHILD_TOKEN_KEY = "mesadaChildToken";

// Armazena token de pai e dados do usuário no localStorage
// para manter sessão ativa entre recarregamentos de página.
function setAuth(token, user) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch (e) {}
  state.currentUserId = user?.id || null;
  state.currentUsername = user?.username || null;
  save();
}

// Armazena token de filho e dados do perfil da criança no localStorage.
function setChildAuth(token, child) {
  try {
    localStorage.setItem(CHILD_TOKEN_KEY, token);
  } catch (e) {}
  state.currentChildId = child?.id || null;
  state.currentChildName = child?.name || null;
  state.currentChildAvatar = child?.avatar || null;
  save();
}

function clearChildAuth() {
  try {
    localStorage.removeItem(CHILD_TOKEN_KEY);
  } catch (e) {}
  state.currentChildId = null;
  state.currentChildName = null;
  state.currentChildAvatar = null;
  state.childTasks = [];
  state.childTransactions = [];
  save();
}

// Cliente HTTP para rotas do filho. Envia token infantil no header.
async function apiChildFetch(path, opts = {}) {
  const token = localStorage.getItem(CHILD_TOKEN_KEY);
  const headers = opts.headers || {};
  if (!(opts.body instanceof FormData))
    headers["Content-Type"] = "application/json";
  if (token) headers["Authorization"] = "Bearer " + token;
  const res = await fetch("/api" + path, { ...opts, headers });
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch (e) {
    body = text;
  }
  if (!res.ok) throw body || { error: "request_failed" };
  return body;
}

// Busca informações e dados do filho autenticado ao carregar a sessão.
async function fetchChildForSession() {
  const token = localStorage.getItem(CHILD_TOKEN_KEY);
  if (!token && usingSupabase && state.currentChildId) {
    try {
      const child = state.children.find((c) => c.id === state.currentChildId);
      const tasks = await supabaseSelect("tasks", {
        child_id: state.currentChildId,
      });
      const transactions = await supabaseSelect("transactions", {
        child_id: state.currentChildId,
      });
      state.childTasks = tasks.map((t) => ({
        id: t.id,
        name: t.name,
        childId: t.child_id,
        ownerId: t.ownerId,
        value: Number(t.value),
        period: t.period,
        status: t.status,
        note: t.note,
        photo: t.photo,
      }));
      state.childTransactions = transactions.map((tr) => ({
        id: tr.id,
        childId: tr.child_id,
        ownerId: tr.ownerId,
        amount: Number(tr.amount),
        desc: tr.description,
        created_at: tr.created_at,
      }));
      save();
      renderAll();
      return;
    } catch (e) {
      console.warn("Supabase fetchChildForSession failed", e);
    }
  }
  if (!token) return;
  try {
    const child = await apiChildFetch("/child/me");
    const tasks = await apiChildFetch("/child/tasks");
    const transactions = await apiChildFetch("/child/transactions");
    state.currentChildId = child.child.id;
    state.currentChildName = child.child.name;
    state.currentChildAvatar = child.child.avatar;
    state.childTasks = tasks.map((t) => ({
      id: t.id,
      name: t.name,
      childId: t.child_id,
      ownerId: t.ownerId,
      value: Number(t.value),
      period: t.period,
      status: t.status,
      note: t.note,
      photo: t.photo,
    }));
    state.childTransactions = transactions.map((tr) => ({
      id: tr.id,
      childId: tr.child_id,
      ownerId: tr.ownerId,
      amount: Number(tr.amount),
      desc: tr.description,
      created_at: tr.created_at,
    }));
    save();
    renderAll();
  } catch (e) {
    console.warn("fetchChildForSession failed", e);
  }
}

// Realiza login de filho. Primeiro tenta modo local, depois backend.
async function childLogin() {
  const name = document.getElementById("child-login-name").value.trim();
  const birthdate = document.getElementById("child-login-birthdate").value;
  if (!name || !birthdate) return toast("Preencha nome e data de nascimento.");

  const localChild = state.children.find((c) => c.name === name);
  if (localChild && localChild.passwordHash) {
    const attemptHash = await hashPassword(birthdate);
    if (attemptHash === localChild.passwordHash) {
      setChildAuth("local-" + localChild.id, localChild);
      state.childTasks = state.tasks.filter((t) => t.childId === localChild.id);
      state.childTransactions = state.transactions.filter(
        (t) => t.childId === localChild.id,
      );
      save();
      closeModal("modal-child-login");
      toast("Bem-vindo, " + localChild.name + "!");
      showView("kids");
      return;
    }
  }

  try {
    const res = await apiFetch("/child/login", {
      method: "POST",
      body: JSON.stringify({ name, birthdate }),
    });
    setChildAuth(res.token, res.child);
    await fetchChildForSession();
    closeModal("modal-child-login");
    toast("Bem-vindo, " + res.child.name + "!");
    showView("kids");
  } catch (err) {
    toast(err && err.error ? err.error : "Erro ao autenticar filho");
  }
}

// Desloga o filho removendo o token infantil e limpando o estado local.
function childLogout() {
  clearChildAuth();
  toast("Você saiu da conta do filho.");
}

// Desloga o pai removendo token de administrador e restaurando sessão vazia.
function clearAuth() {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch (e) {}
  state.currentUserId = null;
  state.currentUsername = null;
  save();
}

// Cliente HTTP para rotas autenticadas do pai. Adiciona token JWT no header.
async function apiFetch(path, opts = {}) {
  const token = localStorage.getItem(TOKEN_KEY);
  const headers = opts.headers || {};
  if (!(opts.body instanceof FormData))
    headers["Content-Type"] = "application/json";
  if (token) headers["Authorization"] = "Bearer " + token;
  try {
    const res = await fetch("/api" + path, { ...opts, headers });
    const text = await res.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch (e) {
      body = text;
    }
    if (!res.ok) throw body || { error: "request_failed" };
    return body;
  } catch (e) {
    throw { error: "network_error", message: e.message || "Network failure" };
  }
}

// Busca dados do pai autenticado: perfil, filhos, tarefas e transações.
async function fetchAllForUser() {
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token && usingSupabase && state.currentUserId) {
    try {
      const children = await supabaseSelect("children", {
        ownerId: state.currentUserId,
      });
      const tasks = await supabaseSelect("tasks", {
        ownerId: state.currentUserId,
      });
      const transactions = await supabaseSelect("transactions", {
        ownerId: state.currentUserId,
      });
      state.children = children.map((c) => ({
        id: c.id,
        name: c.name,
        avatar: c.avatar,
        ownerId: c.ownerId,
        birthdate: c.birthdate,
        created_at: c.created_at,
      }));
      state.tasks = tasks.map((t) => ({
        id: t.id,
        name: t.name,
        childId: t.child_id,
        ownerId: t.ownerId,
        value: Number(t.value),
        period: t.period,
        status: t.status,
        note: t.note,
        photo: t.photo,
      }));
      state.transactions = transactions.map((tr) => ({
        id: tr.id,
        childId: tr.child_id,
        ownerId: tr.ownerId,
        amount: Number(tr.amount),
        desc: tr.description,
        created_at: tr.created_at,
      }));
      renderAll();
      return;
    } catch (e) {
      console.warn("Supabase fetchAllForUser failed", e);
    }
  }
  if (!token) return;
  try {
    const me = await apiFetch("/me");
    state.currentUserId = me.user.id;
    state.currentUsername = me.user.username;
    const children = await apiFetch("/children");
    const tasks = await apiFetch("/tasks");
    const transactions = await apiFetch("/transactions");
    state.children = children.map((c) => ({
      id: c.id,
      name: c.name,
      avatar: c.avatar,
      ownerId: c.ownerId,
      created_at: c.created_at,
    }));
    state.tasks = tasks.map((t) => ({
      id: t.id,
      name: t.name,
      childId: t.child_id,
      ownerId: t.ownerId,
      value: Number(t.value),
      period: t.period,
      status: t.status,
      note: t.note,
      photo: t.photo,
    }));
    state.transactions = transactions.map((tr) => ({
      id: tr.id,
      childId: tr.child_id,
      ownerId: tr.ownerId,
      amount: Number(tr.amount),
      desc: tr.description,
      created_at: tr.created_at,
    }));
    renderAll();
  } catch (e) {
    console.warn("fetchAllForUser failed", e);
  }
}

// --- Autenticação de pais (registro / login / logout / trocar senha)
async function registerUser(username, password, autoLogin = false) {
  username = (username || "").trim();
  if (!username || !password) {
    toast("Informe usuário e senha para registrar.");
    return null;
  }
  if (state.users.find((u) => u.username === username)) {
    toast("Usuário já existe. Escolha outro nome.");
    return null;
  }
  const id = r();
  const passwordHash = await hashPassword(password);
  const user = {
    id,
    username,
    passwordHash,
    created_at: new Date().toISOString(),
  };
  state.users.push(user);
  if (autoLogin) state.currentUserId = id;
  save();
  renderAll();
  toast("Conta criada com sucesso!");
  return user;
}

async function registerUserFromModal() {
  const username = document.getElementById("login-username").value.trim();
  const password = document.getElementById("login-password").value;
  if (!username || !password) return toast("Preencha usuário e senha.");
  try {
    const res = await apiFetch("/register", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    setAuth(res.token, res.user);
    await fetchAllForUser();
    closeModal("modal-login");
    toast("Conta criada e logado como " + res.user.username);
  } catch (err) {
    // Se o backend estiver offline, registre localmente no browser.
    if (err && err.error === "network_error") {
      const user = await registerUser(username, password, true);
      if (user) {
        closeModal("modal-login");
        toast("Conta criada localmente como " + user.username);
        return;
      }
    }
    toast(err && err.error ? err.error : "Erro ao criar conta");
  }
}

async function loginUser() {
  const username = document.getElementById("login-username").value.trim();
  const password = document.getElementById("login-password").value;
  if (!username || !password) return toast("Preencha usuário e senha.");
  try {
    const res = await apiFetch("/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    setAuth(res.token, res.user);
    await fetchAllForUser();
    closeModal("modal-login");
    toast("Bem-vindo, " + res.user.username + "!");
  } catch (err) {
    if (err && err.error === "network_error") {
      const localUser = state.users.find((u) => u.username === username);
      if (localUser) {
        const hash = await hashPassword(password);
        if (hash === localUser.passwordHash) {
          setAuth("local-" + localUser.id, localUser);
          renderAll();
          closeModal("modal-login");
          toast("Bem-vindo (modo offline), " + localUser.username + "!");
          return;
        }
      }
    }
    toast(err && err.error ? err.error : "Erro ao autenticar");
  }
}

function logoutUser() {
  clearAuth();
  state.children = [];
  state.tasks = [];
  state.transactions = [];
  renderAll();
  toast("Você saiu da conta.");
}

async function changePassword() {
  if (!state.currentUserId) return toast("Faça login primeiro.");
  const oldP = prompt("Senha atual:");
  if (oldP === null) return;
  const newP = prompt("Nova senha:");
  if (!newP) return toast("Senha nova inválida.");
  const user = state.users.find((u) => u.id === state.currentUserId);
  const oldHash = await hashPassword(oldP);
  if (user.passwordHash !== oldHash) return toast("Senha atual incorreta.");
  user.passwordHash = await hashPassword(newP);
  save();
  toast("Senha alterada com sucesso.");
}

// ─── NAVEGAÇÃO (mostrar/ocultar views) ────────────────────
// Funções que controlam a navegação entre as telas (home, admin,
// kids e shop). O frontend simula múltiplas 'views' alterando classes.
let activeView = "home";
function showView(v) {
  if (v === "admin" && !state.currentUserId) {
    openModal("modal-login");
    return;
  }
  document
    .querySelectorAll(".view")
    .forEach((el) => el.classList.remove("active"));
  document
    .querySelectorAll(".nav-pill")
    .forEach((el) => el.classList.remove("active"));
  document.getElementById("view-" + v).classList.add("active");
  const pills = document.querySelectorAll(".nav-pill");
  const map = { home: 0, admin: 1, kids: 2, shop: 3 };
  pills[map[v]].classList.add("active");
  activeView = v;
  renderAll();
}

// ─── RENDER (atualiza a UI) ──────────────────────────────
// Conjunto de funções que leem o `state` e atualizam o DOM para
// refletir filhos, tarefas, extrato e demais elementos visuais.
function renderAll() {
  renderHome();
  renderAdmin();
  renderKids();
  renderShop();
  renderUserArea();
}

function renderUserArea() {
  const el = document.getElementById("user-area");
  if (!el) return;
  if (state.currentUserId) {
    const username =
      state.currentUsername ||
      state.users.find((u) => u.id === state.currentUserId)?.username ||
      "";
    el.innerHTML = `<div style="display:flex;gap:8px;align-items:center"><div style="color:var(--accent);font-family:'Orbitron',monospace">${username}</div><button class="btn btn-sm btn-ghost" onclick="changePassword()">Trocar senha</button><button class="btn btn-sm btn-ghost" onclick="logoutUser()">Sair</button></div>`;
  } else {
    el.innerHTML = `<button class="btn btn-sm btn-ghost" onclick="openModal('modal-login')">Entrar / Registrar</button>`;
  }
}

function fmtMoney(v) {
  return "R$ " + Number(v).toFixed(2).replace(".", ",");
}

function getChildBalance(childId, transactions = state.transactions) {
  return transactions
    .filter((t) => t.childId === childId)
    .reduce((sum, t) => sum + t.amount, 0);
}

function renderHome() {
  const totalTasks = state.tasks.length;
  const totalEarned = state.transactions.reduce(
    (s, t) => s + (t.amount > 0 ? t.amount : 0),
    0,
  );
  document.getElementById("home-total-tasks").textContent = totalTasks;
  document.getElementById("home-total-earned").textContent =
    fmtMoney(totalEarned);
  document.getElementById("home-total-kids").textContent =
    state.children.length;
}

function renderAdmin() {
  const cl = document.getElementById("children-list");
  // Require login
  if (!state.currentUserId) {
    cl.innerHTML =
      '<div style="color:var(--muted);font-size:.95rem;text-align:center;padding:18px;">Faça login para acessar a área dos pais.</div>';
    document.getElementById("task-child").innerHTML =
      '<option value="">Nenhum filho</option>';
    document.getElementById("bonus-child").innerHTML =
      '<option value="">Nenhum filho</option>';
    document.getElementById("pending-approvals").innerHTML =
      '<div style="color:var(--muted);font-size:.9rem;text-align:center;padding:20px;">Faça login para ver aprovações.</div>';
    document.getElementById("all-tasks-list").innerHTML =
      '<div style="color:var(--muted);font-size:.9rem;text-align:center;padding:20px;">Faça login para ver missões.</div>';
    return;
  }

  const myChildren = state.children.filter(
    (c) => c.ownerId === state.currentUserId,
  );
  if (!myChildren.length) {
    cl.innerHTML =
      '<div style="color:var(--muted);font-size:.95rem;text-align:center;padding:18px;">Nenhum filho cadastrado. Crie um perfil para começar.</div>';
  } else {
    cl.innerHTML = myChildren
      .map((c) => {
        const bal = getChildBalance(c.id);
        return `<div class="task-item" style="margin-top:8px;">
      <div style="font-size:1.6rem;">${c.avatar || "👤"}</div>
      <div class="task-info"><div class="task-name">${c.name}</div></div>
      <div class="task-value">${fmtMoney(bal)}</div>
      <button class="btn btn-sm btn-red btn-ghost" onclick="removeChild('${c.id}')">✕</button>
    </div>`;
      })
      .join("");
  }

  const childOpts = myChildren
    .map(
      (c) => `<option value="${c.id}">${c.avatar || "👤"} ${c.name}</option>`,
    )
    .join("");
  document.getElementById("task-child").innerHTML =
    childOpts || '<option value="">Nenhum filho</option>';
  document.getElementById("bonus-child").innerHTML =
    childOpts || '<option value="">Nenhum filho</option>';

  const pa = document.getElementById("pending-approvals");
  const pending = state.tasks.filter(
    (t) => t.ownerId === state.currentUserId && t.status === "done",
  );
  if (!pending.length) {
    pa.innerHTML =
      '<div style="color:var(--muted);font-size:.9rem;text-align:center;padding:20px;">Nenhuma tarefa aguardando aprovação.</div>';
  } else {
    pa.innerHTML = pending
      .map((t) => {
        const child = state.children.find((c) => c.id === t.childId);
        return `<div class="task-item done">
        <div style="font-size:1.4rem;">${child?.avatar || "👤"}</div>
        <div class="task-info">
          <div class="task-name">${t.name}</div>
          <div class="task-meta">${child?.name || "?"} · ${t.period}${t.note ? ' · "' + t.note + '"' : ""}</div>
          ${t.photo ? `<div style="font-size:.75rem;color:var(--accent);margin-top:3px;">📸 ${t.photo}</div>` : ""}
        </div>
        <div class="task-value">${fmtMoney(t.value)}</div>
        <div class="task-actions">
          <button class="btn btn-sm btn-green" onclick="approveTask('${t.id}')">✔ Aprovar</button>
          <button class="btn btn-sm btn-red" onclick="rejectTask('${t.id}')">✘ Rejeitar</button>
        </div>
      </div>`;
      })
      .join("");
  }

  const atl = document.getElementById("all-tasks-list");
  const myTasks = state.tasks.filter((t) => t.ownerId === state.currentUserId);
  if (!myTasks.length) {
    atl.innerHTML =
      '<div style="color:var(--muted);font-size:.9rem;text-align:center;padding:20px;">Nenhuma missão criada ainda.</div>';
  } else {
    atl.innerHTML = myTasks
      .map((t) => {
        const child = state.children.find((c) => c.id === t.childId);
        const badges = {
          pending: '<span class="badge badge-pending">⏳ Pendente</span>',
          done: '<span class="badge badge-done">📤 Em análise</span>',
          approved: '<span class="badge badge-approved">✅ Aprovada</span>',
          rejected: '<span class="badge badge-rejected">❌ Rejeitada</span>',
        };
        return `<div class="task-item ${t.status}">
        <div class="task-info">
          <div class="task-name">${t.name} &nbsp;${badges[t.status] || ""}</div>
          <div class="task-meta">${child?.name || "?"} · ${t.period}</div>
        </div>
        <div class="task-value">${fmtMoney(t.value)}</div>
        <button class="btn btn-sm btn-ghost" onclick="removeTask('${t.id}')">🗑</button>
      </div>`;
      })
      .join("");
  }
}

function renderKids() {
  const noKids = document.getElementById("no-kids-msg");
  const kidsPanel = document.getElementById("kids-panel");
  const loggedInAsChild = Boolean(state.currentChildId);

  if (!loggedInAsChild) {
    noKids.style.display = "none";
    kidsPanel.style.display = "block";
    document.getElementById("kid-selector").innerHTML = "";
    document.getElementById("kid-content").innerHTML = `
      <div class="card" style="text-align:center;max-width:520px;margin:0 auto;">
        <div style="font-size:2.5rem;margin-bottom:14px;">👋</div>
        <div style="font-family:'Orbitron',monospace;font-weight:700;font-size:1.1rem;margin-bottom:10px;">Acesso dos Filhos</div>
        <div style="color:var(--muted);margin-bottom:16px;">Digite seu nome e sua data de nascimento para entrar.</div>
        <div class="form-group">
          <label>Nome do Filho</label>
          <input type="text" id="child-login-name" placeholder="Seu nome" />
        </div>
        <div class="form-group">
          <label>Data de Nascimento</label>
          <input type="date" id="child-login-birthdate" placeholder="YYYY-MM-DD" />
        </div>
        <button class="btn btn-primary" onclick="childLogin()">Entrar como Filho</button>
        <div style="margin-top:12px;color:var(--muted);font-size:.9rem;">A senha é a sua data de nascimento.</div>
      </div>`;
    return;
  }

  noKids.style.display = "none";
  kidsPanel.style.display = "block";
  activeKid = state.currentChildId;
  const selector = document.getElementById("kid-selector");
  selector.innerHTML = `<div class="kid-btn active">${state.currentChildAvatar || "👤"} ${state.currentChildName}</div><button class="btn btn-sm btn-ghost" style="margin-left:12px;height:34px;" onclick="childLogout()">Sair</button>`;
  renderKidContent();
}

let activeKid = null;
function selectKid(id) {
  activeKid = id;
  renderKids();
}

function renderKidContent() {
  const kc = document.getElementById("kid-content");
  if (!activeKid) {
    kc.innerHTML = "";
    return;
  }
  let child = state.children.find((c) => c.id === activeKid);
  let balanceSource = state.transactions;
  let taskSource = state.tasks;
  let transactionSource = state.transactions;
  if (state.currentChildId) {
    child = {
      id: state.currentChildId,
      name: state.currentChildName,
      avatar: state.currentChildAvatar,
    };
    balanceSource = state.childTransactions;
    taskSource = state.childTasks;
    transactionSource = state.childTransactions;
  }
  if (!child) {
    kc.innerHTML = "";
    return;
  }
  const balance = getChildBalance(child.id, balanceSource);
  const tasks = taskSource.filter((t) => t.childId === child.id);
  const approved = tasks.filter((t) => t.status === "approved").length;
  const total = tasks.length;
  const pct = total ? Math.round((approved / total) * 100) : 0;
  const level = Math.floor(balance / 20) + 1;
  const xpNeeded = level * 20;
  const xpCurrent = balance % 20;

  kc.innerHTML = `
    <div class="grid3" style="margin-bottom:20px;">
      <div class="stat-box">
        <div class="stat-label">Saldo Atual</div>
        <div class="stat-value">${fmtMoney(balance)}</div>
      </div>
      <div class="stat-box">
        <div class="stat-label">Missões Completas</div>
        <div class="stat-value green">${approved}/${total}</div>
      </div>
      <div class="stat-box">
        <div class="stat-label">Nível Gamer</div>
        <div class="stat-value accent">LVL ${level}</div>
      </div>
    </div>
    <div class="card" style="margin-bottom:20px;">
      <div style="display:flex;align-items:center;gap:14px;margin-bottom:10px;">
        <div class="child-avatar">${child.avatar || "👤"}</div>
        <div>
          <div style="font-family:'Orbitron',monospace;font-size:1.1rem;font-weight:900;">${child.name}</div>
          <div class="level-badge">⚡ NÍVEL ${level} · ${xpCurrent.toFixed(2)} / ${xpNeeded} XP</div>
        </div>
      </div>
      <div class="progress-bar"><div class="progress-fill" style="width:${Math.min(100, (xpCurrent / xpNeeded) * 100)}%"></div></div>
    </div>
    <div class="card">
      <div class="card-title">⚔️ Minhas Missões</div>
      ${
        tasks.length ?
          tasks
            .map((t) => {
              const badges = {
                pending: '<span class="badge badge-pending">⏳ Pendente</span>',
                done: '<span class="badge badge-done">📤 Em análise</span>',
                approved:
                  '<span class="badge badge-approved">✅ Aprovada</span>',
                rejected:
                  '<span class="badge badge-rejected">❌ Rejeitada</span>',
              };
              const canComplete =
                t.status === "pending" || t.status === "rejected";
              return `<div class="task-item ${t.status}">
          <div class="task-info">
            <div class="task-name">${t.name} &nbsp;${badges[t.status] || ""}</div>
            <div class="task-meta">${t.period}</div>
          </div>
          <div class="task-value">${fmtMoney(t.value)}</div>
          ${canComplete ? `<button class="btn btn-sm btn-primary" onclick="openComplete('${t.id}')">CONCLUIR</button>` : ""}
        </div>`;
            })
            .join("")
        : '<div style="color:var(--muted);font-size:.9rem;text-align:center;padding:20px;">Nenhuma missão atribuída. Peça aos pais!</div>'
      }
    </div>
    <div class="card" style="margin-top:20px;">
      <div class="card-title">📜 Extrato de Transações</div>
      ${
        transactionSource
          .filter((t) => t.childId === child.id)
          .reverse()
          .slice(0, 10)
          .map(
            (t) => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border);">
          <div style="font-size:.9rem;">${t.desc}</div>
          <div style="font-family:'Orbitron',monospace;font-size:.85rem;color:${t.amount >= 0 ? "var(--green)" : "var(--red)"};">${t.amount >= 0 ? "+" : ""}${fmtMoney(t.amount)}</div>
        </div>
      `,
          )
          .join("") ||
        '<div style="color:var(--muted);font-size:.9rem;text-align:center;padding:14px;">Nenhuma transação ainda.</div>'
      }
    </div>
  `;
}

function renderShop() {
  const sg = document.getElementById("shop-grid");
  sg.innerHTML = state.rewards
    .map(
      (rw) => `
    <div class="shop-item" onclick="openShop('${rw.id}')">
      <div class="shop-emoji">${rw.emoji}</div>
      <div class="shop-item-name">${rw.name}</div>
      <div class="shop-price">${rw.special === "cash" ? "SALDO TOTAL" : fmtMoney(rw.cost)}</div>
    </div>
  `,
    )
    .join("");

  const sc = document.getElementById("shop-child-select");
  sc.innerHTML =
    '<option value="">— Selecione —</option>' +
    state.children
      .map(
        (c) => `<option value="${c.id}">${c.avatar || "👤"} ${c.name}</option>`,
      )
      .join("");

  sc.onchange = () => {
    const cid = sc.value;
    const disp = document.getElementById("shop-balance-display");
    if (!cid) {
      disp.textContent = "";
      return;
    }
    const bal = getChildBalance(cid);
    disp.textContent = "💰 " + fmtMoney(bal);
  };
  sc.dispatchEvent(new Event("change"));
}

// ─── AÇÕES (manipulação de dados locais) ──────────────────
// Funções que modificam o estado: adicionar filho, criar tarefa,
// aprovar/rejeitar, adicionar bônus e submeter conclusão.
async function addChild() {
  const name = document.getElementById("child-name").value.trim();
  const avatar = document.getElementById("child-avatar").value.trim() || "🧒";
  const birthdate = document.getElementById("child-birthdate").value;
  if (!name) {
    toast("Informe o nome do filho!");
    return;
  }
  if (!birthdate) {
    toast("Informe a data de nascimento do filho!");
    return;
  }
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) {
    if (!state.currentUserId)
      return toast("Faça login ou crie uma conta para cadastrar filhos.");
    const passwordHash = await hashPassword(birthdate);
    const child = {
      id: r(),
      name,
      avatar,
      ownerId: state.currentUserId,
      birthdate,
      passwordHash,
    };
    if (usingSupabase) {
      try {
        await supabaseInsert("children", {
          id: child.id,
          ownerId: child.ownerId,
          name: child.name,
          avatar: child.avatar,
          birthdate: child.birthdate,
          password_hash: child.passwordHash,
          created_at: new Date().toISOString(),
        });
        state.children.push(child);
        document.getElementById("child-name").value = "";
        document.getElementById("child-avatar").value = "";
        document.getElementById("child-birthdate").value = "";
        renderAll();
        return toast("✅ " + name + " cadastrado(a) com sucesso via Supabase!");
      } catch (e) {
        console.warn("Supabase addChild failed", e);
        toast("Erro ao cadastrar filho no Supabase. Verifique a configuração.");
        return;
      }
    }
    state.children.push(child);
    document.getElementById("child-name").value = "";
    document.getElementById("child-avatar").value = "";
    document.getElementById("child-birthdate").value = "";
    save();
    renderAll();
    return toast("✅ " + name + " cadastrado(a) com sucesso!");
  }
  apiFetch("/children", {
    method: "POST",
    body: JSON.stringify({ name, avatar, birthdate }),
  })
    .then(() => fetchAllForUser())
    .then(() => {
      document.getElementById("child-name").value = "";
      document.getElementById("child-avatar").value = "";
      document.getElementById("child-birthdate").value = "";
      toast("✅ " + name + " cadastrado(a) com sucesso!");
    })
    .catch((e) => toast(e && e.error ? e.error : "Erro ao cadastrar filho"));
}

function removeChild(id) {
  const child = state.children.find((c) => c.id === id);
  if (!child) return;
  if (child.ownerId !== state.currentUserId)
    return toast("Você não tem permissão para remover este filho.");
  if (!confirm("Remover este filho e todas as suas tarefas?")) return;
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) {
    state.children = state.children.filter((c) => c.id !== id);
    state.tasks = state.tasks.filter((t) => t.childId !== id);
    state.transactions = state.transactions.filter((t) => t.childId !== id);
    save();
    renderAll();
    return;
  }
  apiFetch("/children/" + id, { method: "DELETE" })
    .then(() => fetchAllForUser())
    .catch((e) => toast(e && e.error ? e.error : "Erro ao remover filho"));
}

async function addTask() {
  const name = document.getElementById("task-name").value.trim();
  const childId = document.getElementById("task-child").value;
  const value = parseFloat(document.getElementById("task-value").value);
  const period = document.getElementById("task-period").value;
  if (!name) {
    toast("Informe o nome da missão!");
    return;
  }
  if (!childId) {
    toast("Selecione um filho!");
    return;
  }
  if (isNaN(value) || value < 0) {
    toast("Informe um valor válido!");
    return;
  }
  const child = state.children.find((c) => c.id === childId);
  if (!child || child.ownerId !== state.currentUserId) {
    toast("Filho inválido ou sem permissão.");
    return;
  }
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) {
    const task = {
      id: r(),
      name,
      childId,
      ownerId: child.ownerId,
      value,
      period,
      status: "pending",
      note: "",
      photo: "",
    };
    if (usingSupabase) {
      try {
        await supabaseInsert("tasks", {
          id: task.id,
          ownerId: task.ownerId,
          child_id: task.childId,
          name: task.name,
          value: task.value,
          period: task.period,
          status: task.status,
          note: task.note,
          photo: task.photo,
          created_at: new Date().toISOString(),
        });
        state.tasks.push(task);
        document.getElementById("task-name").value = "";
        document.getElementById("task-value").value = "";
        renderAll();
        return toast('⚔️ Missão "' + name + '" criada via Supabase!');
      } catch (e) {
        console.warn("Supabase addTask failed", e);
        toast("Erro ao criar missão no Supabase. Verifique a configuração.");
        return;
      }
    }
    state.tasks.push(task);
    document.getElementById("task-name").value = "";
    document.getElementById("task-value").value = "";
    save();
    renderAll();
    return toast('⚔️ Missão "' + name + '" criada!');
  }
  apiFetch("/tasks", {
    method: "POST",
    body: JSON.stringify({ name, child_id: childId, value, period }),
  })
    .then(() => fetchAllForUser())
    .then(() => {
      document.getElementById("task-name").value = "";
      document.getElementById("task-value").value = "";
      toast('⚔️ Missão "' + name + '" criada!');
    })
    .catch((e) => toast(e && e.error ? e.error : "Erro ao criar missão"));
}

function removeTask(id) {
  const task = state.tasks.find((t) => t.id === id);
  if (!task) return;
  if (task.ownerId && task.ownerId !== state.currentUserId)
    return toast("Você não tem permissão para remover esta missão.");
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) {
    state.tasks = state.tasks.filter((t) => t.id !== id);
    save();
    renderAll();
    return;
  }
  apiFetch("/tasks/" + id, { method: "DELETE" })
    .then(() => fetchAllForUser())
    .catch((e) => toast(e && e.error ? e.error : "Erro ao remover missão"));
}

function approveTask(id) {
  const task = state.tasks.find((t) => t.id === id);
  if (!task) return;
  if (task.ownerId && task.ownerId !== state.currentUserId)
    return toast("Você não pode aprovar esta tarefa.");
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) {
    task.status = "approved";
    state.transactions.push({
      id: r(),
      childId: task.childId,
      amount: task.value,
      desc: "✅ Missão aprovada: " + task.name,
      ownerId: task.ownerId || state.currentUserId,
    });
    save();
    renderAll();
    return toast(
      "💰 Tarefa aprovada! +" +
        fmtMoney(task.value) +
        " para " +
        (state.children.find((c) => c.id === task.childId)?.name || "?"),
    );
  }
  apiFetch("/tasks/" + id + "/approve", { method: "POST" })
    .then(() => fetchAllForUser())
    .then(() => toast("💰 Tarefa aprovada! +" + fmtMoney(task.value)))
    .catch((e) => toast(e && e.error ? e.error : "Erro ao aprovar"));
}

function rejectTask(id) {
  const task = state.tasks.find((t) => t.id === id);
  if (!task) return;
  if (task.ownerId && task.ownerId !== state.currentUserId)
    return toast("Você não pode rejeitar esta tarefa.");
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) {
    task.status = "rejected";
    save();
    renderAll();
    return toast("❌ Tarefa rejeitada.");
  }
  apiFetch("/tasks/" + id + "/reject", { method: "POST" })
    .then(() => fetchAllForUser())
    .then(() => toast("❌ Tarefa rejeitada."))
    .catch((e) => toast(e && e.error ? e.error : "Erro ao rejeitar"));
}

function addBonus() {
  const childId = document.getElementById("bonus-child").value;
  const value = parseFloat(document.getElementById("bonus-value").value);
  const reason =
    document.getElementById("bonus-reason").value.trim() || "Bônus especial";
  if (!childId) {
    toast("Selecione um filho!");
    return;
  }
  const child = state.children.find((c) => c.id === childId);
  if (!child || child.ownerId !== state.currentUserId) {
    toast("Filho inválido ou sem permissão.");
    return;
  }
  if (isNaN(value) || value <= 0) {
    toast("Valor inválido!");
    return;
  }
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) {
    state.transactions.push({
      id: r(),
      childId,
      ownerId: child.ownerId,
      amount: value,
      desc: "⭐ Bônus: " + reason,
    });
    document.getElementById("bonus-value").value = "";
    document.getElementById("bonus-reason").value = "";
    save();
    renderAll();
    return toast("⭐ Bônus de " + fmtMoney(value) + " adicionado!");
  }
  apiFetch("/transactions", {
    method: "POST",
    body: JSON.stringify({
      child_id: childId,
      amount: value,
      description: "⭐ Bônus: " + reason,
    }),
  })
    .then(() => fetchAllForUser())
    .then(() => {
      document.getElementById("bonus-value").value = "";
      document.getElementById("bonus-reason").value = "";
      toast("⭐ Bônus de " + fmtMoney(value) + " adicionado!");
    })
    .catch((e) => toast(e && e.error ? e.error : "Erro ao adicionar bônus"));
}

function openComplete(taskId) {
  pendingCompleteTask = taskId;
  const source = state.currentChildId ? state.childTasks : state.tasks;
  const task = source.find((t) => t.id === taskId);
  if (!task) return;
  document.getElementById("modal-task-info").innerHTML = `
    <div style="background:var(--card2);border-radius:10px;padding:14px;">
      <div style="font-family:'Orbitron',monospace;font-size:.85rem;font-weight:700;">${task.name}</div>
      <div style="color:var(--gold);font-family:'Orbitron',monospace;margin-top:4px;">${fmtMoney(task.value)}</div>
    </div>`;
  document.getElementById("complete-note").value = "";
  document.getElementById("complete-photo").value = "";
  openModal("modal-complete");
}

function confirmComplete() {
  const source = state.currentChildId ? state.childTasks : state.tasks;
  const task = source.find((t) => t.id === pendingCompleteTask);
  if (!task) return;
  const note = document.getElementById("complete-note").value;
  const photo = document.getElementById("complete-photo").value;
  const token = localStorage.getItem(TOKEN_KEY);
  const childToken = localStorage.getItem(CHILD_TOKEN_KEY);
  if (!token && !childToken) {
    task.status = "done";
    task.note = note;
    task.photo = photo;
    save();
    renderAll();
    closeModal("modal-complete");
    return toast("📤 Enviado para aprovação dos pais!");
  }
  const completeCall =
    childToken ?
      apiChildFetch("/child/tasks/" + task.id + "/complete", {
        method: "POST",
        body: JSON.stringify({ note, photo }),
      })
    : apiFetch("/tasks/" + task.id + "/complete", {
        method: "POST",
        body: JSON.stringify({ note, photo }),
      });
  completeCall
    .then(() => (childToken ? fetchChildForSession() : fetchAllForUser()))
    .then(() => {
      closeModal("modal-complete");
      toast("📤 Enviado para aprovação dos pais!");
    })
    .catch((e) => toast(e && e.error ? e.error : "Erro ao enviar conclusão"));
}

function openShop(rewardId) {
  const rw = state.rewards.find((r) => r.id === rewardId);
  if (!rw) return;
  const childId = document.getElementById("shop-child-select").value;
  if (!childId) {
    toast("Selecione seu perfil primeiro!");
    return;
  }
  const child = state.children.find((c) => c.id === childId);
  const bal = getChildBalance(childId);
  const cost = rw.special === "cash" ? bal : rw.cost;
  if (bal < cost && rw.special !== "cash") {
    toast("Saldo insuficiente! 😢");
    return;
  }
  pendingRedeemReward = { rewardId, childId };
  document.getElementById("modal-shop-info").innerHTML = `
    <div style="font-size:3.5rem;margin-bottom:8px;">${rw.emoji}</div>
    <div style="font-family:'Orbitron',monospace;font-size:1rem;font-weight:700;margin-bottom:12px;">${rw.name}</div>
    <div style="color:var(--muted);margin-bottom:6px;">Comprador: ${child.avatar} ${child.name}</div>
    <div style="font-family:'Orbitron',monospace;color:var(--gold);font-size:1.1rem;">${rw.special === "cash" ? "Resgatar " + fmtMoney(bal) : "Custo: " + fmtMoney(cost)}</div>
  `;
  openModal("modal-shop");
}

function confirmRedeem() {
  if (!pendingRedeemReward) return;
  const { rewardId, childId } = pendingRedeemReward;
  const rw = state.rewards.find((r) => r.id === rewardId);
  const bal = getChildBalance(childId);
  const cost = rw.special === "cash" ? bal : rw.cost;
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) {
    state.transactions.push({
      id: r(),
      childId,
      amount: -cost,
      desc: "🛒 Resgate: " + rw.name,
    });
    save();
    renderAll();
    closeModal("modal-shop");
    pendingRedeemReward = null;
    return toast("🎉 Recompensa resgatada com sucesso!");
  }
  apiFetch("/transactions", {
    method: "POST",
    body: JSON.stringify({
      child_id: childId,
      amount: -cost,
      description: "🛒 Resgate: " + rw.name,
    }),
  })
    .then(() => fetchAllForUser())
    .then(() => {
      closeModal("modal-shop");
      pendingRedeemReward = null;
      toast("🎉 Recompensa resgatada com sucesso!");
    })
    .catch((e) =>
      toast(e && e.error ? e.error : "Erro ao resgatar recompensa"),
    );
}

function addReward() {
  const emoji = document.getElementById("reward-emoji").value.trim() || "🎁";
  const name = document.getElementById("reward-name").value.trim();
  const cost = parseFloat(document.getElementById("reward-cost").value);
  if (!name) {
    toast("Informe o nome da recompensa!");
    return;
  }
  if (isNaN(cost) || cost < 0) {
    toast("Informe um custo válido!");
    return;
  }
  state.rewards.push({ id: r(), emoji, name, cost });
  document.getElementById("reward-emoji").value = "";
  document.getElementById("reward-name").value = "";
  document.getElementById("reward-cost").value = "";
  save();
  renderAll();
  toast("🎁 Recompensa adicionada!");
}

function openModal(id) {
  document.getElementById(id).classList.add("open");
}
function closeModal(id) {
  document.getElementById(id).classList.remove("open");
}

let toastTimer;
function toast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2800);
}

document.querySelectorAll(".modal-overlay").forEach((ov) => {
  ov.addEventListener("click", (e) => {
    if (e.target === ov) ov.classList.remove("open");
  });
});

showView("home");
