import { CategoryCard } from './CategoryCard';

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
    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
      {categories.map((category) => {
        const active = category === selectedCategory;

        return (
          <CategoryCard
            key={category}
            category={category}
            isActive={active}
            onClick={() => onSelectCategory(category)}
          />
        );
      })}
    </div>
  );
}
