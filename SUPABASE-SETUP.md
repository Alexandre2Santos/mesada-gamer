# Configuração Supabase - Mesada Gamer

## 1. Criar Projeto Supabase

1. Acesse [supabase.com](https://supabase.com)
2. Crie uma conta e novo projeto
3. Copie a **URL do projeto** e **ANON KEY** da aba "Settings > API"

## 2. Atualizar Credenciais em `js/app.js`

No arquivo `js/app.js`, procure por:

```javascript
const SUPABASE_URL = "https://ejzuwpdbigeypggodwlq.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...";
```

Substitua pelos seus valores da aba API.

## 3. Criar Tabelas no Supabase

### Opção A: Usando o SQL Editor (Recomendado)

1. No painel Supabase, vá para **SQL Editor**
2. Crie uma nova query e copie o conteúdo de `supabase-schema.sql`
3. Clique em **Run**

### Opção B: Manualmente

Copie e execute em partes no SQL Editor:

```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

CREATE TABLE children (
  id TEXT PRIMARY KEY,
  ownerId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  avatar TEXT,
  birthdate TEXT,
  password_hash TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

CREATE TABLE tasks (
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

CREATE TABLE task_completions (
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

CREATE TABLE transactions (
  id TEXT PRIMARY KEY,
  ownerId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  child_id TEXT NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL,
  description TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);
```

## 4. Configurar Row Level Security (RLS) - Opcional mas Recomendado

Para maior segurança, ative RLS nas tabelas. Isso garante que cada usuário veja apenas seus dados.

Exemplo para a tabela `children`:

```sql
ALTER TABLE children ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuários podem ver seus próprios filhos"
ON children FOR SELECT
USING (ownerId = auth.uid());
```

## 5. Testar a Integração

1. Abra o app no navegador
2. Abra o **Console** (F12 > Console)
3. Crie uma nova conta
4. Adicione um filho - você deve ver mensagem "✅ cadastrado via Supabase"
5. Crie uma tarefa - você deve ver mensagem "⚔️ criada via Supabase"

Se vir erros, verifique:

- ✅ URL e ANON KEY corretas em `js/app.js`
- ✅ Tabelas criadas no Supabase
- ✅ SDK carregado (verifique se `window.supabase` existe no console)

## 6. Sincronização Automática

O app usa uma estratégia **híbrida**:

- Se há token de backend (servidor local): usa API
- Se NÃO há token: usa Supabase (quando configurado)
- Se nenhum dos dois: usa localStorage (offline)

Prioridade: **API Backend > Supabase > localStorage**
