# 🚀 Guia Rápido - Testar MFA Localmente

**Tempo estimado:** 5-10 minutos  
**Requisitos:** Servidor rodando + Postman

---

## ✅ Verificar Servidor

### 1. Confirmar que o servidor está rodando
```bash
curl http://localhost:5000/health
```

Resposta esperada:
```json
{"status":"healthy","timestamp":"2026-07-13T20:43:08.709Z"}
```

---

## 🧪 Testar Endpoints com cURL

### 1. Testar Proteção (Sem Token)
```bash
curl -X POST http://localhost:5000/api/auth/mfa/disable \
  -H "Content-Type: application/json" \
  -d '{}'
```

Resposta esperada:
```json
{"error":"Não autenticado"}
```
**Status: 401** ✅

### 2. Testar OAuth Microsoft
```bash
curl -X GET http://localhost:5000/api/auth/microsoft
```

Resposta: Redirecionamento para login Microsoft (302) ✅

### 3. Testar Endpoint de Teste (Criar Usuário)
```bash
curl -X GET http://localhost:5000/api/auth/test
```

Resposta esperada:
```json
{
  "message":"✅ Usuário de teste criado",
  "credentials":{"email":"teste@astec.com","password":"teste123"},
  "token":"eyJ...",
  "instructions":[...]
}
```

**Nota:** Se retornar erro de banco, é esperado (banco não está rodando)

---

## 📊 Testar com Postman

### Passo 1: Importar Collection
1. Abrir Postman
2. **File → Import**
3. Selecionar `MFA_Tests_Postman.json`
4. Clicar **Import**

### Passo 2: Configurar Variáveis
1. Ir para **Environment**
2. Criar novo environment: `MFA_Local`
3. Adicionar variáveis:
   ```
   BASE_URL: http://localhost:5000/api
   TOKEN: (será preenchido automaticamente)
   USER_ID: (será preenchido automaticamente)
   ```

### Passo 3: Executar Testes na Sequência

#### Request 1: Criar Usuário Teste
```
GET /auth/test
```
- Copiar o `token` da resposta
- Colar em `{{TOKEN}}` no environment

#### Request 2: Verificar Status MFA
```
GET /auth/mfa/status
Headers: Authorization: Bearer {{TOKEN}}
```
Esperado: `"mfaEnabled":false`

#### Request 3: Setup MFA
```
POST /auth/mfa/setup
Headers: Authorization: Bearer {{TOKEN}}
Body: {}
```
Resposta:
- `qrCode` - Escaneie com Microsoft Authenticator
- `secret` - Backup manual
- `backupCodes` - 10 códigos de recuperação

#### Request 4: Confirmar MFA
```
POST /auth/mfa/confirm
Headers: Authorization: Bearer {{TOKEN}}
Body: {
  "totpCode": "123456",  // Use código do Authenticator
  "secret": "JBSWY3DP...", // Do response anterior
  "backupCodes": [...]
}
```

#### Request 5: Desabilitar MFA
```
POST /auth/mfa/disable
Headers: Authorization: Bearer {{TOKEN}}
Body: {
  "password": "teste123"
}
```

---

## 🎯 Fluxo Completo (Sem Postman)

### Se o Banco Estiver Rodando

#### 1. Login
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"teste@astec.com","password":"teste123"}'
```

Resposta (sem MFA):
```json
{"user":{...},"token":"eyJ..."}
```

#### 2. Usar Token
```bash
TOKEN="eyJ..."  # Do passo anterior

# Testar endpoint protegido
curl -X GET http://localhost:5000/api/auth/mfa/status \
  -H "Authorization: Bearer $TOKEN"
```

#### 3. Ativar MFA
```bash
curl -X POST http://localhost:5000/api/auth/mfa/setup \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}'
```

Anote o `secret` e `backupCodes` ⚠️

#### 4. Confirmar com Código TOTP
```bash
curl -X POST http://localhost:5000/api/auth/mfa/confirm \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "totpCode":"123456",
    "secret":"JBSWY3DP...",
    "backupCodes":[...]
  }'
```

#### 5. Próximo Login com MFA
```bash
# Primeiro step - só email/senha
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"teste@astec.com","password":"teste123"}'

# Resposta: mfaRequired: true
```

```bash
# Segundo step - com TOTP
curl -X POST http://localhost:5000/api/auth/verify-mfa \
  -H "Content-Type: application/json" \
  -d '{"userId":"...", "totpCode":"123456"}'

# Resposta: token + user
```

---

## 🔑 Variáveis de Teste

| Variável | Valor |
|----------|-------|
| Email Teste | `teste@astec.com` |
| Senha Teste | `teste123` |
| URL Base | `http://localhost:5000/api` |
| Porta | `5000` |

---

## ⚠️ Erros Comuns e Soluções

### Erro: "Não é possível conectar ao http://localhost:5000"
**Solução:** Iniciar servidor com `npm run dev`

### Erro: 500 em todos os endpoints
**Solução:** Banco de dados não está rodando
```bash
docker-compose up -d postgres
npm run db:migrate
```

### Erro: "Não autenticado" em GET /auth/mfa/status
**Solução:** Adicionar header `Authorization: Bearer {TOKEN}`

### Erro: "Código TOTP inválido"
**Solução:** 
1. Abrir Microsoft Authenticator
2. Copiar código de 6 dígitos
3. Colar no campo `totpCode`
4. **Usar dentro de 30 segundos** (código expira)

---

## 📱 Testar com Microsoft Authenticator

### Passo 1: Gerar QR Code
```bash
curl -X POST http://localhost:5000/api/auth/mfa/setup \
  -H "Authorization: Bearer $TOKEN" \
  -d '{}' > qr_response.json

# O JSON contém: qrCode (base64 data URL)
```

### Passo 2: Abrir QR Code
1. Copiar valor de `qrCode`
2. Colar em navegador ou usar ferramenta de decodificação

### Passo 3: Adicionar no Authenticator
1. Abrir Microsoft Authenticator no celular
2. Escanear QR Code com câmera
3. Confirmar adicionar conta
4. Código TOTP aparece na app

### Passo 4: Usar Código
```bash
# Copiar código de 6 dígitos da app
curl -X POST http://localhost:5000/api/auth/mfa/confirm \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"totpCode":"123456", "secret":"...", "backupCodes":[...]}'
```

---

## ✅ Checklist de Testes

- [ ] Servidor respondendo em `http://localhost:5000/health`
- [ ] POST /api/auth/mfa/disable retorna 401 sem token
- [ ] GET /api/auth/microsoft retorna 302 redirect
- [ ] GET /api/auth/test retorna usuário (ou erro se sem DB)
- [ ] Postman collection importada com sucesso
- [ ] Variáveis de ambiente configuradas
- [ ] Todos os 11 endpoints testados

---

## 🎓 Entender as Respostas

### Login Sem MFA
```json
{
  "user": {
    "id": "abc123",
    "email": "teste@astec.com",
    "name": "Usuário Teste",
    "role": "assistente"
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### Login Com MFA (Primeiro Passo)
```json
{
  "mfaRequired": true,
  "message": "Digite o código do Microsoft Authenticator",
  "userId": "abc123"
}
```

### Login Com MFA (Após TOTP)
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {...},
  "message": "✅ Autenticação com sucesso"
}
```

### Setup MFA
```json
{
  "qrCode": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAJQAAA...",
  "secret": "JBSWY3DP2JBXQ===",
  "backupCodes": [
    "12345678",
    "87654321",
    ...
  ],
  "message": "Escaneie o QR code com Microsoft Authenticator ou outra app 2FA"
}
```

---

## 🚀 Próximos Passos Após Testes

1. ✅ Endpoint validado → Database rodando (próxima etapa)
2. ✅ Testes com Postman → Testes com Navegador (próxima etapa)
3. ✅ Login simples → MFA completo (próxima etapa)
4. ✅ Segurança validada → Rollout para usuários (próxima etapa)

---

**Tempo gasto:** 5-10 minutos  
**Próximo:** Ativar banco de dados e testar com dados reais  
**Status:** ✅ Backend pronto para testes

