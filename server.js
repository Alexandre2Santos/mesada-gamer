/*
  server.js
  - API REST simples para o app Mesada Gamer
  - Autenticação via JWT
  - Persistência com SQLite (arquivo em db/database.sqlite)
  - Rotas: register/login, children, tasks, task completions, approve/reject, transactions

  Observação: este arquivo é um exemplo educacional. Em produção,
  use IDs mais robustos (UUID), tratamento de erros mais completo
  e políticas de segurança (rate limit, validação, CORS restrito, etc.).
*/

// Módulos principais do servidor
const fs = require("fs");
const path = require("path");
const express = require("express");
const cors = require("cors");
const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

// Caminhos e configurações do banco de dados e do servidor
const DB_FILE = path.join(__dirname, "db", "database.sqlite");
const SCHEMA_FILE = path.join(__dirname, "db", "schema.sql");
const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";
const PORT = process.env.PORT || 3000;

// Função utilitária para gerar IDs simples (suficiente para exemplos locais)
function r() {
  return Math.random().toString(36).slice(2, 10);
}

// Garante que o diretório do banco exista antes de criar o arquivo
if (!fs.existsSync(path.join(__dirname, "db")))
  fs.mkdirSync(path.join(__dirname, "db"));

// Initialize DB and run schema
// Inicializa o banco de dados SQLite e carrega o esquema do SQL
const schemaSql = fs.readFileSync(SCHEMA_FILE, "utf8");
const db = new Database(DB_FILE);
// Ativa chaves estrangeiras no SQLite para manter integridade referencial
db.exec("PRAGMA foreign_keys = ON;");

function ensureChildLoginColumns() {
  const columns = db
    .prepare("PRAGMA table_info(children)")
    .all()
    .map((col) => col.name);
  if (!columns.includes("email")) {
    db.exec("ALTER TABLE children ADD COLUMN email TEXT;");
  }
  if (!columns.includes("cpf")) {
    db.exec("ALTER TABLE children ADD COLUMN cpf TEXT;");
  }
  db.exec(
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_children_email ON children(email);",
  );
  db.exec(
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_children_cpf ON children(cpf);",
  );
}

try {
  db.exec(schemaSql);
  ensureChildLoginColumns();
  console.log("DB schema initialized");
  const userCount = db.prepare("SELECT COUNT(1) AS count FROM users").get();
  if (!userCount || userCount.count === 0) {
    const defaultAdminId = r();
    const defaultAdminPass = bcrypt.hashSync("admin", 10);
    db.prepare(
      "INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)",
    ).run(defaultAdminId, "admin", defaultAdminPass);
    console.log("Default admin user created: admin / admin");
  }
} catch (e) {
  console.warn("Schema apply warning:", e.message);
}

const app = express();
app.use(cors());
app.use(express.json());

// -----------------------------
// Autenticação e helpers
// -----------------------------
// O servidor usa JWT para autenticar pais e filhos em rotas diferentes.
// Gera um JWT para o usuário (payload contém id e username)
function generateToken(user) {
  return jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, {
    expiresIn: "7d",
  });
}

// Gera um JWT para filhos (payload contém childId e nome)
// Esse token é usado pelas rotas de filho para acessar apenas as tarefas
// e transações do próprio perfil.
function generateChildToken(child) {
  return jwt.sign(
    { childId: child.id, name: child.name, type: "child" },
    JWT_SECRET,
    { expiresIn: "7d" },
  );
}

// Middleware para rotas protegidas.
// Lê header `Authorization: Bearer <token>` e valida o JWT.
function authMiddleware(req, res, next) {
  // Middleware para rotas de administração dos pais
  const h = req.headers.authorization;
  if (!h) return res.status(401).json({ error: "missing_token" });
  const parts = h.split(" ");
  const token = parts.length === 2 ? parts[1] : parts[0];
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload; // adiciona `user` no request para uso posterior
    next();
  } catch (e) {
    return res.status(401).json({ error: "invalid_token" });
  }
}

function childAuthMiddleware(req, res, next) {
  // Middleware para rotas de criança, usando token de filho
  const h = req.headers.authorization;
  if (!h) return res.status(401).json({ error: "missing_token" });
  const parts = h.split(" ");
  const token = parts.length === 2 ? parts[1] : parts[0];
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload.type !== "child")
      return res.status(403).json({ error: "invalid_token_type" });
    req.child = payload;
    next();
  } catch (e) {
    return res.status(401).json({ error: "invalid_token" });
  }
}

// Register
// Cria novo usuário pai e retorna token JWT para uso nas rotas protegidas.
app.post("/api/register", (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password)
    return res.status(400).json({ error: "username_password_required" });
  const exists = db
    .prepare("SELECT id FROM users WHERE username = ?")
    .get(username);
  if (exists) return res.status(409).json({ error: "user_exists" });
  const id = r();
  const hash = bcrypt.hashSync(password, 10);
  db.prepare(
    "INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)",
  ).run(id, username, hash);
  const token = generateToken({ id, username });
  return res.json({ token, user: { id, username } });
});

// Login
// Autentica pai por usuário e senha e retorna token JWT.
app.post("/api/login", (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password)
    return res.status(400).json({ error: "username_password_required" });
  const row = db
    .prepare("SELECT id, username, password_hash FROM users WHERE username = ?")
    .get(username);
  if (!row || !bcrypt.compareSync(password, row.password_hash))
    return res.status(401).json({ error: "invalid_credentials" });
  const token = generateToken({ id: row.id, username: row.username });
  res.json({ token, user: { id: row.id, username: row.username } });
});

// Child login
// Autentica o filho usando email, CPF ou nome + data de nascimento.
app.post("/api/child/login", (req, res) => {
  const { email, cpf, name, birthdate } = req.body || {};
  if ((!email && !cpf && !name) || !birthdate)
    return res.status(400).json({ error: "identifier_and_birthdate_required" });

  let row;
  if (email) {
    row = db
      .prepare(
        "SELECT id, name, avatar, birthdate, password_hash FROM children WHERE email = ?",
      )
      .get(email.trim().toLowerCase());
  } else if (cpf) {
    row = db
      .prepare(
        "SELECT id, name, avatar, birthdate, password_hash FROM children WHERE cpf = ?",
      )
      .get(cpf.replace(/\D/g, ""));
  } else {
    row = db
      .prepare(
        "SELECT id, name, avatar, birthdate, password_hash FROM children WHERE name = ?",
      )
      .get(name.trim());
  }

  if (!row) return res.status(401).json({ error: "invalid_credentials" });
  const validBirthdate =
    row.password_hash ?
      bcrypt.compareSync(birthdate, row.password_hash)
    : row.birthdate === birthdate;
  if (!validBirthdate)
    return res.status(401).json({ error: "invalid_credentials" });
  const token = generateChildToken(row);
  res.json({
    token,
    child: { id: row.id, name: row.name, avatar: row.avatar },
  });
});

// Me
// Retorna informações do usuário pai autenticado.
app.get("/api/me", authMiddleware, (req, res) => {
  const row = db
    .prepare("SELECT id, username, created_at FROM users WHERE id = ?")
    .get(req.user.id);
  res.json({ user: row });
});

// Child auth endpoints
// Rotas que permitem ao filho ver somente o próprio perfil, tarefas
// e transações autorizadas pelo token infantil.
app.get("/api/child/me", childAuthMiddleware, (req, res) => {
  const row = db
    .prepare("SELECT id, name, avatar FROM children WHERE id = ?")
    .get(req.child.childId);
  res.json({ child: row });
});

app.get("/api/child/tasks", childAuthMiddleware, (req, res) => {
  const rows = db
    .prepare("SELECT * FROM tasks WHERE child_id = ?")
    .all(req.child.childId);
  res.json(rows);
});

app.get("/api/child/transactions", childAuthMiddleware, (req, res) => {
  const rows = db
    .prepare(
      "SELECT * FROM transactions WHERE child_id = ? ORDER BY created_at DESC LIMIT 200",
    )
    .all(req.child.childId);
  res.json(rows);
});

// Rota que permite ao filho marcar uma missão como concluída.
// A conclusão é salva em task_completions e o status da missão é atualizado.
app.post("/api/child/tasks/:id/complete", childAuthMiddleware, (req, res) => {
  const taskId = req.params.id;
  const task = db.prepare("SELECT * FROM tasks WHERE id = ?").get(taskId);
  if (!task) return res.status(404).json({ error: "not_found" });
  if (task.child_id !== req.child.childId)
    return res.status(403).json({ error: "forbidden" });
  const id = r();
  db.prepare(
    "INSERT INTO task_completions (id, task_id, ownerId, child_id, status, note, photo) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).run(
    id,
    taskId,
    task.ownerId,
    task.child_id,
    "done",
    req.body.note || null,
    req.body.photo || null,
  );
  db.prepare("UPDATE tasks SET status = ? WHERE id = ?").run("done", taskId);
  res.json({ ok: true, completionId: id });
});

// Children CRUD
app.get("/api/children", authMiddleware, (req, res) => {
  const rows = db
    .prepare(
      "SELECT id, name, avatar, email, cpf, created_at FROM children WHERE ownerId = ?",
    )
    .all(req.user.id);
  res.json(rows);
});
app.post("/api/children", authMiddleware, (req, res) => {
  const { name, avatar, email, cpf, birthdate } = req.body || {};
  if (!name || !birthdate)
    return res.status(400).json({ error: "name_birthdate_required" });
  if (!email && !cpf)
    return res.status(400).json({ error: "email_or_cpf_required" });

  const normalizedEmail = email ? email.trim().toLowerCase() : null;
  const normalizedCpf = cpf ? cpf.replace(/\D/g, "") : null;
  const id = r();
  const hash = bcrypt.hashSync(birthdate, 10);
  db.prepare(
    "INSERT INTO children (id, ownerId, name, avatar, email, cpf, birthdate, password_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  ).run(
    id,
    req.user.id,
    name.trim(),
    avatar || null,
    normalizedEmail,
    normalizedCpf,
    birthdate,
    hash,
  );
  res.json({
    id,
    name,
    avatar,
    email: normalizedEmail,
    cpf: normalizedCpf,
    birthdate,
  });
});
app.delete("/api/children/:id", authMiddleware, (req, res) => {
  const id = req.params.id;
  const child = db.prepare("SELECT ownerId FROM children WHERE id = ?").get(id);
  if (!child) return res.status(404).json({ error: "not_found" });
  if (child.ownerId !== req.user.id)
    return res.status(403).json({ error: "forbidden" });
  db.prepare("DELETE FROM children WHERE id = ?").run(id);
  res.json({ ok: true });
});

// Tasks CRUD
app.get("/api/tasks", authMiddleware, (req, res) => {
  const rows = db
    .prepare("SELECT * FROM tasks WHERE ownerId = ?")
    .all(req.user.id);
  res.json(rows);
});
app.post("/api/tasks", authMiddleware, (req, res) => {
  const { name, child_id, value, period } = req.body || {};
  if (!name || !child_id)
    return res.status(400).json({ error: "name_child_required" });
  const child = db
    .prepare("SELECT ownerId FROM children WHERE id = ?")
    .get(child_id);
  if (!child || child.ownerId !== req.user.id)
    return res.status(403).json({ error: "invalid_child" });
  const id = r();
  db.prepare(
    "INSERT INTO tasks (id, ownerId, child_id, name, value, period, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).run(
    id,
    req.user.id,
    child_id,
    name,
    value || 0,
    period || "Hoje",
    "pending",
  );
  res.json({ id });
});
app.post("/api/tasks/:id/complete", authMiddleware, (req, res) => {
  const taskId = req.params.id;
  const task = db.prepare("SELECT * FROM tasks WHERE id = ?").get(taskId);
  if (!task) return res.status(404).json({ error: "not_found" });
  // allow kid/client to submit completion even if not owner; store in task_completions
  const id = r();
  db.prepare(
    "INSERT INTO task_completions (id, task_id, ownerId, child_id, status, note, photo) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).run(
    id,
    taskId,
    task.ownerId,
    task.child_id,
    "done",
    req.body.note || null,
    req.body.photo || null,
  );
  // update task status to done
  db.prepare("UPDATE tasks SET status = ? WHERE id = ?").run("done", taskId);
  res.json({ ok: true, completionId: id });
});

// Approve/reject
app.post("/api/tasks/:id/approve", authMiddleware, (req, res) => {
  const taskId = req.params.id;
  const task = db.prepare("SELECT * FROM tasks WHERE id = ?").get(taskId);
  if (!task) return res.status(404).json({ error: "not_found" });
  if (task.ownerId !== req.user.id)
    return res.status(403).json({ error: "forbidden" });
  db.prepare(
    "UPDATE tasks SET status = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?",
  ).run("approved", taskId);
  // create transaction
  const txId = r();
  db.prepare(
    "INSERT INTO transactions (id, ownerId, child_id, amount, description) VALUES (?, ?, ?, ?, ?)",
  ).run(
    txId,
    req.user.id,
    task.child_id,
    task.value,
    "✅ Missão aprovada: " + task.name,
  );
  res.json({ ok: true, transactionId: txId });
});

app.post("/api/tasks/:id/reject", authMiddleware, (req, res) => {
  const taskId = req.params.id;
  const task = db.prepare("SELECT * FROM tasks WHERE id = ?").get(taskId);
  if (!task) return res.status(404).json({ error: "not_found" });
  if (task.ownerId !== req.user.id)
    return res.status(403).json({ error: "forbidden" });
  db.prepare("UPDATE tasks SET status = ? WHERE id = ?").run(
    "rejected",
    taskId,
  );
  res.json({ ok: true });
});

// Delete task
app.delete("/api/tasks/:id", authMiddleware, (req, res) => {
  const id = req.params.id;
  const task = db.prepare("SELECT ownerId FROM tasks WHERE id = ?").get(id);
  if (!task) return res.status(404).json({ error: "not_found" });
  if (task.ownerId !== req.user.id)
    return res.status(403).json({ error: "forbidden" });
  db.prepare("DELETE FROM tasks WHERE id = ?").run(id);
  res.json({ ok: true });
});

// Create transaction (manual bonus or admin-created)
// Usa essa rota para adicionar saldo ao extrato da criança.
app.post("/api/transactions", authMiddleware, (req, res) => {
  const { child_id, amount, description } = req.body || {};
  if (!child_id || typeof amount === "undefined")
    return res.status(400).json({ error: "child_amount_required" });
  const child = db
    .prepare("SELECT ownerId FROM children WHERE id = ?")
    .get(child_id);
  if (!child || child.ownerId !== req.user.id)
    return res.status(403).json({ error: "invalid_child" });
  const id = r();
  db.prepare(
    "INSERT INTO transactions (id, ownerId, child_id, amount, description) VALUES (?, ?, ?, ?, ?)",
  ).run(id, req.user.id, child_id, amount, description || null);
  res.json({ id });
});

// Transactions for owner
app.get("/api/transactions", authMiddleware, (req, res) => {
  const rows = db
    .prepare(
      "SELECT * FROM transactions WHERE ownerId = ? ORDER BY created_at DESC LIMIT 200",
    )
    .all(req.user.id);
  res.json(rows);
});

// Inicia o servidor Express na porta configurada.
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
