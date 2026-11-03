import { CategoryIcon } from '@/components/pos/categoryIcon';

interface CategoryFilterProps {
  categories: string[];
  selectedCategory: string;
  onSelectCategory: (category: string) => void;
}

export function CategoryFilter({
  categories,
  selectedCategory,
  onSelectCategory,
}: CategoryFilterProps) {
  return (
    <div className="flex gap-2 overflow-x-auto scrollbar-hide">
      {categories.map((category) => {
        const active = category === selectedCategory;

        return (
          <button
            key={category}
            type="button"
            onClick={() => onSelectCategory(category)}
            aria-pressed={active}
            className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-sm transition-colors ${
              active
                ? 'bg-[#15803d] font-semibold text-white'
                : 'border border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50'
            }`}
          >
            {category !== 'Todos' && <CategoryIcon name={category} className="h-4 w-4" />}
            {category}
          </button>
        );
      })}
    </div>
  );
}
