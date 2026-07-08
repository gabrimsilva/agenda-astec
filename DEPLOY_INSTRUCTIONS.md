# 🚀 Instruções de Deploy - ASTEC Project

## Status Atual
✅ Build compilado e pronto em: `dist/`
✅ Código enviado para GitHub: `main` branch
❌ Deploy para VM pendente

## Como fazer o Deploy

### Opção 1: Via SCP + SSH (Recomendado)

**Terminal Windows (PowerShell):**

```powershell
# 1. Fazer upload dos arquivos compilados
scp -r "dist" "root@10.3.1.135:/home/astec/app/"
# Senha: superrhsa@#2018!

# 2. Conectar na VM
ssh root@10.3.1.135
# Senha: superrhsa@#2018!
```

**Na VM (após conectar via SSH):**

```bash
cd /home/astec/app

# 3. Copiar arquivos para o container Docker
docker cp dist/. astec-app:/app/dist/

# 4. Reiniciar o container
docker restart astec-app

# 5. Verificar se está rodando
docker logs -f astec-app
```

### Opção 2: Via GitHub Actions (Se Configurado)

Se você tiver GitHub Actions configurado:
1. Push para `main` está feito ✅
2. Actions devem rodar automaticamente
3. Deploy será feito automaticamente na VM

### Opção 3: Manual via WinSCP

1. Abra WinSCP
2. Conecte a `10.3.1.135` com usuário `root` e senha `superrhsa@#2018!`
3. Navegue até `/home/astec/app/`
4. Faça upload da pasta `dist/`
5. Conecte via SSH na VM e execute:

```bash
docker cp dist/. astec-app:/app/dist/
docker restart astec-app
```

## Verificar Deploy

Após fazer o deploy, você pode verificar se tudo está funcionando:

```bash
# Conectar na VM
ssh root@10.3.1.135

# Ver logs do container
docker logs astec-app

# Verificar se calendário está respondendo
curl http://localhost/calendario
```

## Problema Corrigido

**O que era o problema:**
- Atividades não apareciam no Calendário

**Causa:**
- Calendar.tsx usava filtro de datas diferente de MyAgenda.tsx

**Solução:**
- Padronizei ambos para usar a mesma estratégia de busca (sem filtro de datas)

**Commits:**
- `8bbac1f` - Fix: Calendar now uses same query strategy as MyAgenda

Após o deploy, as atividades aparecerão normalmente no Calendário! 🎉
