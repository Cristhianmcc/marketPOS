// src/hooks/usePosHotkeys.ts
// ✅ MÓDULO 17.3: Atajos de teclado para POS (solo desktop >= 1024px)
'use client';

import { useEffect, useRef } from 'react';

interface UsePosHotkeysOptions {
  onFocusSearch?: () => void;
  onFinalizeSale?: () => void;
  onClearCart?: () => void;
  onAddQuickSell?: (index: number) => void;
  onEscape?: () => void;
  enabled?: boolean;
}

export function usePosHotkeys({
  onFocusSearch,
  onFinalizeSale,
  onClearCart,
  onAddQuickSell,
  onEscape,
  enabled = true,
}: UsePosHotkeysOptions) {
  const enabledRef = useRef(enabled);

  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  useEffect(() => {
    // Solo habilitar en desktop (>= 1024px)
    const isDesktop = () => window.innerWidth >= 1024;

    // Verificar si el usuario está escribiendo en un input/textarea
    const isTyping = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const tagName = target.tagName.toLowerCase();
      return (
        tagName === 'input' ||
        tagName === 'textarea' ||
        target.contentEditable === 'true'
      );
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      // No procesar si está deshabilitado o no es desktop
      if (!enabledRef.current || !isDesktop()) {
        return;
      }

      try {
        // F2 → Foco al buscador
        if (e.key === 'F2') {
          e.preventDefault();
          onFocusSearch?.();
          return;
        }

        // Esc → Cerrar modales/drawer
        if (e.key === 'Escape') {
          e.preventDefault();
          onEscape?.();
          return;
        }

        // No procesar otros atajos si está escribiendo
        if (isTyping(e)) {
          return;
        }

        // Ctrl+Enter → Finalizar venta
        if (e.ctrlKey && e.key === 'Enter') {
          e.preventDefault();
          onFinalizeSale?.();
          return;
        }

        // Ctrl+Backspace → Limpiar carrito
        if (e.ctrlKey && e.key === 'Backspace') {
          e.preventDefault();
          onClearCart?.();
          return;
        }

        // 1-9 → Agregar quick sell #1-9
        if (/^[1-9]$/.test(e.key) && !e.ctrlKey && !e.altKey && !e.metaKey) {
          e.preventDefault();
          const index = parseInt(e.key, 10) - 1;
          onAddQuickSell?.(index);
          return;
        }
      } catch (error) {
        console.error('[usePosHotkeys] Error handling keydown:', error);
      }
    };

    // Agregar listener
    window.addEventListener('keydown', handleKeyDown);

    // Cleanup al desmontar
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onFocusSearch, onFinalizeSale, onClearCart, onAddQuickSell, onEscape]);
}
