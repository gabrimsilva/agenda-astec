# Deploy do ASTEC na VM Linux (Docker)

Sobe o sistema completo (app + PostgreSQL) com um único comando, usando Docker Compose.

## Pré-requisitos
- Docker e Docker Compose v2 instalados (`docker --version`, `docker compose version`).
- Git instalado.

## 1. Clonar o repositório
```bash
git clone https://github.com/gabrimsilva/agenda-astec.git
cd agenda-astec
```

## 2. Subir tudo (build + banco + app)
```bash
docker compose up -d --build
```
- O `app` aguarda o banco ficar saudável, cria/sincroniza o schema (`drizzle-kit push`),
  popula os tipos de atividade e o usuário admin, e então inicia o servidor.

## 3. Acessar
- App: `http://IP_DA_VM:5000`
- Login inicial: **admin@astec.com** / **admin123**

## Comandos úteis
```bash
docker compose logs -f app      # acompanhar logs do app
docker compose logs -f db       # logs do banco
docker compose ps               # status dos containers
docker compose restart app      # reiniciar só o app
docker compose down             # parar (mantém os dados no volume)
docker compose down -v          # parar e APAGAR os dados do banco
docker compose up -d --build    # reconstruir após atualizar o código (git pull)
```

## Atualizar para uma nova versão
```bash
git pull
docker compose up -d --build
```

## Observações
- Os dados do PostgreSQL ficam no volume `astec_pgdata` (persistem entre reinícios).
- O banco também é exposto no host em `localhost:5433` (para debug/psql), mapeado para a porta 5432 do container.
- **Segurança:** altere `SESSION_SECRET` no `docker-compose.yml` para um valor forte antes de usar em produção.
