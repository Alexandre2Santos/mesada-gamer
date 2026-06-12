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

## Changelog

- **v1.0 — 2026-06-12**
  Lançamento inicial — resumo das mudanças realizadas até o momento:
  - Implementação do frontend: `index.html`, `css/styles.css`, `js/app.js`.
  - Implementação do backend: servidor Express em `server.js` com endpoints REST.
  - Esquema e scripts de banco de dados: `db/schema.sql` e `supabase-schema.sql`.
  - Documentação e setup: `package.json`, `README-server.md`, `SUPABASE-SETUP.md`.
  - Assets e recursos estáticos: pasta `img/`.
  - Instruções básicas para rodar localmente incluídas no README.

  Nota: Versão inicial funcional. Próximos passos sugeridos: testes automatizados, hardening da autenticação, e deploy para ambiente de produção.

## Instruções de release

1. Atualize o código e confirme as mudanças:

```bash
git add .
git commit -m "chore(release): preparar nova versão"
```

2. Crie uma nova tag semântica:

```bash
git tag -a vX.Y -m "vX.Y"
```

3. Envie o commit e a tag para o remoto:

```bash
git push origin HEAD
git push origin vX.Y
```

4. Opcional: se quiser manter o branch `main` atualizado, faça:

```bash
git push origin main
```

5. Atualize este `README.md` e o `Changelog` com a nova versão após o release.
