// src/components/pos/CategoryChips.tsx
// Fila de categorías del inventario para filtrar productos en el POS
'use client';

import { useEffect, useState } from 'react';
import { categoryEmoji } from './categoryEmoji';

interface Category {
  id: string;
  name: string;
  icon: string | null;
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
    `flex flex-col items-center justify-center gap-1.5 w-[84px] h-[84px] px-1.5 rounded-2xl text-xs font-semibold transition-all flex-shrink-0 ${
      active
        ? 'bg-primary text-white shadow-lg shadow-primary/30'
        : 'bg-surface-light dark:bg-surface-dark text-text-secondary dark:text-gray-300 shadow-soft hover:shadow-medium hover:text-text-main'
    }`;

  return (
    <div>
      <h3 className="mb-3 text-lg font-bold text-text-main dark:text-text-light">Categorías</h3>
      <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-2">
        <button onClick={() => onSelect(null)} className={chip(selected === null)}>
          <span className="text-2xl leading-none">🏪</span>
          <span>Todo</span>
        </button>
        {categories.map(cat => (
          <button
            key={cat.id}
            onClick={() => onSelect(selected === cat.name ? null : cat.name)}
            className={chip(selected === cat.name)}
            title={cat.name}
          >
            <span className="text-2xl leading-none">{categoryEmoji(cat.name, cat.icon)}</span>
            <span className="w-full line-clamp-2 text-center text-[11px] leading-tight">{cat.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
