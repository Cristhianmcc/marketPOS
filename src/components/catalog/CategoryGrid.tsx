'use client';

import { useState } from 'react';
import { CategoryCard } from './CategoryCard';
import type { CategorySummary } from './categoryTheme';

interface CategoryGridProps {
  categories: CategorySummary[];
  selectedCategory: string;
  onSelectCategory: (category: string) => void;
}

const VISIBLE_TILES = 8;

export function CategoryGrid({ categories, selectedCategory, onSelectCategory }: CategoryGridProps) {
  const [expanded, setExpanded] = useState(false);
  if (categories.length < 2) return null;

  const ordered = [...categories].sort((a, b) => b.count - a.count);
  const collapsed = !expanded && ordered.length > VISIBLE_TILES;
  const visible = collapsed ? ordered.slice(0, VISIBLE_TILES - 1) : ordered;

  return (
    <section className="max-w-6xl mx-auto px-4 pt-8" aria-label="Categorías">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
        {visible.map((category) => (
          <CategoryCard
            key={category.name}
            category={category}
            isActive={category.name === selectedCategory}
            onClick={() => onSelectCategory(category.name)}
          />
        ))}
        {collapsed && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="aspect-[4/3] w-full rounded-3xl border border-neutral-200 bg-white text-sm sm:text-base font-semibold text-neutral-800 hover:shadow-md transition-shadow"
          >
            Ver {ordered.length - visible.length} más
          </button>
        )}
      </div>
    </section>
  );
}
