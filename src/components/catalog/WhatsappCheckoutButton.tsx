import type { CartItem } from './CatalogPageClient';

interface WhatsappCheckoutButtonProps {
  whatsappNumber: string;
  cart: CartItem[];
  storeName: string;
}

export function WhatsappCheckoutButton({
  whatsappNumber,
  cart,
  storeName,
}: WhatsappCheckoutButtonProps) {
  const handleCheckout = () => {
    if (!cart.length) return;

    const lines: string[] = [];
    lines.push(`Hola, quiero pedir de ${storeName}:`);
    lines.push('');

    for (const item of cart) {
      lines.push(
        `- ${item.quantity} x ${item.name} - S/ ${(item.price * item.quantity).toFixed(2)}`,
      );
    }

    const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

    lines.push('');
    lines.push(`Total: S/ ${total.toFixed(2)}`);
    lines.push('');
    lines.push('Mi nombre es:');
    lines.push('Mi direccion es:');

    const text = encodeURIComponent(lines.join('\n'));
    const cleanNumber = whatsappNumber.replace(/[^\d]/g, '');
    const url = `https://wa.me/${cleanNumber}?text=${text}`;

    window.open(url, '_blank');
  };

  return (
    <button
      type="button"
      onClick={handleCheckout}
      disabled={!cart.length}
      className="w-full bg-[#25D366] text-white py-3.5 rounded-2xl hover:bg-[#20BA5A] transition-colors flex items-center justify-center gap-2 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed text-sm"
    >
      Pedir por WhatsApp
    </button>
  );
}
