// src/components/pos/CategoryChips.tsx
// Fila de categorías del inventario para filtrar productos en el POS
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeftIcon as ChevronLeft, ChevronRightIcon as ChevronRight, Squares2X2Icon } from '@heroicons/react/24/outline';
import { CategoryIcon } from './categoryIcon';

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

  const tile = (active: boolean) =>
    `relative w-[104px] h-[104px] rounded-2xl overflow-hidden flex-shrink-0 snap-start transition-all ${
      active
        ? 'ring-[3px] ring-primary ring-offset-2 ring-offset-background-light dark:ring-offset-background-dark shadow-lg shadow-primary/30'
        : 'shadow-soft hover:shadow-medium hover:-translate-y-0.5'
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
          <button
            onClick={() => onSelect(null)}
            className={`${tile(selected === null)} flex flex-col items-center justify-center gap-2 text-xs font-bold ${
              selected === null ? 'bg-primary text-white' : 'bg-surface-light dark:bg-surface-dark text-text-main dark:text-text-light'
            }`}
          >
            <Squares2X2Icon className="w-7 h-7" />
            <span>Todo</span>
          </button>
          {categories.map(cat => (
            <button
              key={cat.id}
              onClick={() => onSelect(selected === cat.name ? null : cat.name)}
              className={`${tile(selected === cat.name)} flex flex-col items-center justify-center gap-2 px-1.5 ${
                selected === cat.name ? 'bg-primary text-white' : 'bg-surface-light dark:bg-surface-dark text-text-main dark:text-text-light'
              }`}
              title={cat.name}
            >
              <span className={`w-11 h-11 rounded-xl flex items-center justify-center ${selected === cat.name ? 'bg-white/20' : 'bg-monterrial-lavender/70 dark:bg-background-dark text-primary'}`}>
                <CategoryIcon name={cat.name} className="w-6 h-6" />
              </span>
              <span className="text-[11px] font-bold leading-tight text-center line-clamp-2">{cat.name}</span>
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
