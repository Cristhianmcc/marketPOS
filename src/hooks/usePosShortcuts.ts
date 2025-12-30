// ✅ MÓDULO 17.1: ATAJOS DE TECLADO (KEYBOARD-FIRST POS)
// Hook global de atajos de teclado para el POS

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

interface ShortcutHandlers {
  // Búsqueda
  focusSearch: () => void;
  addFirstSearchResult: () => void;
  
  // Carrito
  incrementSelectedItem: () => void;
  decrementSelectedItem: () => void;
  removeSelectedItem: () => void;
  focusCart: () => void;
  
  // Checkout
  openCheckout: () => void;
  closeModal: () => void;
  
  // Métodos de pago (solo en checkout)
  selectCash: () => void;
  selectYape: () => void;
  selectPlin: () => void;
  selectCard: () => void;
}

interface ShortcutOptions {
  enabled?: boolean;
  isCheckoutModalOpen?: boolean;
  hasOpenShift?: boolean;
}

export function usePosShortcuts(
  handlers: ShortcutHandlers,
  options: ShortcutOptions = {}
) {
  const pathname = usePathname();
  const { 
    enabled = true,
    isCheckoutModalOpen = false,
    hasOpenShift = false
  } = options;

  // Ref para almacenar el índice del ítem seleccionado en el carrito
  const selectedCartIndexRef = useRef<number>(0);

  useEffect(() => {
    // Solo activar atajos en /pos
    if (!enabled || pathname !== '/pos') {
      return;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      // ✅ Prevenir comportamiento por defecto de teclas de función
      // F5 recarga la página, F6 enfoca barra de direcciones, etc.
      if (['F1', 'F2', 'F4', 'F5', 'F6', 'F7', 'F8'].includes(e.key)) {
        e.preventDefault();
      }

      // ✅ REGLA 1: NO interferir con inputs, textareas ni elementos editables
      const target = e.target as HTMLElement;
      const isInput = target instanceof HTMLInputElement;
      const isTextarea = target instanceof HTMLTextAreaElement;
      const isEditable = target.isContentEditable;

      if (isInput || isTextarea || isEditable) {
        // Permitir Enter en búsqueda de productos
        if (e.key === 'Enter' && isInput && target.id === 'product-search') {
          e.preventDefault();
          handlers.addFirstSearchResult();
        }
        return;
      }

      // ✅ REGLA 2: Si hay modal abierto, solo permitir teclas específicas
      if (isCheckoutModalOpen) {
        switch (e.key) {
          case 'Escape':
            handlers.closeModal();
            break;
          case 'F5':
            handlers.selectCash();
            break;
          case 'F6':
            handlers.selectYape();
            break;
          case 'F7':
            handlers.selectPlin();
            break;
          case 'F8':
            handlers.selectCard();
            break;
        }
        return; // No procesar más atajos si hay modal
      }

      // ✅ ATAJOS GLOBALES DEL POS (sin modal abierto)
      switch (e.key) {
        // BÚSQUEDA
        case 'F1':
          handlers.focusSearch();
          break;

        // CARRITO - Incrementar
        case '+':
        case '=': // Algunas keyboards usan = sin Shift
          e.preventDefault();
          handlers.incrementSelectedItem();
          break;

        // CARRITO - Decrementar
        case '-':
        case '_':
          e.preventDefault();
          handlers.decrementSelectedItem();
          break;

        // CARRITO - Eliminar
        case 'Delete':
          e.preventDefault();
          handlers.removeSelectedItem();
          break;

        // CARRITO - Enfocar
        case 'F2':
          handlers.focusCart();
          break;

        // CHECKOUT - Abrir
        case 'F4':
          // Solo si hay turno abierto
          if (hasOpenShift) {
            handlers.openCheckout();
          }
          break;

        // CERRAR MODAL
        case 'Escape':
          handlers.closeModal();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [pathname, enabled, isCheckoutModalOpen, hasOpenShift, handlers]);

  return {
    selectedCartIndex: selectedCartIndexRef.current,
    setSelectedCartIndex: (index: number) => {
      selectedCartIndexRef.current = index;
    }
  };
}
