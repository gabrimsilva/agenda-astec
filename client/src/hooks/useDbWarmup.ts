import { useEffect } from "react";

const WARMUP_INTERVAL_MS = 4 * 60 * 1000; // 4 minutes

async function pingDb() {
  try {
    await fetch("/api/warmup");
  } catch {
    // silent — warmup is best-effort
  }
}

export function useDbWarmup() {
  useEffect(() => {
    pingDb(); // immediate on mount
    const id = setInterval(pingDb, WARMUP_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);
}
