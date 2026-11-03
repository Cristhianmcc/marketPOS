import type { CSSProperties } from 'react';
import { CategoryIcon } from '@/components/pos/categoryIcon';
import type { CategorySummary } from './categoryTheme';

interface CategoryCardProps {
  category: CategorySummary;
  isActive: boolean;
  onClick: () => void;
}

export function CategoryCard({ category, isActive, onClick }: CategoryCardProps) {
  const { name, tint, imageUrl } = category;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isActive}
      className={`group relative aspect-[4/3] w-full overflow-hidden rounded-3xl text-left transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md ${
        isActive ? 'ring-2 ring-offset-2 ring-offset-[#f6faf6]' : ''
      }`}
      style={{ backgroundColor: tint.bg, color: tint.ink, '--tw-ring-color': tint.ink } as CSSProperties}
    >
      <span className="absolute inset-x-4 top-3 bottom-11 flex items-center justify-center">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt=""
            loading="lazy"
            className="h-full w-full object-contain mix-blend-multiply transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <CategoryIcon
            name={name}
            className="h-16 w-16 sm:h-20 sm:w-20 transition-transform duration-500 group-hover:scale-105"
          />
        )}
      </span>
      <span className="absolute inset-x-4 bottom-3 truncate text-sm sm:text-base font-semibold">
        {name}
      </span>
    </button>
  );
}
