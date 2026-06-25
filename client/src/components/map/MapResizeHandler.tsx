import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";

interface MapResizeHandlerProps {
  trigger?: any;
}

export function MapResizeHandler({ trigger }: MapResizeHandlerProps) {
  const map = useMap();
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  useEffect(() => {
    // Invalidar tamanho com múltiplos delays para pegar toda a animação
    const timers: NodeJS.Timeout[] = [];
    
    [0, 50, 150, 300, 500].forEach((delay) => {
      timers.push(setTimeout(() => {
        map.invalidateSize();
      }, delay));
    });

    return () => {
      timers.forEach(timer => clearTimeout(timer));
    };
  }, [trigger, map]);

  useEffect(() => {
    // ResizeObserver para detectar mudanças de tamanho no container
    const container = map.getContainer();
    
    resizeObserverRef.current = new ResizeObserver(() => {
      map.invalidateSize();
    });
    
    if (container) {
      resizeObserverRef.current.observe(container);
    }

    return () => {
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
      }
    };
  }, [map]);

  return null;
}
