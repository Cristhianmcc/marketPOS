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
    return <Icon className="w-4 h-4" />;
  }
  if (icon && /[^\x00-\x7F]/.test(icon)) {
    return <span className="text-sm leading-none">{icon}</span>;
  }
  return <Package className="w-4 h-4" />;
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
    `flex items-center gap-2 h-9 px-3.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors flex-shrink-0 border ${
      active
        ? 'bg-monterrial-forest border-monterrial-forest text-white'
        : 'bg-surface-light dark:bg-surface-dark text-text-main dark:text-text-light border-border-light dark:border-border-dark hover:border-primary/50'
    }`;

  return (
    <div>
      <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1 mask-fade-right">
        <button onClick={() => onSelect(null)} className={chip(selected === null)}>
          <LayoutGrid className="w-4 h-4" />
          <span>Todo</span>
        </button>
        {categories.map(cat => (
          <button
            key={cat.id}
            onClick={() => onSelect(selected === cat.name ? null : cat.name)}
            className={chip(selected === cat.name)}
          >
            <CategoryIcon icon={cat.icon} />
            <span>{cat.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
