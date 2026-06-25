import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { useLocation } from "wouter";

interface PageTitleContextType {
  title: string;
  subtitle?: string;
  setPageTitle: (title: string, subtitle?: string) => void;
}

const PageTitleContext = createContext<PageTitleContextType>({
  title: "",
  subtitle: undefined,
  setPageTitle: () => {},
});

const pageTitles: Record<string, { title: string; subtitle?: string }> = {
  "/relatorios": { title: "Relatórios" },
  "/minha-agenda": { title: "Minha Agenda" },
  "/calendario": { title: "Calendário" },
  "/agenda": { title: "Agenda" },
  "/aprovacoes": { title: "Aprovações" },
  "/matriz-mensal": { title: "Matriz Mensal" },
  "/rotas": { title: "Mapa & Rotas" },
  "/clientes": { title: "Clientes" },
  "/perfil": { title: "Perfil" },
  "/configuracoes": { title: "Configurações" },
  "/teste-gps": { title: "Teste GPS" },
  "/checkin": { title: "Check-in" },
  "/gerar-icones": { title: "Gerar Ícones" },
  "/tecnicos": { title: "Técnicos" },
};

export function PageTitleProvider({ children }: { children: ReactNode }) {
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState<string | undefined>();
  const [location] = useLocation();

  useEffect(() => {
    const pageInfo = pageTitles[location];
    if (pageInfo) {
      setTitle(pageInfo.title);
      setSubtitle(pageInfo.subtitle);
    }
  }, [location]);

  const setPageTitle = (newTitle: string, newSubtitle?: string) => {
    setTitle(newTitle);
    setSubtitle(newSubtitle);
  };

  return (
    <PageTitleContext.Provider value={{ title, subtitle, setPageTitle }}>
      {children}
    </PageTitleContext.Provider>
  );
}

export function usePageTitle() {
  return useContext(PageTitleContext);
}
