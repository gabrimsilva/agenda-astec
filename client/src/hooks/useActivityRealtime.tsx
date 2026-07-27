import { useEffect, useRef } from "react";
import { useAuth } from "./useAuth";
import { queryClient } from "@/lib/queryClient";
import { io, Socket } from "socket.io-client";

export function useActivityRealtime() {
  const { user, token } = useAuth();
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!user || !token) return;

    const socket = io({
      path: "/socket.io",
      auth: { token },
      transports: ["websocket", "polling"],
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      console.log("[ActivityRealtime] Connected to server");
      
      // Force refetch on reconnect to ensure fresh data
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const queryKey = query.queryKey;
          return Array.isArray(queryKey) && queryKey[0] === "/api/activities";
        }
      });
    });

    socket.on("activity_update", (data: { activity: any; action: "created" | "updated" | "deleted" }) => {
      console.log("[ActivityRealtime] Received activity update:", data.action, data.activity?.id);
      
      // Invalidate ALL activity-related queries to force fresh data
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const queryKey = query.queryKey;
          return (
            (Array.isArray(queryKey) && queryKey[0] === "/api/activities") ||
            (Array.isArray(queryKey) && queryKey[0] === "/api/activity-day-statuses/all")
          );
        }
      });
      
      // Force immediate refetch of all matching queries
      queryClient.refetchQueries({ 
        predicate: (query) => {
          const queryKey = query.queryKey;
          return (
            (Array.isArray(queryKey) && queryKey[0] === "/api/activities") ||
            (Array.isArray(queryKey) && queryKey[0] === "/api/activity-day-statuses/all")
          );
        },
        type: "all"
      });
    });

    socket.on("disconnect", (reason) => {
      console.log("[ActivityRealtime] Disconnected:", reason);
    });

    socket.on("error", (error) => {
      console.error("[ActivityRealtime] Socket error:", error);
    });

    // Refetch when window regains focus (user switches back to tab)
    const handleFocus = () => {
      console.log("[ActivityRealtime] Window focused, refreshing data...");
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const queryKey = query.queryKey;
          return Array.isArray(queryKey) && queryKey[0] === "/api/activities";
        }
      });
      queryClient.refetchQueries({ 
        predicate: (query) => {
          const queryKey = query.queryKey;
          return Array.isArray(queryKey) && queryKey[0] === "/api/activities";
        },
        type: "all"
      });
    };
    
    window.addEventListener("focus", handleFocus);

    return () => {
      window.removeEventListener("focus", handleFocus);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [user, token]);
}
