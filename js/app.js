// ─── STATE ──────────────────────────────────────────────
let state = {
  users: [],
  currentUserId: null,
  children: [],
  tasks: [],
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

function save() {
  try {
    localStorage.setItem("mesadaGamer", JSON.stringify(state));
  } catch (e) {}
}
function load() {
  try {
    const d = localStorage.getItem("mesadaGamer");
    if (d) state = JSON.parse(d);
  } catch (e) {}
}
load();

// Ensure a default parent account exists and migrate existing data
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
  const u = document.getElementById("login-username").value.trim();
  const p = document.getElementById("login-password").value;
  const user = await registerUser(u, p, true);
  if (user) closeModal("modal-login");
}

async function loginUser() {
  const u = document.getElementById("login-username").value.trim();
  const p = document.getElementById("login-password").value;
  if (!u || !p) {
    toast("Preencha usuário e senha.");
    return;
  }
  const hash = await hashPassword(p);
  const user = state.users.find(
    (x) => x.username === u && x.passwordHash === hash,
  );
  if (!user) {
    toast("Usuário ou senha inválidos.");
    return;
  }
  state.currentUserId = user.id;
  save();
  closeModal("modal-login");
  renderAll();
  toast("Bem-vindo, " + user.username + "!");
}

function logoutUser() {
  state.currentUserId = null;
  save();
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

// ─── NAVIGATION ──────────────────────────────────────────
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

// ─── RENDER ──────────────────────────────────────────────
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
    const user = state.users.find((u) => u.id === state.currentUserId);
    el.innerHTML = `<div style="display:flex;gap:8px;align-items:center"><div style="color:var(--accent);font-family:'Orbitron',monospace">${user?.username || ""}</div><button class="btn btn-sm btn-ghost" onclick="changePassword()">Trocar senha</button><button class="btn btn-sm btn-ghost" onclick="logoutUser()">Sair</button></div>`;
  } else {
    el.innerHTML = `<button class="btn btn-sm btn-ghost" onclick="openModal('modal-login')">Entrar / Registrar</button>`;
  }
}

function fmtMoney(v) {
  return "R$ " + Number(v).toFixed(2).replace(".", ",");
}

function getChildBalance(childId) {
  return state.transactions
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
  if (!state.children.length) {
    noKids.style.display = "block";
    kidsPanel.style.display = "none";
    return;
  }
  noKids.style.display = "none";
  kidsPanel.style.display = "block";

  const selector = document.getElementById("kid-selector");
  selector.innerHTML = state.children
    .map(
      (c) =>
        `<div class="kid-btn ${activeKid === c.id ? "active" : ""}" onclick="selectKid('${c.id}')">${c.avatar || "👤"} ${c.name}</div>`,
    )
    .join("");

  if (!activeKid && state.children.length) activeKid = state.children[0].id;
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
  const child = state.children.find((c) => c.id === activeKid);
  if (!child) {
    kc.innerHTML = "";
    return;
  }
  const balance = getChildBalance(child.id);
  const tasks = state.tasks.filter((t) => t.childId === child.id);
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
        state.transactions
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

// ─── ACTIONS ─────────────────────────────────────────────
function addChild() {
  const name = document.getElementById("child-name").value.trim();
  const avatar = document.getElementById("child-avatar").value.trim() || "🧒";
  if (!name) {
    toast("Informe o nome do filho!");
    return;
  }
  if (!state.currentUserId) {
    toast("Faça login ou crie uma conta para cadastrar filhos.");
    return;
  }
  state.children.push({ id: r(), name, avatar, ownerId: state.currentUserId });
  document.getElementById("child-name").value = "";
  document.getElementById("child-avatar").value = "";
  save();
  renderAll();
  toast("✅ " + name + " cadastrado(a) com sucesso!");
}

function removeChild(id) {
  const child = state.children.find((c) => c.id === id);
  if (!child) return;
  if (child.ownerId !== state.currentUserId)
    return toast("Você não tem permissão para remover este filho.");
  if (!confirm("Remover este filho e todas as suas tarefas?")) return;
  state.children = state.children.filter((c) => c.id !== id);
  state.tasks = state.tasks.filter((t) => t.childId !== id);
  state.transactions = state.transactions.filter((t) => t.childId !== id);
  save();
  renderAll();
}

function addTask() {
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
  state.tasks.push({
    id: r(),
    name,
    childId,
    ownerId: child.ownerId,
    value,
    period,
    status: "pending",
    note: "",
    photo: "",
  });
  document.getElementById("task-name").value = "";
  document.getElementById("task-value").value = "";
  save();
  renderAll();
  toast('⚔️ Missão "' + name + '" criada!');
}

function removeTask(id) {
  const task = state.tasks.find((t) => t.id === id);
  if (!task) return;
  if (task.ownerId && task.ownerId !== state.currentUserId)
    return toast("Você não tem permissão para remover esta missão.");
  state.tasks = state.tasks.filter((t) => t.id !== id);
  save();
  renderAll();
}

function approveTask(id) {
  const task = state.tasks.find((t) => t.id === id);
  if (!task) return;
  if (task.ownerId && task.ownerId !== state.currentUserId)
    return toast("Você não pode aprovar esta tarefa.");
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
  toast(
    "💰 Tarefa aprovada! +" +
      fmtMoney(task.value) +
      " para " +
      (state.children.find((c) => c.id === task.childId)?.name || "?"),
  );
}

function rejectTask(id) {
  const task = state.tasks.find((t) => t.id === id);
  if (!task) return;
  if (task.ownerId && task.ownerId !== state.currentUserId)
    return toast("Você não pode rejeitar esta tarefa.");
  task.status = "rejected";
  save();
  renderAll();
  toast("❌ Tarefa rejeitada.");
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
  toast("⭐ Bônus de " + fmtMoney(value) + " adicionado!");
}

function openComplete(taskId) {
  pendingCompleteTask = taskId;
  const task = state.tasks.find((t) => t.id === taskId);
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
  const task = state.tasks.find((t) => t.id === pendingCompleteTask);
  if (!task) return;
  task.status = "done";
  task.note = document.getElementById("complete-note").value;
  task.photo = document.getElementById("complete-photo").value;
  save();
  renderAll();
  closeModal("modal-complete");
  toast("📤 Enviado para aprovação dos pais!");
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
  state.transactions.push({
    id: r(),
    childId,
    amount: -cost,
    desc: "🛒 Resgate: " + rw.name,
  });
  save();
  renderAll();
  closeModal("modal-shop");
  toast("🎉 Recompensa resgatada com sucesso!");
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
