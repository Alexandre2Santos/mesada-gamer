# Mesada Gamer

Projeto educativo: Banco da Mesada Gamer — versão fullstack com persistência.

Sobre o autor

- Este projeto foi criado por um estudante de Análise e Desenvolvimento de Sistemas.

Visão geral

- Frontend: interface estática (HTML/CSS/JS) em `index.html`, `css/styles.css` e `js/app.js`.
- Backend: API REST com persistência SQLite em `server.js` (arquivo de banco `db/database.sqlite`).
- Esquema do banco: `db/schema.sql` (tabelas: `users`, `children`, `tasks`, `task_completions`, `transactions`).

Fluxo principal

- Usuários (pais) podem registrar-se e logar. Cada usuário administra seus próprios filhos e tarefas.
- Filhos (profiles) pertencem a um usuário (`ownerId`).
- Filhos marcam tarefas como concluídas; pais aprovam/rejeitam e transações são registradas.

Arquivos importantes

- `index.html`: marcação e modais (login, completar tarefa, resgate).
- `css/styles.css`: estilos do projeto.
- `js/app.js`: lógica do frontend: estado local, renderização de views, autenticação local (localStorage) e ações (criar filho, criar tarefa, concluir, aprovar).
- `server.js`: servidor Express que expõe endpoints REST para registro/login, CRUD de filhos, tarefas, aprovações e transações.
- `db/schema.sql`: script SQL para criar as tabelas do banco.

Como rodar o servidor (local)

1. Instale dependências:

```bash
npm install
```

2. Inicie o servidor:

```bash
npm start
```

Observações técnicas

- O servidor usa JWT para autenticação e `better-sqlite3` para persistência. Em Windows, pode ser necessário instalar ferramentas de compilação (Visual Studio Build Tools) para compilar `better-sqlite3`.
- Para uso em produção, configure `JWT_SECRET` no ambiente e considere banco centralizado (Postgres/MySQL).

Se precisar, eu integro o frontend para consumir a API (trocar localStorage por chamadas HTTP).
