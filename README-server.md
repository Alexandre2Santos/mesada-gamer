# Mesada Gamer — Backend API (SQLite)

Projeto criado por um estudante de Análise e Desenvolvimento de Sistemas.

Este servidor fornece uma API REST simples para persistência dos dados do app (usuários, filhos, tarefas, aprovações, transações) usando SQLite.

Instalação:

```bash
npm install
```

Inicializar e executar:

```bash
npm start
```

O servidor cria um arquivo SQLite em `db/database.sqlite` e aplica o schema definido em `db/schema.sql` automaticamente.

Endpoints principais:

- `POST /api/register` { username, password }
- `POST /api/login` { username, password }
- `GET /api/me` (auth)
- `GET /api/children` (auth)
- `POST /api/children` (auth)
- `DELETE /api/children/:id` (auth)
- `GET /api/tasks` (auth)
- `POST /api/tasks` (auth)
- `POST /api/tasks/:id/complete` (submit completion)
- `POST /api/tasks/:id/approve` (auth)
- `POST /api/tasks/:id/reject` (auth)
- `GET /api/transactions` (auth)

Autenticação: usar header `Authorization: Bearer <token>` retornado em `/api/login`.

Observações:

- JWT secret padrão é `dev_secret_change_me`. Para produção, defina `JWT_SECRET` no ambiente.
- Trocar para MySQL/Postgres requer apenas ajustar `server.js` para usar outro client e aplicar o `db/schema.sql` correspondente.
