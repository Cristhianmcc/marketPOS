// src/components/pos/CategoryChips.tsx
// Fila de categorías del inventario para filtrar productos en el POS
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
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
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/categories')
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        const list = Array.isArray(data) ? data : data?.categories;
        if (Array.isArray(list)) setCategories(list);
      })
      .catch(() => {});
  }, []);

  const updateArrows = useCallback(() => {
    const el = rowRef.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 4);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    const el = rowRef.current;
    if (!el) return;
    updateArrows();
    // La rueda vertical del mouse desplaza la fila hacia los lados
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && el.scrollWidth > el.clientWidth) {
        e.preventDefault();
        el.scrollLeft += e.deltaY;
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('resize', updateArrows);
    return () => {
      el.removeEventListener('wheel', onWheel);
      window.removeEventListener('resize', updateArrows);
    };
  }, [categories.length, updateArrows]);

  const scrollByPage = (dir: 1 | -1) => {
    const el = rowRef.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: 'smooth' });
  };

  if (categories.length === 0) return null;

  const chip = (active: boolean) =>
    `flex flex-col items-center justify-center gap-1.5 w-[84px] h-[84px] px-1.5 rounded-2xl text-xs font-semibold transition-all flex-shrink-0 snap-start ${
      active
        ? 'bg-primary text-white shadow-lg shadow-primary/30'
        : 'bg-surface-light dark:bg-surface-dark text-text-secondary dark:text-gray-300 shadow-soft hover:shadow-medium hover:text-text-main'
    }`;
  const arrow =
    'w-8 h-8 rounded-full bg-surface-light dark:bg-surface-dark shadow-soft flex items-center justify-center text-text-main dark:text-text-light hover:text-primary disabled:opacity-30 disabled:cursor-default transition';

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-lg font-bold text-text-main dark:text-text-light">Categorías</h3>
        {(canLeft || canRight) && (
          <div className="flex items-center gap-2">
            <button onClick={() => scrollByPage(-1)} disabled={!canLeft} className={arrow} aria-label="Categorías anteriores">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button onClick={() => scrollByPage(1)} disabled={!canRight} className={arrow} aria-label="Más categorías">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
      <div className="relative">
        <div ref={rowRef} onScroll={updateArrows} className="flex gap-3 overflow-x-auto scrollbar-hide pb-2 snap-x">
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
        {/* Desvanecido en los bordes para indicar que hay más */}
        {canRight && <div className="pointer-events-none absolute right-0 top-0 bottom-2 w-12 bg-gradient-to-l from-background-light dark:from-background-dark to-transparent" />}
        {canLeft && <div className="pointer-events-none absolute left-0 top-0 bottom-2 w-12 bg-gradient-to-r from-background-light dark:from-background-dark to-transparent" />}
      </div>
    </div>
  );
}
