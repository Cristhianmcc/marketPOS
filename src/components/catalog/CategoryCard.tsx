import {
  Cookie,
  Dog,
  Hammer,
  Milk,
  Package,
  ShoppingBasket,
  SprayCan,
  Sparkles,
  Wine,
  Carrot,
  CupSoda,
  Boxes,
  Droplet,
  Wheat,
  Candy,
} from 'lucide-react';

interface CategoryCardProps {
  category: string;
  isActive: boolean;
  onClick: () => void;
}

const iconMap: Record<string, typeof Package> = {
  bebidas: Wine,
  'bebidas-alcoholicas': Wine,
  alcoholicas: Wine,
  licores: Wine,
  snacks: Cookie,
  golosinas: Candy,
  abarrotes: ShoppingBasket,
  conservas: Boxes,
  limpieza: SprayCan,
  ferreteria: Hammer,
  lacteos: Milk,
  'cuidado-personal': Sparkles,
  mascotas: Dog,
  verduras: Carrot,
  menestras: CupSoda,
  arroz: Wheat,
  'arroz-menestras': Wheat,
  'arroz-y-menestras': Wheat,
  'aceites-mantecas': Droplet,
  panaderia: Wheat,
};

const colorPool = [
  '#111827',
  '#0f766e',
  '#1d4ed8',
  '#b91c1c',
  '#7c2d12',
  '#166534',
  '#155e75',
  '#6d28d9',
];

function pickColor(label: string): string {
  let hash = 0;
  for (let i = 0; i < label.length; i += 1) {
    hash = (hash * 31 + label.charCodeAt(i)) % colorPool.length;
  }
  return colorPool[Math.abs(hash)];
}

function toCategoryKey(label: string): string {
  return label
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '-');
}

export function CategoryCard({ category, isActive, onClick }: CategoryCardProps) {
  const key = toCategoryKey(category);
  const Icon = iconMap[key] ?? Package;
  const accent = pickColor(category);

  return (
    <button
      onClick={onClick}
      className={`group flex flex-col items-center gap-2 px-3 py-2 rounded-2xl transition-all duration-300 ${
        isActive
          ? 'bg-black text-white shadow-lg'
          : 'bg-white text-neutral-900 border border-neutral-200 hover:shadow-md'
      }`}
    >
      <div
        className={`h-12 w-12 rounded-full flex items-center justify-center transition-all ${
          isActive ? 'bg-white text-black' : 'bg-white text-neutral-700 shadow-md'
        }`}
        style={!isActive ? { boxShadow: `0 6px 16px ${accent}1f` } : undefined}
      >
        <Icon className="w-6 h-6" style={!isActive ? { color: accent } : undefined} />
      </div>
      <span className={`text-[11px] text-center leading-tight ${isActive ? 'font-semibold' : ''}`}>
        {category}
      </span>
    </button>
  );
}
