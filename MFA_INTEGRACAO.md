# 🔐 Integração MFA - Guia Completo

## 📦 Arquivos Criados

```
server/
├── microsoft-auth.ts      ← OAuth 2.0 com Microsoft Authenticator
├── mfa-manager.ts         ← Gerenciamento de TOTP
└── auth-routes.ts         ← Rotas de autenticação com MFA

shared/
└── schema.ts              ← ✅ JÁ ATUALIZADO com campos MFA

root/
├── MFA_SETUP_LOCAL.md     ← Documentação detalhada
├── MFA_INTEGRACAO.md      ← Este arquivo
└── MFA_Tests_Postman.json ← Collection para testar

.env                       ← Adicionar variáveis (veja abaixo)
```

---

## ⚙️ Integração no Projeto

### Passo 1: Adicionar Dependências

```bash
npm install @azure/msal-node speakeasy qrcode
```

### Passo 2: Atualizar `.env`

```env
# JWT
SESSION_SECRET=sua_chave_secreta_aqui_minimo_32_caracteres

# Azure/Microsoft 365 (para OAuth)
AZURE_CLIENT_ID=seu_client_id_do_azure
AZURE_TENANT_ID=seu_tenant_id_ou_common
AZURE_CLIENT_SECRET=seu_client_secret

# URLs
BACKEND_URL=http://localhost:3000
FRONTEND_URL=http://localhost:5173
```

### Passo 3: Registrar Rotas no `server/index.ts`

```typescript
import authRouter from "./auth-routes";

// No setup de rotas:
app.use(authRouter);
```

### Passo 4: Migração do Banco (Adicionar Campos)

Se você usar Drizzle Migrations:

```bash
# Gerar migration
npx drizzle-kit generate:pg

# Aplicar
npm run db:migrate
```

Ou executar SQL diretamente:

```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_secret TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_backup_codes TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS microsoft_azure_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();
```

### Passo 5: Atualizar Middleware de Auth (opcional)

Se quiser forçar MFA para todos:

```typescript
// server/middleware.ts
export function requireMFAMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  if (!req.user) {
    return res.status(401).json({ error: "Não autenticado" });
  }

  // Verificar se MFA está ativado
  // Se não, redirecionar para setup de MFA
  next();
}
```

---

## 🧪 Testar Localmente

### Opção 1: Usar Postman (Recomendado)

1. Abrir Postman
2. Importar `MFA_Tests_Postman.json`
3. Configurar variáveis:
   - `BASE_URL` = `http://localhost:3000`
4. Seguir ordem dos testes

### Opção 2: Usar cURL

```bash
# 1. Criar usuário teste
curl http://localhost:3000/auth/test

# 2. Fazer login
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"teste@astec.com","password":"teste123"}'

# 3. Gerar MFA (usando token do passo 2)
curl -X POST http://localhost:3000/auth/mfa/setup \
  -H "Authorization: Bearer SEU_TOKEN"

# 4. Escanear QR no Authenticator e confirmar
curl -X POST http://localhost:3000/auth/mfa/confirm \
  -H "Authorization: Bearer SEU_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"totpCode":"123456","secret":"JBSWY3DPEBLW64TMMQ======","backupCodes":["ABC12345"]}'
```

### Opção 3: Frontend (Depois)

Atualizar telas de login com:
- Input para TOTP code
- QR code para setup
- Backup codes para recuperação

---

## 🔗 Fluxo de Autenticação Integrado

### Cenário 1: Novo Usuário (Sem MFA)

```
1. POST /auth/login
   Email: usuario@empresa.com
   Senha: senha123
   
2. ✅ Retorna JWT token diretamente
   (Primeiro login, sem MFA obrigatório)
```

### Cenário 2: Usuário com MFA Ativado

```
1. POST /auth/login
   Email: usuario@empresa.com
   Senha: senha123
   
2. 🔐 Retorna mfaRequired: true + userId
   (Sistema detecta MFA ativado)
   
3. POST /auth/verify-mfa
   userId: abc123...
   totpCode: 123456
   
4. ✅ Retorna JWT token
   (TOTP validado)
```

### Cenário 3: Microsoft OAuth (SSO Corporativo)

```
1. GET /auth/microsoft
   ↓
2. Redireciona para login Microsoft
   (Azure AD)
   
3. Usuário faz login
   ↓
4. Microsoft Authenticator valida MFA
   (Se habilitado nas políticas)
   
5. Callback em /auth/microsoft/callback
   ↓
6. ✅ Retorna JWT + redireciona
   (Usuário criado/atualizado no banco)
```

---

## 📱 Configurar Microsoft Authenticator

### Android/iOS:

1. Baixar **Microsoft Authenticator** (Microsoft)
2. Abrir app
3. Toque em **"Adicionar conta"**
4. Escolha **"Outra conta (Google, Facebook, etc)"**
5. Toque **"Escanear código QR"**
6. Aponte para o QR da tela de setup
7. **Pronto!** Código TOTP aparece automaticamente

### Detalhes Técnicos:
- **Tipo:** TOTP (RFC 6238)
- **Algoritmo:** SHA1
- **Dígitos:** 6
- **Período:** 30 segundos
- **Emulador:** Pode testar com `speakeasy` no backend

---

## 🛡️ Segurança

### ✅ Implementado:

- **Senhas:** Hasheadas com bcrypt (10 rounds)
- **TOTP:** Secrets em base32, window de 2 períodos (60s)
- **Backup Codes:** Descartáveis, one-time use
- **JWT:** Assinado com SESSION_SECRET, TTL 7 dias
- **Azure:** Suporta políticas de segurança corporativas

### ⚠️ Próximos Passos:

- [ ] Rate limiting em login/MFA
- [ ] Logs de auditoria em mudanças de MFA
- [ ] Alertas se muitos backup codes usados
- [ ] Sincronização com Active Directory (Azure AD Sync)

---

## 📊 Admin Dashboard (Futuro)

Tela para administradores:

```
┌─────────────────────────────────────┐
│ 🔐 Gerenciamento MFA                │
├─────────────────────────────────────┤
│ 12 Colaboradores                    │
│ ✅ 8 com MFA ativado                │
│ ⚠️  4 sem MFA                        │
│                                     │
│ [Forçar MFA Obrigatório]           │
│ [Ver Usuários]                      │
│ [Relatório de Backup Codes]         │
└─────────────────────────────────────┘
```

---

## 🚀 Deployar em Produção

### Antes de Fazer Deploy:

1. **Testar localmente** ✅
2. **Configurar Azure (se usar OAuth)**
3. **Adicionar variáveis em produção**
4. **Executar migrações do banco**
5. **Backup do banco antes**

### Variáveis de Produção:

```env
SESSION_SECRET=chave_muito_segura_produção
AZURE_CLIENT_ID=id_de_produção
AZURE_TENANT_ID=seu_tenant_id
AZURE_CLIENT_SECRET=secret_de_produção
BACKEND_URL=https://api.seudominio.com
FRONTEND_URL=https://seudominio.com
```

### Testar em Staging Primeiro:

```bash
# Deploy para staging
npm run build
npm run deploy:staging

# Testar todos os cenários
# - Login sem MFA
# - Setup MFA
# - Login com MFA
# - Microsoft OAuth
```

---

## 📋 Checklist de Implementação

- [ ] Instalar dependências (`npm install ...`)
- [ ] Adicionar `.env` com variáveis
- [ ] Atualizar schema do banco
- [ ] Executar migrações
- [ ] Registrar rotas no `index.ts`
- [ ] Testar com Postman
- [ ] Integrar UI de login
- [ ] Integrar UI de MFA setup
- [ ] Testar com colaboradores
- [ ] Habilitar MFA obrigatório (opcional)
- [ ] Fazer deploy em produção
- [ ] Monitorar logs

---

## 🆘 Troubleshooting

### Erro: "Cannot find module '@azure/msal-node'"
```bash
npm install @azure/msal-node speakeasy qrcode
```

### Erro: "MSAL não inicializado"
→ Deixe em modo demo (sem Azure) para testes locais

### Erro: "Código TOTP inválido"
→ Sincronizar relógio do celular
→ Usar backup code

### Erro: "JWT token expirado"
→ Fazer login novamente

### Erro: "Banco sem campos de MFA"
→ Executar migrations: `npm run db:migrate`

---

## 📞 Suporte

Para dúvidas:
1. Consultar `MFA_SETUP_LOCAL.md`
2. Testar endpoints com Postman
3. Verificar logs do servidor
4. Consultar código em `auth-routes.ts`

---

## 📝 Notas Técnicas

### TOTP (Time-based One-Time Password)

```
RFC 6238 - TOTP: Time-Based One-Time Password
- Base: HMAC-SHA1
- Entrada: Secret + Timestamp
- Saída: 6 dígitos
- Período: 30 segundos
- Janela: ±30 segundos (window: 2)
```

### JWT Payload

```json
{
  "userId": "uuid",
  "username": "usuario@empresa.com",
  "role": "admin|assistente",
  "iat": 1234567890,
  "exp": 1234654290
}
```

### Fluxo OAuth 2.0

```
1. Usuário clica "Login com Microsoft"
2. Redireciona para: https://login.microsoftonline.com/...
3. Usuário faz login + MFA
4. Microsoft redireciona com código de autorização
5. Backend troca código por token (server-to-server)
6. Backend cria/atualiza usuário
7. Frontend recebe JWT local
```

---

**Status:** ✅ Implementação concluída e pronta para testes
**Próximo:** Execute `npm install` e comece a testar!
