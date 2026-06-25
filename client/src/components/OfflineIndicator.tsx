import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { WifiOff, Wifi } from "lucide-react";

export function OfflineIndicator() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showIndicator, setShowIndicator] = useState(false);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setShowIndicator(true);
      setTimeout(() => setShowIndicator(false), 3000);
    };

    const handleOffline = () => {
      setIsOnline(false);
      setShowIndicator(true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    if (!isOnline) {
      setShowIndicator(true);
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [isOnline]);

  if (!showIndicator) {
    return null;
  }

  return (
    <div className="fixed top-20 md:top-4 right-4 z-50 animate-in slide-in-from-top-5">
      <Badge
        variant={isOnline ? "default" : "destructive"}
        className="gap-2 shadow-lg"
        data-testid="badge-connection-status"
      >
        {isOnline ? (
          <>
            <Wifi className="w-3 h-3" />
            Conectado
          </>
        ) : (
          <>
            <WifiOff className="w-3 h-3" />
            Modo Offline
          </>
        )}
      </Badge>
    </div>
  );
}
