-- Schema SQL para armazenar informações de filhos, tarefas e tarefas concluídas
-- Compatível com bancos SQL comuns (SQLite, MySQL, PostgreSQL)

PRAGMA foreign_keys = ON;

CREATE TABLE children (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  avatar VARCHAR(10),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE tasks (
  id VARCHAR(36) PRIMARY KEY,
  child_id VARCHAR(36) NOT NULL,
  name VARCHAR(200) NOT NULL,
  value DECIMAL(10, 2) NOT NULL DEFAULT 0,
  period VARCHAR(50) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  note TEXT,
  photo TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME,
  FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE
);

CREATE TABLE task_completions (
  id VARCHAR(36) PRIMARY KEY,
  task_id VARCHAR(36) NOT NULL,
  child_id VARCHAR(36) NOT NULL,
  status VARCHAR(20) NOT NULL,
  note TEXT,
  photo TEXT,
  submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  reviewed_at DATETIME,
  approved_amount DECIMAL(10, 2) DEFAULT 0,
  review_comment TEXT,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE
);

CREATE TABLE transactions (
  id VARCHAR(36) PRIMARY KEY,
  child_id VARCHAR(36) NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  description VARCHAR(255) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE
);

CREATE INDEX idx_tasks_child_id ON tasks(child_id);
CREATE INDEX idx_task_completions_task_id ON task_completions(task_id);
CREATE INDEX idx_task_completions_child_id ON task_completions(child_id);
CREATE INDEX idx_transactions_child_id ON transactions(child_id);
