import { CategoryCard } from './CategoryCard';
import { DEFAULT_TINT, type CategorySummary } from './categoryTheme';

interface CategoryFilterProps {
  categories: CategorySummary[];
  productCount: number;
  selectedCategory: string;
  onSelectCategory: (category: string) => void;
}

export function CategoryFilter({
  categories,
  productCount,
  selectedCategory,
  onSelectCategory,
}: CategoryFilterProps) {
  const all: CategorySummary = { name: 'Todos', tint: DEFAULT_TINT, count: productCount, imageUrl: null };

  return (
    <div className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1 pt-1 scrollbar-hide sm:flex-wrap sm:gap-2">
      {[all, ...categories].map((category) => (
        <CategoryCard
          key={category.name}
          category={category}
          isActive={category.name === selectedCategory}
          onClick={() => onSelectCategory(category.name)}
        />
      ))}
    </div>
  );
}
