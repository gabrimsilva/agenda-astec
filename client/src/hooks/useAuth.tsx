import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface User {
  id: string;
  username?: string; // Optional - legacy field
  email: string;
  name: string;
  role: "admin" | "assistente";
  avatarUrl?: string | null;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  loginDatasul: (username: string, password: string, host: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const storedToken = localStorage.getItem("astec_token");
    if (storedToken) {
      setToken(storedToken);
      fetchCurrentUser(storedToken);
    } else {
      setIsLoading(false);
    }
  }, []);

  const fetchCurrentUser = async (authToken: string) => {
    try {
      const response = await fetch("/api/auth/me", {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      if (response.ok) {
        const userData = await response.json();
        setUser(userData);
      } else {
        localStorage.removeItem("astec_token");
        setToken(null);
      }
    } catch (error) {
      console.error("Failed to fetch user:", error);
      localStorage.removeItem("astec_token");
      setToken(null);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (email: string, password: string) => {
    console.log("[useAuth] Login attempt:", email);
    const response = await apiRequest("POST", "/api/auth/login", { email, password });
    console.log("[useAuth] Login response status:", response.status);
    const data = await response.json();
    console.log("[useAuth] Login data:", { user: data.user, hasToken: !!data.token });
    
    if (!data.user || !data.token) {
      throw new Error("Invalid response from server");
    }
    
    setUser(data.user);
    setToken(data.token);
    localStorage.setItem("astec_token", data.token);
    console.log("[useAuth] Login successful, user and token set");
  };

  const loginDatasul = async (username: string, password: string, host: string) => {
    const response = await apiRequest("POST", "/api/auth/datasul-login", { username, password, host });
    const data = await response.json();
    if (!data.user || !data.token) {
      throw new Error("Resposta inválida do servidor");
    }
    setUser(data.user);
    setToken(data.token);
    localStorage.setItem("astec_token", data.token);
    // Guarda o token Datasul na sessão (usado p/ buscar clientes no agendamento).
    if (data.datasulToken) {
      sessionStorage.setItem("astec_datasul_token", data.datasulToken);
      sessionStorage.setItem("astec_datasul_host", data.datasulHost || host);
    }
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem("astec_token");
    sessionStorage.removeItem("astec_datasul_token");
    sessionStorage.removeItem("astec_datasul_host");
    queryClient.clear();
  };

  const refreshUser = async () => {
    const storedToken = localStorage.getItem("astec_token");
    if (storedToken) {
      await fetchCurrentUser(storedToken);
    }
  };

  return (
    <AuthContext.Provider value={{ user, token, login, loginDatasul, logout, refreshUser, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
