import { CategoryIcon } from '@/components/pos/categoryIcon';
import type { CategorySummary } from './categoryTheme';

interface CategoryCardProps {
  category: CategorySummary;
  isActive: boolean;
  onClick: () => void;
}

export function CategoryCard({ category, isActive, onClick }: CategoryCardProps) {
  const { name, imageUrl } = category;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isActive}
      className="group flex w-[4.75rem] sm:w-24 shrink-0 flex-col items-center gap-1.5"
    >
      <span
        className={`flex h-[4.25rem] w-[4.25rem] items-center justify-center overflow-hidden rounded-full p-3 text-[var(--cat-primary)] shadow-[var(--cat-shadow)] transition-all group-hover:-translate-y-0.5 ${
          isActive ? 'bg-[var(--cat-active)]' : 'bg-white'
        }`}
      >
        {imageUrl ? (
          <img
            src={imageUrl}
            alt=""
            loading="lazy"
            className={`h-full w-full object-contain ${isActive ? 'mix-blend-multiply' : ''}`}
          />
        ) : (
          <CategoryIcon name={name} className="h-7 w-7" />
        )}
      </span>
      <span
        className={`w-full truncate text-center text-xs ${
          isActive ? 'font-bold text-[var(--cat-accent-text)]' : 'text-[var(--cat-ink)]'
        }`}
      >
        {name}
      </span>
    </button>
  );
}
