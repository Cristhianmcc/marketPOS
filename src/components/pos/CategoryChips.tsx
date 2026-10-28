// src/components/pos/CategoryChips.tsx
// Fila de categorías del inventario para filtrar productos en el POS
'use client';

import { useEffect, useState } from 'react';
import {
  Package, Coffee, Cookie, Milk, Beef, Apple, Croissant, Sparkles, Lightbulb, Flower2,
  Shield, Hammer, Car, Paperclip, Droplets, Palette, Anchor, Building2, Zap, User,
  MoreHorizontal, LayoutGrid, type LucideIcon,
} from 'lucide-react';

interface Category {
  id: string;
  name: string;
  icon: string | null;
}

// Las categorías guardan un nombre de icono lucide o un emoji
const ICONS: Record<string, LucideIcon> = {
  Package, Coffee, Cookie, Milk, Beef, Apple, Croissant, Sparkles, Lightbulb, Flower2,
  Shield, Hammer, Car, Paperclip, Droplets, Palette, Anchor, Building2, Zap, User, MoreHorizontal,
};

function CategoryIcon({ icon }: { icon: string | null }) {
  if (icon && ICONS[icon]) {
    const Icon = ICONS[icon];
    return <Icon className="w-6 h-6" />;
  }
  if (icon && /[^\x00-\x7F]/.test(icon)) {
    return <span className="text-2xl leading-none">{icon}</span>;
  }
  return <Package className="w-6 h-6" />;
}

interface CategoryChipsProps {
  selected: string | null;
  onSelect: (name: string | null) => void;
}

export function CategoryChips({ selected, onSelect }: CategoryChipsProps) {
  const [categories, setCategories] = useState<Category[]>([]);

  useEffect(() => {
    fetch('/api/categories')
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        const list = Array.isArray(data) ? data : data?.categories;
        if (Array.isArray(list)) setCategories(list);
      })
      .catch(() => {});
  }, []);

  if (categories.length === 0) return null;

  const chip = (active: boolean) =>
    `flex flex-col items-center justify-center gap-2 min-w-[92px] h-[92px] px-2 rounded-2xl text-xs font-semibold transition-all flex-shrink-0 ${
      active
        ? 'bg-primary text-white shadow-medium'
        : 'bg-surface-light dark:bg-surface-dark text-text-main dark:text-text-light border border-border-light dark:border-border-dark hover:border-primary/50 hover:shadow-soft'
    }`;

  return (
    <div>
      <h3 className="mb-3 text-lg font-bold text-text-main dark:text-text-light">Categorías</h3>
      <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-1">
        <button onClick={() => onSelect(null)} className={chip(selected === null)}>
          <LayoutGrid className="w-6 h-6" />
          <span>Todo</span>
        </button>
        {categories.map(cat => (
          <button
            key={cat.id}
            onClick={() => onSelect(selected === cat.name ? null : cat.name)}
            className={chip(selected === cat.name)}
          >
            <CategoryIcon icon={cat.icon} />
            <span className="line-clamp-2 text-center leading-tight">{cat.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
