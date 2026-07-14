# 🎨 Integração MFA - Frontend (React)

## 📁 Arquivos Criados

```
client/src/
├── pages/
│   ├── LoginPage.tsx           ← Tela de login com MFA
│   └── MFASetupPage.tsx        ← Tela de setup/confirmação MFA
├── components/
│   └── MFASettingsModal.tsx    ← Modal de configurações de MFA
└── App.tsx                     ← Atualizar rotas

FRONTEND_MFA_INTEGRATION.md    ← Este arquivo
```

---

## 🔧 Como Integrar

### Passo 1: Adicionar Rotas no `App.tsx`

```tsx
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import LoginPage from "./pages/LoginPage";
import MFASetupPage from "./pages/MFASetupPage";
import Dashboard from "./pages/Dashboard";
import ProtectedRoute from "./components/ProtectedRoute";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/mfa-setup" element={<MFASetupPage />} />
        
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        
        <Route path="/" element={<Navigate to="/dashboard" />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
```

### Passo 2: Criar Componente `ProtectedRoute`

```tsx
// client/src/components/ProtectedRoute.tsx
import { Navigate } from "react-router-dom";

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem("token");

  if (!token) {
    return <Navigate to="/login" />;
  }

  return <>{children}</>;
}
```

### Passo 3: Atualizar Componente de Perfil/Settings

```tsx
// client/src/components/ProfileMenu.tsx
import { useState } from "react";
import MFASettingsModal from "./MFASettingsModal";

export default function ProfileMenu() {
  const [showMFAModal, setShowMFAModal] = useState(false);
  const token = localStorage.getItem("token");

  return (
    <>
      <button
        onClick={() => setShowMFAModal(true)}
        className="flex items-center gap-2 px-3 py-2 hover:bg-gray-100 rounded"
      >
        🔐 Segurança
      </button>

      <MFASettingsModal
        isOpen={showMFAModal}
        onClose={() => setShowMFAModal(false)}
        token={token || ""}
      />
    </>
  );
}
```

---

## 🎯 Fluxo de Autenticação Frontend

### Primeira Vez (Sem MFA)

```
1. Usuário acessa /login
   ↓
2. Digita email e senha
   ↓
3. POST /api/auth/login
   ↓
4. Servidor retorna token (sem MFA)
   ↓
5. localStorage.setItem("token", ...)
   ↓
6. navigate("/dashboard")
   ↓
7. ✅ Acesso liberado
```

### Usuário com MFA Já Ativado

```
1. Usuário acessa /login
   ↓
2. Digita email e senha
   ↓
3. POST /api/auth/login
   ↓
4. Servidor retorna mfaRequired: true
   ↓
5. Mostrar tela de TOTP
   ↓
6. Usuário digita código do Authenticator
   ↓
7. POST /api/auth/verify-mfa
   ↓
8. Servidor retorna token (MFA validado)
   ↓
9. localStorage.setItem("token", ...)
   ↓
10. navigate("/dashboard")
    ↓
11. ✅ Acesso liberado
```

### Setup de MFA (Primeira Vez)

```
1. Usuário autenticado acessa /mfa-setup
   ↓
2. POST /api/auth/mfa/setup
   ↓
3. Servidor retorna QR code + secret
   ↓
4. Mostrar QR code na tela
   ↓
5. Usuário escaneia com Authenticator
   ↓
6. Digita código TOTP
   ↓
7. POST /api/auth/mfa/confirm
   ↓
8. Servidor salva secret no banco
   ↓
9. Mostrar tela de sucesso
   ↓
10. navigate("/dashboard")
    ↓
11. ✅ MFA ativado
```

---

## 📱 Interface de Login

### Desktop
```
┌─────────────────────────────┐
│       ASTEC - Login         │
├─────────────────────────────┤
│ Email:                      │
│ [________________________]  │
│                             │
│ Senha:                      │
│ [________________________]  │
│ [Mostrar/Ocultar]          │
│                             │
│ [   Entrar    ]             │
│                             │
│ ─────────── ou ────────────│
│                             │
│ [🔵 Entrar com Microsoft]  │
│                             │
│ Primeira vez?              │
│ Contate o administrador    │
└─────────────────────────────┘
```

### Tela de MFA
```
┌─────────────────────────────┐
│   Verificação 2FA           │
├─────────────────────────────┤
│ Digite o código do seu      │
│ Microsoft Authenticator     │
│                             │
│ Código TOTP:                │
│ [1][2][3][4][5][6]         │
│                             │
│ O código muda a cada 30s   │
│                             │
│ [  Verificar  ]             │
│                             │
│ Usar código de backup?      │
│                             │
│ ← Voltar                    │
└─────────────────────────────┘
```

### Setup MFA - QR Code
```
┌─────────────────────────────┐
│ Passo 1: Escaneie QR Code   │
├─────────────────────────────┤
│ Use Microsoft Authenticator │
│ para escanear              │
│                             │
│    ┌─────────────┐          │
│    │             │          │
│    │  [QR CODE]  │          │
│    │             │          │
│    └─────────────┘          │
│                             │
│ Secret Manual:              │
│ JBSWY3DPEBLW...  [Copy]    │
│                             │
│ Códigos de Backup:          │
│ ABC12345  XYZ98765         │
│ DEF67890  UVW54321         │
│ ...                         │
│                             │
│ [Próximo: Verificar Código] │
└─────────────────────────────┘
```

### Setup MFA - Confirmação
```
┌─────────────────────────────┐
│ Passo 2: Verifique Código   │
├─────────────────────────────┤
│ Digite o código que aparece │
│ no seu Authenticator        │
│                             │
│ Código TOTP:                │
│ [1][2][3][4][5][6]         │
│                             │
│ [Confirmar e Ativar]        │
│                             │
│ ← Voltar                    │
└─────────────────────────────┘
```

### Setup MFA - Sucesso
```
┌─────────────────────────────┐
│         ✅ Sucesso!         │
├─────────────────────────────┤
│ MFA Ativado com Sucesso!    │
│                             │
│ Sua conta agora está        │
│ protegida                   │
│                             │
│ ✨ Dicas de Segurança:     │
│ ✓ Mantenha Authenticator   │
│   sincronizado             │
│ ✓ Guarde backup codes      │
│ ✓ Habilite notificações    │
│                             │
│ [Ir para Dashboard]         │
└─────────────────────────────┘
```

---

## 🎨 Componentes React Criados

### 1. LoginPage.tsx
**Props:** Nenhuma
**State:**
- `step`: "credentials" | "mfa"
- `email`, `password`: string
- `userId`, `totpCode`: string
- `loading`, `error`: boolean | string

**Features:**
- ✅ Input de email/senha
- ✅ Toggle mostrar/ocultar senha
- ✅ Tela de TOTP
- ✅ Suporte a Microsoft OAuth
- ✅ Erros amigáveis

### 2. MFASetupPage.tsx
**Props:** Nenhuma (usa localStorage para token)
**State:**
- `step`: "loading" | "qrcode" | "confirm" | "success"
- `qrCode`, `secret`: string
- `backupCodes`: string[]
- `totpCode`: string

**Features:**
- ✅ Geração de QR code
- ✅ Secret manual (copy)
- ✅ Lista de backup codes
- ✅ Confirmação TOTP
- ✅ Tela de sucesso

### 3. MFASettingsModal.tsx
**Props:**
- `isOpen`: boolean
- `onClose`: () => void
- `token`: string

**State:**
- `step`: "status" | "disable"
- `mfaStatus`: {enabled, hasSecret, backupCodesCount}
- `password`: string

**Features:**
- ✅ Mostra status MFA
- ✅ Contador de backup codes
- ✅ Opção de desabilitar MFA
- ✅ Confirmação de senha

---

## 🔌 Integração com Componentes Existentes

### Adicionar em Navbar

```tsx
// client/src/components/Navbar.tsx
import ProfileMenu from "./ProfileMenu";

export default function Navbar() {
  return (
    <nav className="bg-white shadow">
      <div className="flex justify-between items-center p-4">
        <h1 className="text-xl font-bold">ASTEC</h1>
        <ProfileMenu /> {/* Adicionar aqui */}
      </div>
    </nav>
  );
}
```

### Adicionar em Settings/Preferences

```tsx
// client/src/pages/SettingsPage.tsx
import MFASettingsModal from "../components/MFASettingsModal";
import { useState } from "react";

export default function SettingsPage() {
  const [showMFAModal, setShowMFAModal] = useState(false);
  const token = localStorage.getItem("token") || "";

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-bold mb-4">Segurança</h2>
        
        <button
          onClick={() => setShowMFAModal(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          🔐 Gerenciar Autenticação de Dois Fatores
        </button>

        <MFASettingsModal
          isOpen={showMFAModal}
          onClose={() => setShowMFAModal(false)}
          token={token}
        />
      </div>
    </div>
  );
}
```

---

## 🧪 Testar Componentes

### Com Vite + React Testing Library

```bash
npm install --save-dev @testing-library/react @testing-library/jest-dom
```

### Teste Exemplo

```tsx
// client/src/pages/LoginPage.test.tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LoginPage from "./LoginPage";

describe("LoginPage", () => {
  test("renderiza form de login", () => {
    render(<LoginPage />);
    expect(screen.getByPlaceholderText("seu@email.com")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("••••••••")).toBeInTheDocument();
  });

  test("muda para tela de MFA quando mfaRequired", async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    // ... simular login
  });
});
```

---

## 📦 Dependências Necessárias

```json
{
  "dependencies": {
    "react": "^18.2.0",
    "react-router-dom": "^6.0.0",
    "lucide-react": "^0.260.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "@testing-library/react": "^14.0.0"
  }
}
```

---

## 🚀 Checklist de Integração Frontend

- [ ] Copiar componentes React para `client/src/`
- [ ] Adicionar rotas no `App.tsx`
- [ ] Criar `ProtectedRoute`
- [ ] Integrar `MFASettingsModal` no menu de perfil
- [ ] Testar fluxo de login sem MFA
- [ ] Testar fluxo de setup MFA
- [ ] Testar fluxo de login com MFA
- [ ] Testar Microsoft OAuth redirect
- [ ] Validar responsividade (mobile)
- [ ] Testar com Postman + Frontend em paralelo

---

## 💡 Customizações Recomendadas

### 1. Logo da Empresa
Substituir "ASTEC" por logo real:
```tsx
<img src="/logo.svg" alt="ASTEC" className="h-8" />
```

### 2. Cores da Empresa
```tsx
// client/src/config/theme.ts
export const theme = {
  primary: "#0066CC",  // Azul
  success: "#10B981",  // Verde
  danger: "#EF4444",   // Vermelho
};
```

### 3. Mensagens Personalizadas
```tsx
// client/src/config/messages.ts
export const messages = {
  mfa_setup_success: "MFA ativado! Sua conta está mais segura agora.",
  mfa_disabled: "MFA foi desativado. Configure novamente quando puder.",
};
```

### 4. Suporte Multilíngue
```tsx
// client/src/i18n/pt.json
{
  "login": {
    "title": "Fazer Login",
    "email_placeholder": "seu@email.com",
    "password_placeholder": "••••••••"
  }
}
```

---

## 🆘 Troubleshooting Frontend

### Erro: "Cannot find module 'lucide-react'"
```bash
npm install lucide-react
```

### Erro: "Token undefined" após login
```tsx
// Verificar localStorage
console.log(localStorage.getItem("token"));
```

### TOTP não aparece no Authenticator
- Verificar se QR code foi escaneado corretamente
- Usar secret manual se QR não funcionar
- Sincronizar relógio do celular

### Redirect ineficaz após login
```tsx
// Usar useEffect para redirecionar
useEffect(() => {
  if (token) {
    navigate("/dashboard");
  }
}, [token, navigate]);
```

---

## 📊 Próximos Passos

1. **[ ] Deploy frontend** com componentes MFA
2. **[ ] Integração com backend** em produção
3. **[ ] Testes E2E** com Cypress/Playwright
4. **[ ] Monitoramento** de logins/falhas MFA
5. **[ ] Documentação para usuários** (como usar Authenticator)
6. **[ ] Treinamento dos 12 colaboradores**

---

**Status:** ✅ Componentes React criados e prontos para integração
**Próximo:** Rodar `npm install` e testar localmente
