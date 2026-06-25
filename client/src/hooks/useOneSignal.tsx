import { createContext, useContext, useEffect, useState } from "react";
import OneSignal from "react-onesignal";
import { useAuth } from "./useAuth";
import { apiRequest } from "@/lib/queryClient";

interface OneSignalContextType {
  isInitialized: boolean;
  isSubscribed: boolean;
  playerId: string | null;
  requestPermission: () => Promise<void>;
}

const OneSignalContext = createContext<OneSignalContextType | undefined>(undefined);

export function OneSignalProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [isInitialized, setIsInitialized] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [playerId, setPlayerId] = useState<string | null>(null);

  useEffect(() => {
    const appId = import.meta.env.VITE_ONESIGNAL_APP_ID;
    
    if (!appId) {
      console.warn("OneSignal App ID not configured");
      return;
    }

    const initOneSignal = async () => {
      try {
        await OneSignal.init({
          appId: appId,
          allowLocalhostAsSecureOrigin: true,
        });

        setIsInitialized(true);

        const isPushSupported = OneSignal.Notifications.isPushSupported();
        if (!isPushSupported) {
          console.warn("Push notifications not supported on this browser");
          return;
        }

        const permission = OneSignal.Notifications.permissionNative;
        setIsSubscribed(permission === "granted");

        const osPlayerId = OneSignal.User.onesignalId;
        
        if (osPlayerId) {
          setPlayerId(osPlayerId);
        }
      } catch (error) {
        console.error("OneSignal initialization error:", error);
      }
    };

    initOneSignal();
  }, []);

  useEffect(() => {
    if (!isInitialized) {
      return;
    }

    if (!user?.id) {
      OneSignal.logout();
      setIsSubscribed(false);
      setPlayerId(null);
      return;
    }

    OneSignal.login(user.id.toString());

    const handlePushChange = async (event: any) => {
      const subscription = event.current;
      const newPlayerId = subscription.id;
      
      if (newPlayerId) {
        setPlayerId(newPlayerId);
        setIsSubscribed(true);

        try {
          await apiRequest("POST", "/api/notifications/subscribe", {
            playerId: newPlayerId,
            deviceType: "web",
          });
        } catch (error) {
          console.error("Failed to save push subscription:", error);
        }
      } else {
        setIsSubscribed(false);
        setPlayerId(null);
      }
    };

    OneSignal.User.PushSubscription.addEventListener("change", handlePushChange);

    const currentPlayerId = OneSignal.User.onesignalId;
    if (currentPlayerId) {
      setPlayerId(currentPlayerId);
      apiRequest("POST", "/api/notifications/subscribe", {
        playerId: currentPlayerId,
        deviceType: "web",
      }).catch((error) => {
        console.error("Failed to sync push subscription:", error);
      });
    }

    return () => {
      OneSignal.User.PushSubscription.removeEventListener("change", handlePushChange);
    };
  }, [isInitialized, user?.id]);

  const requestPermission = async () => {
    if (!isInitialized) {
      throw new Error("OneSignal not initialized");
    }

    try {
      const permission = await OneSignal.Notifications.requestPermission();
      if (permission) {
        setIsSubscribed(true);
      }
    } catch (error) {
      console.error("Failed to request permission:", error);
      throw error;
    }
  };

  return (
    <OneSignalContext.Provider
      value={{
        isInitialized,
        isSubscribed,
        playerId,
        requestPermission,
      }}
    >
      {children}
    </OneSignalContext.Provider>
  );
}

export function useOneSignal() {
  const context = useContext(OneSignalContext);
  if (context === undefined) {
    throw new Error("useOneSignal must be used within OneSignalProvider");
  }
  return context;
}
