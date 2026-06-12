-- Supabase schema for Mesada Gamer
-- Execute estas instruções no painel SQL do seu projeto Supabase.

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

CREATE TABLE IF NOT EXISTS children (
  id TEXT PRIMARY KEY,
  ownerId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  avatar TEXT,
  email TEXT,
  cpf TEXT,
  birthdate TEXT,
  password_hash TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  ownerId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  child_id TEXT NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  value NUMERIC NOT NULL DEFAULT 0,
  period TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  note TEXT,
  photo TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

CREATE TABLE IF NOT EXISTS task_completions (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  ownerId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  child_id TEXT NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  note TEXT,
  photo TEXT,
  submitted_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),
  reviewed_at TIMESTAMP WITH TIME ZONE,
  approved_amount NUMERIC DEFAULT 0,
  review_comment TEXT
);

CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  ownerId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  child_id TEXT NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL,
  description TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);
