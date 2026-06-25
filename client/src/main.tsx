import { createRoot } from "react-dom/client";
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
    if (import.meta.env.PROD) {
      window.addEventListener('load', () => {
        navigator.serviceWorker
          .register('/sw.js')
          .then((registration) => {
            console.log('[PWA] Service Worker registrado com sucesso:', registration.scope);
            
            registration.addEventListener('updatefound', () => {
              const newWorker = registration.installing;
              if (newWorker) {
                newWorker.addEventListener('statechange', () => {
                  if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                    console.log('[PWA] Nova versão do SW disponível. Atualizando...');
                    newWorker.postMessage({ type: 'SKIP_WAITING' });
                  }
                });
              }
            });

            setInterval(() => {
              registration.update();
              checkForNewVersion();
            }, 2 * 60 * 1000);
          })
          .catch((error) => {
            console.error('[PWA] Erro ao registrar Service Worker:', error);
          });
      });

      let refreshing = false;

      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'CACHE_CLEARED') {
          console.log('[PWA] Service Worker limpou caches. Recarregando...');
          if (!refreshing) {
            refreshing = true;
            window.location.reload();
          }
        }
      });

      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!refreshing) {
          refreshing = true;
          window.location.reload();
        }
      });
    } else {
      // DEV: não usar service worker/cache para evitar servir versões antigas durante o desenvolvimento
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        registrations.forEach((registration) => registration.unregister());
      });
      if ('caches' in window) {
        caches.keys().then((names) => names.forEach((name) => caches.delete(name)));
      }
    }
  }

  createRoot(document.getElementById("root")!).render(<App />);
}

initApp();
