// src/hooks/useDebouncedCallback.ts
// ✅ MÓDULO 18.2: Hook para debounce de funciones callback

import { useRef, useCallback, useEffect, useState } from 'react';

/**
 * Hook que retorna una versión debounced de un callback
 * Útil para evitar llamadas excesivas a APIs
 * 
 * @param callback - Función a ejecutar
 * @param delay - Tiempo de espera en ms (default 300)
 * @returns Función debounced
 */
export function useDebouncedCallback<T extends (...args: any[]) => any>(
  callback: T,
  delay: number = 300
): (...args: Parameters<T>) => void {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const callbackRef = useRef(callback);

  // Mantener referencia actualizada del callback
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  // Limpiar timeout al desmontar
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return useCallback((...args: Parameters<T>) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      callbackRef.current(...args);
    }, delay);
  }, [delay]);
}

/**
 * Hook que retorna el valor debounced de un estado
 * 
 * @param value - Valor a debounce
 * @param delay - Tiempo de espera en ms (default 300)
 * @returns Valor debounced
 */
export function useDebounce<T>(value: T, delay: number = 300): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}
