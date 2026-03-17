import { Minus, Plus, ShoppingBag, Trash2, X } from 'lucide-react';
import type { PublicCatalogStore } from '@/types/catalog';
import type { CartItem } from './CatalogPageClient';
import { WhatsappCheckoutButton } from './WhatsappCheckoutButton';

interface CartDrawerProps {
  store: PublicCatalogStore;
  cart: CartItem[];
  isOpen: boolean;
  onClose: () => void;
  onIncrease: (productId: string) => void;
  onDecrease: (productId: string) => void;
  onRemove: (productId: string) => void;
}

export function CartDrawer({
  store,
  cart,
  isOpen,
  onClose,
  onIncrease,
  onDecrease,
  onRemove,
}: CartDrawerProps) {
  const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

  if (!isOpen) return null;

  return (
    <>
      <div
        className="fixed inset-0 bg-black/40 z-50 transition-opacity"
        onClick={onClose}
      />

      <div className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-white z-50 shadow-2xl flex flex-col animate-slide-in">
        <div className="px-4 py-4 border-b border-neutral-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShoppingBag className="w-5 h-5" />
            <h2 className="text-lg">Mi Carrito</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-neutral-100 rounded-lg transition-colors"
            aria-label="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center text-neutral-500">
              <ShoppingBag className="w-16 h-16 mb-4 text-neutral-300" />
              <p className="text-sm">Tu carrito está vacío</p>
              <p className="text-xs mt-1">Agrega productos para comenzar</p>
            </div>
          ) : (
            <div className="space-y-3">
              {cart.map((item) => (
                <div
                  key={item.id}
                  className="bg-neutral-50 rounded-2xl p-3 flex gap-3 relative"
                >
                  <div className="w-20 h-20 bg-white rounded-xl overflow-hidden flex-shrink-0">
                    {item.imageUrl ? (
                      <img
                        src={item.imageUrl}
                        alt={item.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-xs text-neutral-400">
                        Sin imagen
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm mb-0.5 line-clamp-2">{item.name}</h3>
                    <p className="text-xs text-neutral-500 mb-2">
                      {item.description || item.category}
                    </p>
                    <p className="text-sm">S/ {item.price.toFixed(2)}</p>
                  </div>

                  <button
                    onClick={() => onRemove(item.id)}
                    className="absolute top-2 right-2 p-1.5 hover:bg-neutral-200 rounded-lg transition-colors"
                    aria-label="Eliminar"
                  >
                    <Trash2 className="w-4 h-4 text-neutral-500" />
                  </button>

                  <div className="absolute bottom-2 right-2 flex items-center gap-1.5 bg-white rounded-full shadow-sm border border-neutral-200 p-1">
                    <button
                      onClick={() => onDecrease(item.id)}
                      className="p-1.5 hover:bg-neutral-100 rounded-full transition-colors"
                      aria-label="Disminuir cantidad"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <span className="text-sm min-w-[20px] text-center">
                      {item.quantity}
                    </span>
                    <button
                      onClick={() => onIncrease(item.id)}
                      className="p-1.5 hover:bg-neutral-100 rounded-full transition-colors"
                      aria-label="Aumentar cantidad"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {cart.length > 0 && (
          <div className="border-t border-neutral-200 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-neutral-600">Subtotal</span>
              <span className="text-sm">S/ {total.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-base">Total</span>
              <span className="text-xl">S/ {total.toFixed(2)}</span>
            </div>
            <WhatsappCheckoutButton
              whatsappNumber={store.whatsappNumber}
              cart={cart}
              storeName={store.name}
            />
          </div>
        )}
      </div>
    </>
  );
}
