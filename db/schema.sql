-- Schema SQL para armazenar informações de filhos, tarefas e tarefas concluídas
-- Compatível com bancos SQL comuns (SQLite, MySQL, PostgreSQL)

-- A habilitação de chaves estrangeiras no SQLite é feita no servidor, não no schema SQL.

-- Usuários (pais/administradores de cada conta)
-- Contém login e senha hash dos pais que gerenciam os filhos.
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Filhos cadastrados pelos pais.
-- Contém dados de perfil e nascimento para login infantil.
CREATE TABLE IF NOT EXISTS children (
  id TEXT PRIMARY KEY,
  ownerId TEXT NOT NULL,
  name TEXT NOT NULL,
  avatar TEXT,
  email TEXT,
  cpf TEXT,
  birthdate TEXT,
  password_hash TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (ownerId) REFERENCES users(id) ON DELETE CASCADE
);

-- Tarefas/missões atribuídas a cada filho por um pai.
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  ownerId TEXT NOT NULL,
  child_id TEXT NOT NULL,
  name TEXT NOT NULL,
  value NUMERIC NOT NULL DEFAULT 0,
  period TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  note TEXT,
  photo TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMPTZ,
  FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE,
  FOREIGN KEY (ownerId) REFERENCES users(id) ON DELETE CASCADE
);

-- Registro de tentativas de conclusão de tarefas.
-- Guarda notas, fotos e status para revisão pelo pai.
CREATE TABLE IF NOT EXISTS task_completions (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  ownerId TEXT NOT NULL,
  child_id TEXT NOT NULL,
  status TEXT NOT NULL,
  note TEXT,
  photo TEXT,
  submitted_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  reviewed_at TIMESTAMPTZ,
  approved_amount NUMERIC DEFAULT 0,
  review_comment TEXT,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE,
  FOREIGN KEY (ownerId) REFERENCES users(id) ON DELETE CASCADE
);

-- Extrato financeiro das aprovações de tarefas e bônus.
CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  ownerId TEXT NOT NULL,
  child_id TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  description TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE,
  FOREIGN KEY (ownerId) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_tasks_child_id ON tasks(child_id);
CREATE INDEX IF NOT EXISTS idx_task_completions_task_id ON task_completions(task_id);
CREATE INDEX IF NOT EXISTS idx_task_completions_child_id ON task_completions(child_id);
CREATE INDEX IF NOT EXISTS idx_transactions_child_id ON transactions(child_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_children_email ON children(email);
CREATE UNIQUE INDEX IF NOT EXISTS idx_children_cpf ON children(cpf);
