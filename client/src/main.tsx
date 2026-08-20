import { createRoot } from "react-dom/client";
import "@fontsource-variable/geist";
import App from "./App";
import "./index.css";
import { queryClient } from "./lib/queryClient";

const APP_VERSION_KEY = 'astec_build_id';

async function checkForNewVersion(): Promise<boolean> {
  try {
    const response = await fetch('/api/version');
    if (!response.ok) return false;
    const { buildId } = await response.json();
    const storedBuildId = localStorage.getItem(APP_VERSION_KEY);
    
    if (storedBuildId && storedBuildId !== buildId) {
      console.log('[PWA] Novo deploy detectado:', buildId, '(anterior:', storedBuildId, ')');
      
      if ('caches' in window) {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map(name => caches.delete(name)));
      }

      localStorage.setItem(APP_VERSION_KEY, buildId);
      window.location.reload();
      return true;
    }
    
    if (!storedBuildId) {
      localStorage.setItem(APP_VERSION_KEY, buildId);
    }
  } catch (e) {
  }
  return false;
}

async function initApp() {
  const reloading = await checkForNewVersion();
  if (reloading) return;

  if ('serviceWorker' in navigator) {
    // TEMPORARIAMENTE DESABILITADO - Forçar unregister para limpar cache
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      registrations.forEach((registration) => {
        console.log('[PWA] Unregistering service worker');
        registration.unregister();
      });
    });
    if ('caches' in window) {
      caches.keys().then((names) => {
        names.forEach((name) => {
          console.log('[PWA] Deleting cache:', name);
          caches.delete(name);
        });
      });
    }
  }

  createRoot(document.getElementById("root")!).render(<App />);
}

initApp();
