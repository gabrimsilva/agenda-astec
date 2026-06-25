# ASTEC - Sistema de Gestão de Agenda Técnica

## Documentação Técnica e Operacional
**Versão:** 1.0.0  
**Cliente:** Renner Coatings  
**Data:** Dezembro 2025

---

## 1. Proposta e Objetivo do Sistema

### 1.1 Visão Geral
O **ASTEC** (Assistente Técnico) é um sistema SaaS empresarial desenvolvido para centralizar e otimizar a gestão de agendas e atividades de assistentes técnicos da Renner Coatings. 

### 1.2 Objetivos Principais

| Objetivo | Descrição |
|----------|-----------|
| **Centralização de Agendas** | Unificar o planejamento e acompanhamento de visitas técnicas em uma única plataforma |
| **Rastreamento em Tempo Real** | Monitorar a localização GPS dos técnicos em campo |
| **Gestão de Clientes** | Cadastro completo com geocodificação automática de endereços |
| **Controle de Tempo** | Categorizar horas trabalhadas (Efetivo, Adicional, Perda) |
| **Relatórios Técnicos (RAT)** | Gerar relatórios de assistência técnica digitais com assinatura |
| **KPIs e Métricas** | Fornecer indicadores de produtividade e eficiência |

### 1.3 Público-Alvo

- **Administradores**: Gestão completa de técnicos, clientes, agendas e relatórios
- **Assistentes Técnicos**: Visualização de agenda, check-in/out, navegação GPS, criação de RATs

### 1.4 Benefícios Esperados

1. Redução de tempo administrativo no planejamento de agendas
2. Maior visibilidade sobre a produtividade da equipe técnica
3. Eliminação de relatórios em papel (RAT digital)
4. Otimização de rotas e redução de custos de deslocamento
5. Dados precisos para tomada de decisão gerencial

---

## 2. Arquitetura do Sistema

### 2.1 Stack Tecnológica

```
┌─────────────────────────────────────────────────────────────┐
│                        FRONTEND                              │
│  React 18 + TypeScript + Vite + PWA                         │
│  Tailwind CSS + shadcn/ui + Radix UI                        │
│  TanStack Query + Wouter + React Hook Form                  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                        BACKEND                               │
│  Node.js + Express.js + TypeScript                          │
│  JWT Authentication + bcrypt                                 │
│  WebSocket (GPS Tracking)                                    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     DATA LAYER                               │
│  Drizzle ORM + Zod Validation                               │
│  PostgreSQL (Neon Serverless)                               │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 Estrutura de Diretórios

```
astec/
├── client/                    # Frontend React
│   ├── src/
│   │   ├── components/        # Componentes reutilizáveis
│   │   ├── pages/             # Páginas da aplicação
│   │   ├── hooks/             # Custom hooks
│   │   ├── lib/               # Utilitários
│   │   └── contexts/          # Contextos React
├── server/                    # Backend Express
│   ├── services/              # Serviços (geocoding, routing, etc.)
│   ├── routes.ts              # Definição de rotas API
│   ├── storage.ts             # Camada de acesso a dados
│   ├── migrate.ts             # Sistema de migração automática
│   └── index.ts               # Entry point
├── shared/                    # Código compartilhado
│   └── schema.ts              # Schemas Drizzle + Zod
└── public/                    # Assets estáticos
```

### 2.3 Banco de Dados

**Provedor:** Neon Serverless PostgreSQL

**Tabelas Principais:**

| Tabela | Descrição |
|--------|-----------|
| `users` | Usuários do sistema (admin, assistente) |
| `technicians` | Dados dos técnicos (vinculado a users) |
| `clients` | Cadastro de clientes com endereços |
| `activities` | Atividades/visitas agendadas |
| `activity_types` | Tipos de atividade (11 tipos fixos) |
| `rats` | Relatórios de Assistência Técnica |
| `rat_components` | Componentes/produtos dos RATs |
| `technician_locations` | Histórico GPS dos técnicos |
| `approvals` | Sistema de aprovações |
| `time_entries` | Registro de horas trabalhadas |
| `notifications` | Notificações push |
| `business_types` | Tipos de negócio (classificação) |
| `regions` | Regiões (classificação) |

---

## 3. APIs e Serviços Externos

### 3.1 Resumo de Consumo

| Serviço | Tipo | Limite Gratuito | Uso Estimado Mensal | % Utilização |
|---------|------|-----------------|---------------------|--------------|
| **Mapbox Geocoding** | Geocodificação | 100.000 req/mês | ~2.000-3.000 | **2-3%** |
| **Mapbox Directions** | Cálculo de rotas | 100.000 req/mês | ~1.000-2.000 | **1-2%** |
| **OneSignal** | Push Notifications | 10.000 usuários | ~50 usuários | **<1%** |
| **Nominatim/OSM** | Geocoding (fallback) | Ilimitado* | Apenas fallback | **N/A** |
| **OSRM** | Rotas (fallback) | Ilimitado* | Apenas fallback | **N/A** |
| **ViaCEP** | Busca de CEP | Ilimitado | ~500-1.000 | **N/A** |
| **Neon PostgreSQL** | Banco de dados | 0.5 GB storage | ~100 MB | **20%** |

*Uso justo, sem limites oficiais mas sujeito a bloqueio por abuso

---

### 3.2 Mapbox (Geocodificação e Rotas)

**Site:** https://www.mapbox.com  
**Dashboard:** https://account.mapbox.com  
**Documentação:** https://docs.mapbox.com

#### Serviços Utilizados:

| Serviço | Endpoint | Uso no Sistema |
|---------|----------|----------------|
| Geocoding API | `api.mapbox.com/geocoding/v5/` | Converter endereços em coordenadas |
| Directions API | `api.mapbox.com/directions/v5/` | Calcular rotas entre pontos |

#### Limites do Plano Gratuito:

| Recurso | Limite Mensal |
|---------|---------------|
| Geocoding requests | 100.000 |
| Directions requests | 100.000 |
| Static Images | 50.000 |
| Map loads (web) | 50.000 |

#### Estimativa de Uso:

```
Cenário: 2.000 clientes, 50 técnicos, 20 dias úteis/mês

Geocodificação:
- Geocodificação inicial de clientes: ~2.000 (uma vez)
- Novos clientes/mês: ~50
- Validação de endereços: ~200
- Total estimado: ~2.250/mês → 2.25% do limite

Rotas:
- Rotas calculadas/dia: ~30
- Dias úteis: 20
- Total estimado: ~600/mês → 0.6% do limite
```

#### Monitoramento:
1. Acesse https://account.mapbox.com
2. Vá em "Statistics" no menu lateral
3. Visualize gráficos de uso por serviço

---

### 3.3 OneSignal (Notificações Push)

**Site:** https://onesignal.com  
**Dashboard:** https://dashboard.onesignal.com  
**Documentação:** https://documentation.onesignal.com

#### Funcionalidades Utilizadas:

| Funcionalidade | Uso no Sistema |
|----------------|----------------|
| Web Push | Notificações no navegador/PWA |
| Segments | Segmentação por usuário/técnico |
| Templates | Mensagens padronizadas |

#### Limites do Plano Gratuito:

| Recurso | Limite |
|---------|--------|
| Mobile Push subscribers | 10.000 |
| Web Push subscribers | Ilimitado |
| Email subscribers | 100 |
| In-App Messages | Ilimitado |

#### Tipos de Notificação:

1. **Nova atividade atribuída** - Técnico recebe quando admin agenda
2. **Lembrete de atividade** - 30 min antes da visita
3. **Aprovação pendente** - Admin notificado de solicitações
4. **Mensagem administrativa** - Comunicados gerais

#### Estimativa de Uso:

```
Cenário: 50 técnicos ativos

Subscribers: ~50 → 0.5% do limite mobile
Notificações/dia: ~100
Notificações/mês: ~2.000

Status: Muito abaixo dos limites
```

---

### 3.4 Nominatim / OpenStreetMap (Fallback Geocoding)

**Site:** https://nominatim.openstreetmap.org  
**Documentação:** https://nominatim.org/release-docs/latest/api/Overview/

#### Características:

| Aspecto | Detalhe |
|---------|---------|
| **Custo** | Gratuito |
| **Autenticação** | Não requer |
| **Rate Limit** | 1 requisição/segundo |
| **Dashboard** | Não possui |
| **Uso no Sistema** | Fallback quando Mapbox falha |

#### Política de Uso:
- Máximo 1 requisição por segundo (implementado no código)
- User-Agent obrigatório identificando a aplicação
- Uso abusivo pode resultar em bloqueio temporário (1-24h)

---

### 3.5 OSRM (Fallback Rotas)

**Site:** https://project-osrm.org  
**API Demo:** https://router.project-osrm.org  
**Documentação:** https://project-osrm.org/docs/v5.24.0/api/

#### Características:

| Aspecto | Detalhe |
|---------|---------|
| **Custo** | Gratuito (demo server) |
| **Autenticação** | Não requer |
| **Rate Limit** | Não documentado oficialmente |
| **Dashboard** | Não possui |
| **Uso no Sistema** | Fallback quando Mapbox Directions falha |

---

### 3.6 ViaCEP (Busca de CEP Brasileiro)

**Site:** https://viacep.com.br  
**Documentação:** https://viacep.com.br

#### Características:

| Aspecto | Detalhe |
|---------|---------|
| **Custo** | Gratuito |
| **Autenticação** | Não requer |
| **Rate Limit** | Não documentado |
| **Formato** | JSON, XML, JSONP |

#### Uso no Sistema:
- Auto-preenchimento de endereço ao digitar CEP
- Campos preenchidos: logradouro, bairro, cidade, estado

---

### 3.7 Neon PostgreSQL (Banco de Dados)

**Site:** https://neon.tech  
**Dashboard:** https://console.neon.tech  
**Documentação:** https://neon.tech/docs

#### Limites do Plano Gratuito:

| Recurso | Limite |
|---------|--------|
| Projects | 1 |
| Branches | 10 |
| Storage | 0.5 GB |
| Compute hours | 191.9 hrs/mês |
| Data transfer | 5 GB/mês |

#### Uso Atual Estimado:

```
Storage: ~100 MB → 20% do limite
Compute: ~50 hrs/mês → 26% do limite
Transfer: ~1 GB/mês → 20% do limite
```

---

## 4. Funcionalidades do Sistema

### 4.1 Módulos Principais

#### Dashboard (Admin)
- Visão geral de atividades do dia/semana/mês
- Gráficos de produtividade por técnico
- Indicadores de tempo (Efetivo, Adicional, Perda)

#### Agenda Global (Admin)
- Calendário mensal/semanal/diário
- Drag & drop para reagendar
- Filtros por técnico, tipo, status
- Criação rápida de atividades

#### Minha Agenda (Técnico)
- Visão semanal das atividades
- Check-in/Check-out com GPS
- Navegação integrada (Google Maps, Waze, Apple Maps)
- Ajuste manual de horários

#### Clientes
- CRUD completo de clientes
- Importação via Excel
- Geocodificação automática de endereços
- Segmentação por tipo de negócio e região

#### Mapa e Rotas
- Visualização de técnicos em tempo real
- Clusters de clientes no mapa
- Calculadora de rotas otimizadas
- Busca de técnicos próximos

#### RAT (Relatório de Assistência Técnica)
- Formulário digital em 7 abas
- Registro de produtos e componentes
- Relatório fotográfico (6 seções)
- Assinatura digital
- Compartilhamento via WhatsApp/Email

#### Relatórios
- Breakdown por categoria de tempo
- Filtros por técnico/período
- Exportação Excel
- Gráficos visuais (Recharts)

#### Configurações (Admin)
- Gestão de usuários e técnicos
- Tipos de atividade
- Classificações (negócios e regiões)

---

## 5. Fluxos de Status

### 5.1 Status de Atividades

```
┌──────────┐     ┌──────────┐     ┌────────────┐     ┌───────────┐
│ Planejado│────▶│ A Caminho│────▶│ Em Execução│────▶│ Concluído │
└──────────┘     └──────────┘     └────────────┘     └───────────┘
      │                                                     │
      │              ┌───────────┐                          │
      └─────────────▶│ Cancelado │◀─────────────────────────┘
                     └───────────┘
```

### 5.2 Status de RAT

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌─────────┐
│ Pendente │────▶│ Rascunho │────▶│ Completa │────▶│ Enviada │
│ (amarelo)│     │ (laranja)│     │  (azul)  │     │ (verde) │
└──────────┘     └──────────┘     └──────────┘     └─────────┘
```

---

## 6. Segurança

### 6.1 Autenticação
- JWT (JSON Web Tokens) com expiração configurável
- Senhas hasheadas com bcrypt (salt rounds: 10)
- Sessões persistentes com cookies seguros

### 6.2 Autorização
- RBAC simplificado (admin, assistente)
- Middleware de verificação em rotas protegidas
- Isolamento de dados por técnico

### 6.3 Dados Sensíveis
- Variáveis de ambiente para secrets
- Não exposição de credenciais no frontend
- HTTPS obrigatório em produção

---

## 7. Considerações de Escalabilidade

### 7.1 Limites Atuais

| Recurso | Limite Estimado | Ação Necessária |
|---------|-----------------|-----------------|
| Usuários | ~100 | Upgrade Neon |
| Clientes | ~10.000 | Paginação já implementada |
| Atividades/mês | ~5.000 | Arquivamento histórico |
| GPS tracks/dia | ~50.000 | Cleanup automático |

### 7.2 Otimizações Implementadas

1. **Paginação** em listagens de clientes e atividades
2. **Índices** em colunas frequentemente consultadas
3. **Cache** de queries com TanStack Query
4. **Batch processing** para geocodificação em massa
5. **WebSocket** para atualizações em tempo real (evita polling)

---

## 8. Manutenção e Monitoramento

### 8.1 Dashboards de APIs

| Serviço | URL do Dashboard |
|---------|------------------|
| Mapbox | https://account.mapbox.com |
| OneSignal | https://dashboard.onesignal.com |
| Neon | https://console.neon.tech |
| Replit | https://replit.com (logs do servidor) |

### 8.2 Logs do Sistema

- Logs de geocodificação: `[Geocode]`, `[Mapbox]`, `[Nominatim]`
- Logs de rotas: `[Route]`
- Logs de WebSocket: `[WebSocket]`
- Logs de migração: `🔄`, `✅`, `❌`

### 8.3 Alertas Recomendados

1. **Mapbox** > 80% do limite mensal
2. **Neon** storage > 400 MB
3. **Erros 5xx** > 10/hora
4. **Tempo de resposta** > 5 segundos

---

## 9. Contatos e Suporte

### 9.1 APIs Externas

| Serviço | Suporte |
|---------|---------|
| Mapbox | support@mapbox.com |
| OneSignal | support@onesignal.com |
| Neon | support@neon.tech |

### 9.2 Documentação Adicional

- [Mapbox Geocoding API](https://docs.mapbox.com/api/search/geocoding/)
- [Mapbox Directions API](https://docs.mapbox.com/api/navigation/directions/)
- [OneSignal Web Push](https://documentation.onesignal.com/docs/web-push-overview)
- [Neon PostgreSQL](https://neon.tech/docs/introduction)
- [Drizzle ORM](https://orm.drizzle.team/docs/overview)

---

## 10. Histórico de Versões

| Versão | Data | Alterações |
|--------|------|------------|
| 1.0.0 | Dez/2025 | Versão inicial com todos os módulos |

---

*Documento gerado automaticamente pelo sistema ASTEC*
