"use client";
import React from "react";
import { useFilterData } from "@/hooks/useFilterData";
import { Button, Switch } from "antd";
import { AVAILABLE_SIZES, OCCASIONS, STYLES } from "@/constants/filters";

interface FilterPanelProps {
  selectedBrands: string[];
  selectedCategories: string[];
  selectedSizes: string[];
  selectedOccasions: string[];
  selectedStyles: string[];
  inStock: boolean;
  onBrandToggle: (brand: string) => void;
  onCategoryToggle: (category: string) => void;
  onSizeToggle: (size: string) => void;
  onOccasionToggle: (val: string) => void;
  onStyleToggle: (val: string) => void;
  onInStockChange: (value: boolean) => void;
  onReset: () => void;
  showCategories?: boolean;
  title?: string;
}

const FilterSection = ({
  title,
  items,
  selectedItems = [],
  onToggle,
}: {
  title: string;
  items: any[];
  selectedItems?: string[];
  onToggle: (label: string) => void;
}) => (
  <div className="py-5 border-t border-default">
    <h3 className="text-xs font-black uppercase tracking-widest text-primary-dark/70 mb-3">
      {title}
    </h3>
    <div className="flex flex-wrap gap-2">
      {items.map((item, idx) => {
        const isSelected = selectedItems?.includes(item.label?.toLowerCase());
        return (
          <button
            key={idx}
            onClick={() => onToggle(item.label)}
            style={{
              padding: "5px 16px",
              borderRadius: 99,
              fontSize: 11,
              fontWeight: 700,
              border: isSelected
                ? "1.5px solid var(--color-primary-dark)"
                : "1.5px solid rgba(14, 51, 28, 0.2)",
              background: isSelected ? "var(--color-primary-dark)" : "transparent",
              color: isSelected ? "#fff" : "var(--color-primary-dark)",
              cursor: "pointer",
              transition: "all 0.2s ease",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
            }}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  </div>
);

const FilterPanel: React.FC<FilterPanelProps> = ({
  selectedBrands,
  selectedCategories,
  selectedSizes,
  selectedOccasions,
  selectedStyles,
  inStock,
  onBrandToggle,
  onCategoryToggle,
  onSizeToggle,
  onOccasionToggle,
  onStyleToggle,
  onInStockChange,
  onReset,
  showCategories = true,
  title = "Filters",
}) => {
  const { brands, categories } = useFilterData(showCategories);

  return (
    <aside className="hidden lg:block w-[280px] pr-10 sticky top-24 h-fit max-h-[85vh] overflow-y-auto hide-scrollbar">
      {/* Header */}
      <div className="flex justify-between items-end mb-8">
        <h2 className="text-2xl font-display font-black uppercase tracking-tighter text-primary-dark">
          {title}
        </h2>
        <button
          onClick={onReset}
          className="text-xs font-bold uppercase tracking-widest text-muted hover:text-accent transition-colors underline underline-offset-4 bg-transparent border-none cursor-pointer"
        >
          Clear All
        </button>
      </div>

      {/* In Stock Toggle */}
      <div className="flex justify-between items-center py-5 border-b border-default">
        <span className="text-xs font-black text-primary-dark/70 uppercase tracking-widest">
          In Stock Only
        </span>
        <Switch
          checked={inStock}
          onChange={onInStockChange}
          size="small"
          style={{ background: inStock ? "var(--color-accent)" : undefined }}
        />
      </div>

      {/* Select Size Grid */}
      <div className="py-5 border-b border-default">
        <h3 className="text-xs font-black uppercase tracking-widest text-primary-dark/70 mb-3">
          Size
        </h3>
        <div className="grid grid-cols-3 gap-1.5">
          {AVAILABLE_SIZES.map((size) => {
            const isSelected = selectedSizes.includes(size);
            return (
              <button
                key={size}
                onClick={() => onSizeToggle(size)}
                style={{
                  padding: "8px 0",
                  borderRadius: 12,
                  fontSize: 12,
                  fontWeight: 800,
                  border: isSelected
                    ? "2px solid var(--color-primary-dark)"
                    : "1.5px solid rgba(14, 51, 28, 0.15)",
                  background: isSelected
                    ? "var(--color-primary-dark)"
                    : "transparent",
                  color: isSelected ? "#fff" : "var(--color-primary-dark)",
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                  textAlign: "center",
                }}
              >
                {size}
              </button>
            );
          })}
        </div>
      </div>

      {showCategories && (
        <FilterSection
          title="Shop by Category"
          items={categories}
          selectedItems={selectedCategories}
          onToggle={onCategoryToggle}
        />
      )}

      <FilterSection
        title="Brands"
        items={brands}
        selectedItems={selectedBrands}
        onToggle={onBrandToggle}
      />

      <FilterSection
        title="Occasion"
        items={OCCASIONS.map(o => ({ label: o }))}
        selectedItems={selectedOccasions}
        onToggle={onOccasionToggle}
      />

      <FilterSection
        title="Style"
        items={STYLES.map(s => ({ label: s }))}
        selectedItems={selectedStyles}
        onToggle={onStyleToggle}
      />

      <div className="h-20" />
    </aside>
  );
};

export default FilterPanel;
