# Guia de Debug: Erro 403 Forbidden na Rota PUT /api/activities/:id

## Problema Relatado
Ao tentar atualizar atividades com dados antigos do Replit via PUT `/api/activities/:id`, a API retorna **403 Forbidden**.

---

## Passo 1: Capturar a Requisição Exata que Falha

### A. Usar Chrome DevTools
```
1. Abrir Chrome DevTools (F12)
2. Ir para aba Network
3. Filtrar por XHR
4. Tentar atualizar uma atividade
5. Clicar na requisição PUT que retorna 403
6. Copiar como cURL
```

### B. Executar cURL e Salvar Resposta Completa
```bash
# Formato da requisição que está falhando
curl -i -v \
  -X PUT "http://localhost:5000/api/activities/[ACTIVITY_ID]" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer [SEU_TOKEN]" \
  -d '{
    "status": "aCaminho",
    "technicianId": "[TECH_ID]",
    "scheduledDate": "[DATA]",
    "startTime": "[HORA]",
    "endTime": "[HORA]",
    "latitude": "[LAT]",
    "longitude": "[LON]"
  }' > response_403.txt 2>&1

cat response_403.txt
```

**O que procurar na resposta:**
- Header `Server:` (identifica se vem de Replit/proxy)
- Header `Via:` (proxy)
- Header `X-Forwarded-*` (múltiplos proxies)
- Body da resposta (mensagem de erro específica)

---

## Passo 2: Verificar Origem do Erro

### Se a resposta contém "Forbidden" do servidor Replit:
```
< HTTP/1.1 403 Forbidden
< Server: Replit
< X-Powered-By: Replit

Body: Forbidden
```
→ **Erro vem do proxy do Replit, não da aplicação**

### Se a resposta contém mensagem do ASTEC:
```
< HTTP/1.1 403 Forbidden

Body: {"error": "Você não tem permissão..."}
```
→ **Erro vem da aplicação**

### Se a resposta contém erro de geocodificação:
```
< HTTP/1.1 400 Bad Request

Body: {"error": "Failed to geocode..."}
```
→ **Erro vem da validação de dados**

---

## Passo 3: Testar com Dados Mínimos

Se o erro é da aplicação, teste com dados progressivamente mais completos:

### Teste 1: Mínimo absoluto
```bash
curl -i -X PUT "http://localhost:5000/api/activities/[ID]" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer [TOKEN]" \
  -d '{"status": "aCaminho"}' 
```

### Teste 2: Adicionar localização
```bash
curl -i -X PUT "http://localhost:5000/api/activities/[ID]" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer [TOKEN]" \
  -d '{
    "status": "aCaminho",
    "address": "Rua Teste",
    "city": "São Paulo",
    "state": "SP"
  }' 
```

### Teste 3: Adicionar coordenadas
```bash
curl -i -X PUT "http://localhost:5000/api/activities/[ID]" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer [TOKEN]" \
  -d '{
    "status": "aCaminho",
    "latitude": "-23.5505",
    "longitude": "-46.6333"
  }' 
```

### Teste 4: Dados completos (iguais aos dados antigos que falham)
```bash
curl -i -X PUT "http://localhost:5000/api/activities/[ID]" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer [TOKEN]" \
  -d '{[DADOS_QUE_ESTÃO_FALHANDO]}'
```

**Se funcionou até Teste 3 e falhou em Teste 4**: o problema está com um campo específico dos dados antigos.

---

## Passo 4: Validar Formato de Dados Antigos

### A. Verificar formato de scheduledDate
```javascript
// Dados antigos podem estar em formato inválido
const dataAntiga = "2024-01-15";      // ✓ OK
const dataAntiga = "15/01/2024";      // ✓ Schema aceita (transforma)
const dataAntiga = "2024-01-15T10:00"; // ✓ OK

// Testar transformação Zod
const { z } = require("zod");
const dateSchema = z.union([z.date(), z.string()]).transform((val) => {
  if (typeof val === 'string') {
    return new Date(val);
  }
  return val;
});

try {
  const result = dateSchema.parse("15/01/2024");
  console.log("✓ Data transformada:", result);
} catch (err) {
  console.error("✗ Erro na transformação:", err.message);
}
```

### B. Verificar formato de latitude/longitude
```javascript
// Schema aceita múltiplos formatos
const latLngSchema = z.union([
  z.number(), 
  z.string(), 
  z.null(), 
  z.undefined()
]).transform((val) => {
  if (typeof val === 'string') return val;
  if (typeof val === 'number') return val.toString();
  return val;
}).optional().nullable();

// Testar
console.log(latLngSchema.parse("-23.5505"));     // ✓ String
console.log(latLngSchema.parse(-23.5505));       // ✓ Number
console.log(latLngSchema.parse(null));           // ✓ Null
console.log(latLngSchema.parse(undefined));      // ✓ Undefined
```

---

## Passo 5: Ativar Logs de Debug

### A. No servidor, adicionar logs na rota PUT
```typescript
// server/routes.ts, linha 2368, depois do parse:
app.put("/api/activities/:id", authMiddleware, async (req: AuthRequest, res) => {
  try {
    console.log("[PUT] ===== REQUEST DEBUG =====");
    console.log("[PUT] Activity ID:", req.params.id);
    console.log("[PUT] Request body raw:", JSON.stringify(req.body, null, 2));
    
    const data = updateActivitySchema.parse(req.body);
    
    console.log("[PUT] Parsed data success:", JSON.stringify(data, null, 2));
    console.log("[PUT] Has latitude:", data.latitude);
    console.log("[PUT] Has longitude:", data.longitude);
    console.log("[PUT] Will geocode:", !data.latitude && !data.longitude && data.address);
    // ... resto da rota
```

### B. Verificar logs do servidor
```bash
# Terminal do servidor
npm run dev 2>&1 | grep "PUT"

# Ou em arquivo
npm run dev > server.log 2>&1 &
tail -f server.log | grep "\[PUT\]"
```

---

## Passo 6: Testar Fora do Replit

### Se está usando Replit Cloud:
```bash
# 1. Deploy localmente
npm run dev

# 2. Testar PUT localmente
curl -i -X PUT "http://localhost:5000/api/activities/[ID]" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer [TOKEN]" \
  -d '{[DADOS_ANTIGOS]}'

# Se funciona localmente mas não em Replit:
# → Problema é do proxy/WAF do Replit
```

---

## Passo 7: Investigar Dados Antigos Específicos

### A. Exportar atividade problemática
```javascript
// No console do frontend ou backend
const activity = await fetch('/api/activities/[ID]').then(r => r.json());
console.log(JSON.stringify(activity, null, 2));
// Copiar para arquivo
```

### B. Analisar campos problemáticos
```javascript
const activity = {
  // Identificar campos que podem ser problemáticos:
  
  // ✓ Verificar tipos
  latitude: typeof activity.latitude,  // string, number, null?
  longitude: typeof activity.longitude,
  
  // ✓ Verificar formatos de data
  scheduledDate: activity.scheduledDate,  // ISO string ou Date?
  endDate: activity.endDate,              // ISO string ou Date?
  
  // ✓ Verificar campos customizados
  customField1: activity.customField1,  // campo que pode não existir no schema?
  
  // ✓ Verificar campos muito grandes
  description_length: activity.description?.length,
  notes_length: activity.notes?.length,
};
```

---

## Passo 8: Capturar com Proxy (para ver reescrita de headers)

```bash
# Usar mitmproxy para interceptar e ver o que o Replit envia
mitmproxy --listen-host 127.0.0.1 --listen-port 8080

# Configurar cliente para usar proxy:
curl -i -x 127.0.0.1:8080 \
  -X PUT "http://localhost:5000/api/activities/[ID]" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer [TOKEN]" \
  -d '{[DADOS]}'

# Verificar headers reescritos
```

---

## Checklist de Investigação

- [ ] Capturou requisição completa com cURL
- [ ] Verificou headers da resposta 403
- [ ] Testou com dados mínimos (Teste 1-4)
- [ ] Validou formato de campos antigos
- [ ] Ativou logs de debug no servidor
- [ ] Testou localmente vs Replit
- [ ] Verificou se é erro de aplicação ou proxy
- [ ] Identificou campo específico que causa erro
- [ ] Consultou documentação do Replit sobre WAF

---

## Exemplos de Saída Esperada

### ✓ Sucesso (200 OK)
```
< HTTP/1.1 200 OK
< Content-Type: application/json

{"id":"...", "status":"aCaminho", "updatedAt":"..."}
```

### ✗ Erro de validação (400 Bad Request)
```
< HTTP/1.1 400 Bad Request
< Content-Type: application/json

{"error":"Horário inválido: o horário de término..."}
```

### ✗ Erro de conflito (409 Conflict)
```
< HTTP/1.1 409 Conflict
< Content-Type: application/json

{"error":"Conflito de horário: já existe uma atividade..."}
```

### ✗ Erro de proxy (403 Forbidden do Replit)
```
< HTTP/1.1 403 Forbidden
< Server: Replit
< X-Powered-By: Replit

Forbidden
```

---

## Recursos Adicionais

- [Documentação Replit WAF](https://docs.replit.com)
- [Logs de Erro ASTEC](../server/routes.ts)
- [Schema Zod](../shared/schema.ts)
- [Testes cURL](./curl-commands.sh)

---

## Contato para Escalação

Se depois de todos esses testes você ainda tiver 403:

1. **Salve**: Resposta completa de cURL com -v -i
2. **Salve**: Logs do servidor durante erro
3. **Salve**: Amostra de dados que está falhando
4. **Compartilhe** com suporte do Replit mencionando:
   - "PUT /api/activities/:id retorna 403 com dados antigos"
   - "Funciona localmente, falha em Replit Cloud"
   - Incluir resposta de cURL completa
