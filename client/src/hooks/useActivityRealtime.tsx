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
    });

    socket.on("activity_update", (data: { activity: any; action: "created" | "updated" | "deleted" }) => {
      console.log("[ActivityRealtime] Received activity update:", data.action, data.activity?.id);
      
      // Invalidate and immediately refetch to ensure fresh data
      // Note: Pass empty queryKey to invalidate all /api/activities variants
      queryClient.invalidateQueries({ queryKey: ["/api/activities"] });
      queryClient.refetchQueries({ queryKey: ["/api/activities"] });
    });

    socket.on("disconnect", (reason) => {
      console.log("[ActivityRealtime] Disconnected:", reason);
    });

    socket.on("error", (error) => {
      console.error("[ActivityRealtime] Socket error:", error);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [user, token]);
}
