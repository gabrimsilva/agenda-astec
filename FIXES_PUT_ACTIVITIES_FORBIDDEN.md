# Possíveis Correções: Erro 403 na Rota PUT /api/activities/:id

## Opção 1: Adicionar Validação de Dados Antigos (Defesa Proativa)

Se o problema for que dados antigos do Replit têm campos que cause erro silencioso, adicione validação explícita:

### Localização: `server/routes.ts` linha 2369

```typescript
app.put("/api/activities/:id", authMiddleware, async (req: AuthRequest, res) => {
  try {
    console.log("[PUT /api/activities/:id] Request body:", JSON.stringify(req.body, null, 2));
    
    // ✓ NOVA VALIDAÇÃO: Verificar campos que podem ser problemáticos
    const data = updateActivitySchema.parse(req.body);
    
    // Log adicional para debugar dados antigos
    if (data.latitude || data.longitude) {
      console.log(`[PUT] Coordenadas: (${data.latitude}, ${data.longitude})`);
    }
    
    if (!data.latitude && !data.longitude && data.address) {
      console.log(`[PUT] Será geocodificada: ${data.address}`);
    }
    
    console.log("[PUT /api/activities/:id] Parsed data:", JSON.stringify(data, null, 2));
    
    // ... resto da implementação
```

**Benefício**: Logs detalhados para identificar exatamente qual campo causa problemas.

---

## Opção 2: Adicionar Tratamento de Erro Específico para 403

Se o erro 403 for vindo de um middleware não identificado, capture e relance com mais contexto:

### Localização: `server/routes.ts` linha 2558

```typescript
    } catch (error: any) {
      // ✓ NOVA LÓGICA: Distinguir entre tipos de erro
      if (error.statusCode === 403 || error.status === 403) {
        console.error("[PUT /api/activities/:id] Permissão negada", {
          activityId: req.params.id,
          userId: req.user!.userId,
          error: error.message,
          stack: error.stack
        });
        return res.status(403).json({ 
          error: "Permissão negada. Você não tem autorização para atualizar esta atividade." 
        });
      }
      
      // Erro padrão (400)
      console.error("[PUT /api/activities/:id] Erro:", error.message);
      res.status(400).json({ error: error.message });
    }
```

**Benefício**: Diferencia erros de permissão de erros de validação, facilitando debug.

---

## Opção 3: Adicionar Validação de Permissão (Alinhado com DELETE)

Atualmente, a rota DELETE tem validação de permissão mas PUT não. Adicionar consistência:

### Localização: `server/routes.ts` linha 2364

```typescript
app.put("/api/activities/:id", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const activityId = req.params.id;
    
    // ✓ NOVA VALIDAÇÃO: Verificar permissão (alinhado com DELETE)
    const activity = await storage.getActivity(activityId);
    if (!activity) {
      return res.status(404).json({ error: "Atividade não encontrada" });
    }
    
    // Verificar se é admin ou técnico proprietário
    const user = await storage.getUser(req.user!.userId);
    if (!user) {
      return res.status(403).json({ error: "Usuário não autorizado" });
    }
    
    const isAdmin = user.role === "admin";
    const userTechnician = await storage.getTechnicianByUserId(user.id);
    const isOwner = activity.technicianId && userTechnician?.id === activity.technicianId;
    
    if (!isAdmin && !isOwner) {
      console.log(`[PUT /api/activities/:id] Permissão negada. User: ${user.id}, Role: ${user.role}, ActivityTech: ${activity.technicianId}, UserTech: ${userTechnician?.id}`);
      return res.status(403).json({ error: "Você não tem permissão para atualizar esta atividade" });
    }
    
    console.log("[PUT /api/activities/:id] Request body:", JSON.stringify(req.body, null, 2));
    const data = updateActivitySchema.parse(req.body);
    
    // ... resto da implementação
```

**Benefício**: Segurança alinhada entre PUT e DELETE. Impede que usuários não-autorizados modifiquem atividades de outros.

---

## Opção 4: Melhorar Tratamento de Geocodificação (Tolerância a Falhas)

Se geocodificação falha, tentar continuar sem coordenadas:

### Localização: `server/routes.ts` linha 2500

```typescript
      // Auto-geocode if address is provided but no coordinates
      if (!data.latitude && !data.longitude && data.address) {
        const fullAddress = [
          data.address,
          data.numero,
          data.bairro,
          data.city,
          data.state,
          data.country || "Brasil"
        ].filter(Boolean).join(", ");
        
        try {
          const geocoded = await geocodeAddress(fullAddress);
          if (geocoded.found) {
            (data as any).latitude = geocoded.latitude.toString();
            (data as any).longitude = geocoded.longitude.toString();
            console.log(`📍 Auto-geocoded updated activity address: ${fullAddress} -> (${geocoded.latitude}, ${geocoded.longitude})`);
          } else {
            // ✓ NOVO: Log explicativo quando geocodificação falha
            console.warn(`⚠️  Geocoding failed for address: ${fullAddress}`);
            console.warn(`⚠️  Activity will be updated without coordinates`);
            // Continue anyway - don't fail the entire update
          }
        } catch (geoError) {
          // ✓ NOVO: Capturar erro específico
          console.error("❌ Geocoding error:", geoError);
          // ✓ NOVO: Não falhar - continuar atualização
          console.warn("⚠️  Continuing update without geocoding...");
        }
      }
```

**Benefício**: Geocodificação falha não impede atualização da atividade.

---

## Opção 5: Adicionar Endpoint de Teste para PUT (Debug Helper)

Criar um endpoint de diagnóstico que simula PUT sem alterar dados:

### Localização: `server/routes.ts` (novo endpoint)

```typescript
  // ✓ NOVO: Endpoint de diagnóstico para testar PUT
  app.post("/api/activities/:id/test-update", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const activityId = req.params.id;
      const activity = await storage.getActivity(activityId);
      
      if (!activity) {
        return res.status(404).json({ error: "Atividade não encontrada" });
      }
      
      // Testar parse sem fazer atualização
      console.log("[TEST UPDATE] Input:", JSON.stringify(req.body, null, 2));
      
      const data = updateActivitySchema.parse(req.body);
      console.log("[TEST UPDATE] Parsed:", JSON.stringify(data, null, 2));
      
      // Retornar o que seria atualizado
      res.json({
        success: true,
        message: "Validação passou - nenhuma atualização feita",
        wouldUpdate: data,
        currentActivity: activity
      });
    } catch (error: any) {
      console.error("[TEST UPDATE] Error:", error.message);
      res.status(400).json({ 
        error: "Validação falhou",
        details: error.message,
        code: error.code
      });
    }
  });

  // Usar assim:
  // curl -X POST http://localhost:5000/api/activities/[ID]/test-update \
  //   -H "Content-Type: application/json" \
  //   -H "Authorization: Bearer [TOKEN]" \
  //   -d '{[DADOS_PARA_TESTAR]}'
```

**Benefício**: Endpoint para testar validação sem fazer atualização real.

---

## Opção 6: Adicionar Sanitização de Dados Antigos

Se dados antigos têm campos extras ou formatos incompatíveis:

### Localização: `server/routes.ts` linha 2368

```typescript
app.put("/api/activities/:id", authMiddleware, async (req: AuthRequest, res) => {
  try {
    console.log("[PUT /api/activities/:id] Request body:", JSON.stringify(req.body, null, 2));
    
    // ✓ NOVO: Sanitizar dados antigos do Replit
    const sanitizedBody = {
      ...req.body,
      // Remover campos que podem causar problemas
      _id: undefined,          // MongoDB ID antigo
      __v: undefined,          // Versão antigo do Mongoose
      createdAt: undefined,    // Não permissão atualizar createdAt
      updatedAt: undefined,    // updatedAt é gerenciado pelo servidor
      id: undefined,           // Não mudar ID
    };
    
    console.log("[PUT /api/activities/:id] Sanitized body:", JSON.stringify(sanitizedBody, null, 2));
    
    const data = updateActivitySchema.parse(sanitizedBody);
    console.log("[PUT /api/activities/:id] Parsed data:", JSON.stringify(data, null, 2));
```

**Benefício**: Remove campos antigos que podem causar problemas de validação.

---

## Opção 7: Adicionar Retry Logic para Geocodificação

Se Mapbox/Nominatim falha ocasionalmente:

### Localização: `server/services/geocoding.ts` (nova função)

```typescript
/**
 * Retry geocoding with exponential backoff
 */
export async function geocodeAddressWithRetry(
  address: string,
  numero?: string,
  bairro?: string,
  city?: string,
  state?: string,
  country?: string,
  maxRetries: number = 3
): Promise<GeocodeResult> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const result = await geocodeAddress(address, numero, bairro, city, state, country);
      if (result.found) {
        return result;
      }
    } catch (error) {
      lastError = error as Error;
      const delay = Math.pow(2, attempt) * 100; // 100ms, 200ms, 400ms
      console.log(`[Geocode] Attempt ${attempt + 1} failed, retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  console.error(`[Geocode] All ${maxRetries} attempts failed`, lastError);
  return {
    latitude: 0,
    longitude: 0,
    displayName: address,
    found: false,
  };
}
```

**Benefício**: Trata falhas temporárias de APIs externas.

---

## Opção 8: Adicionar Validação de Content-Type

Se o erro vem de um WAF que rejeita certos Content-Types:

### Localização: `server/index.ts` linha 11

```typescript
const app = express();
// Reduced from 50MB to 15MB to limit memory usage
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: false, limit: '15mb' }));

// ✓ NOVO: Middleware para garantir Content-Type correto
app.use((req, res, next) => {
  if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
    if (!req.is('application/json')) {
      console.warn(`[Content-Type] ${req.method} ${req.path}: ${req.get('content-type') || 'none'}`);
      // Ainda assim aceitar, mas logar
    }
  }
  next();
});
```

**Benefício**: Logging de Content-Type pode ajudar a identificar problemas de WAF.

---

## Recomendação Imediata

**Aplique Opção 1 + Opção 2** primeiro (logs detalhados + melhor tratamento de erro):

```typescript
// server/routes.ts linha 2368-2560
app.put("/api/activities/:id", authMiddleware, async (req: AuthRequest, res) => {
  try {
    console.log("[PUT /api/activities/:id] ===== START DEBUG =====");
    console.log("[PUT] Activity ID:", req.params.id);
    console.log("[PUT] User ID:", req.user!.userId);
    console.log("[PUT] Request body:", JSON.stringify(req.body, null, 2));
    
    const data = updateActivitySchema.parse(req.body);
    console.log("[PUT /api/activities/:id] Parsed data success");
    
    // ... resto da implementação
    
    res.json(activity);
  } catch (error: any) {
    console.error("[PUT /api/activities/:id] Error caught:", {
      message: error.message,
      code: error.code,
      status: error.status,
      statusCode: error.statusCode,
    });
    
    if (error.statusCode === 403 || error.status === 403) {
      return res.status(403).json({ 
        error: "Permissão negada" 
      });
    }
    
    res.status(400).json({ error: error.message });
  }
});
```

Isso fornecerá logs suficientes para identificar se o problema é:
1. Schema Zod rejection
2. Middleware permission
3. External API failure
4. WAF blocking

---

## Checklist de Implementação

- [ ] Revisar qual opção se aplica ao seu caso
- [ ] Implementar logs detalhados (Opção 1)
- [ ] Testar localmente com dados antigos
- [ ] Verificar logs durante erro
- [ ] Se problema persiste, aplicar Opção 2 ou 3
- [ ] Fazer commit e teste em produção
- [ ] Documentar solução encontrada

---

## Referências

- [Zod Validation](https://zod.dev)
- [Express Error Handling](https://expressjs.com/en/guide/error-handling.html)
- [PUT vs PATCH](https://developer.mozilla.org/en-US/docs/Web/HTTP/Methods/PUT)
