import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import rennerLogo from "@assets/image_1762949934371.png";

export function SplashScreen() {
  // Verifica se já foi mostrado
  const shouldShow = !sessionStorage.getItem("splashShown");
  
  const [mounted, setMounted] = useState(shouldShow);
  const [visible, setVisible] = useState(shouldShow);
  const { isLoading } = useAuth();

  useEffect(() => {
    // Se não deve mostrar, não faz nada
    if (!shouldShow) return;

    // Aguarda o auth carregar
    if (!isLoading) {
      // Inicia fade out mudando visible para false
      const fadeTimer = setTimeout(() => {
        setVisible(false);
      }, 800);

      // Depois da transição (500ms), desmonta o componente
      const unmountTimer = setTimeout(() => {
        setMounted(false);
        sessionStorage.setItem("splashShown", "true");
      }, 800 + 500); // delay + transition duration

      return () => {
        clearTimeout(fadeTimer);
        clearTimeout(unmountTimer);
      };
    }
  }, [isLoading, shouldShow]);

  if (!mounted) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black"
      style={{
        opacity: visible ? 1 : 0,
        transition: "opacity 0.5s ease-out",
        pointerEvents: visible ? "auto" : "none",
      }}
    >
      <img
        src={rennerLogo}
        alt="Renner Logo"
        className="w-64 h-auto"
        style={{
          borderRadius: "16px",
        }}
        data-testid="splash-logo"
      />
    </div>
  );
}
