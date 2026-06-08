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

const fs = require("fs");
const path = require("path");
const express = require("express");
const cors = require("cors");
const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

// Caminhos e configurações
const DB_FILE = path.join(__dirname, "db", "database.sqlite");
const SCHEMA_FILE = path.join(__dirname, "db", "schema.sql");
const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";
const PORT = process.env.PORT || 3000;

// Função utilitária para gerar IDs simples (suficiente para exemplos locais)
function r() {
  return Math.random().toString(36).slice(2, 10);
}

// Ensure DB directory
if (!fs.existsSync(path.join(__dirname, "db")))
  fs.mkdirSync(path.join(__dirname, "db"));

// Initialize DB and run schema
const schemaSql = fs.readFileSync(SCHEMA_FILE, "utf8");
const db = new Database(DB_FILE);
db.exec("PRAGMA foreign_keys = ON;");
try {
  db.exec(schemaSql);
  console.log("DB schema initialized");
} catch (e) {
  console.warn("Schema apply warning:", e.message);
}

const app = express();
app.use(cors());
app.use(express.json());

// -----------------------------
// Autenticação e helpers
// -----------------------------
// Gera um JWT para o usuário (payload contém id e username)
function generateToken(user) {
  return jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, {
    expiresIn: "7d",
  });
}

// Middleware para rotas protegidas.
// Lê header `Authorization: Bearer <token>` e valida o JWT.
function authMiddleware(req, res, next) {
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

// Register
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

// Me
app.get("/api/me", authMiddleware, (req, res) => {
  const row = db
    .prepare("SELECT id, username, created_at FROM users WHERE id = ?")
    .get(req.user.id);
  res.json({ user: row });
});

// Children CRUD
app.get("/api/children", authMiddleware, (req, res) => {
  const rows = db
    .prepare(
      "SELECT id, name, avatar, created_at FROM children WHERE ownerId = ?",
    )
    .all(req.user.id);
  res.json(rows);
});
app.post("/api/children", authMiddleware, (req, res) => {
  const { name, avatar } = req.body || {};
  if (!name) return res.status(400).json({ error: "name_required" });
  const id = r();
  db.prepare(
    "INSERT INTO children (id, ownerId, name, avatar) VALUES (?, ?, ?, ?)",
  ).run(id, req.user.id, name, avatar || null);
  res.json({ id, name, avatar });
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

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
