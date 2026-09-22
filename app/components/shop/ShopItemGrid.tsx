"use client";

import ShopItemCard from "./ShopItemCard";
import {
  getItemsByCategory,
  ShopCategory,
  ShopItem,
} from "./shopItems";

export type ShopStockItem = {
  itemId: string;
  remainingStock: number;
};

type ShopItemGridProps = {
  category: ShopCategory;
  money: number;
  isVietnamese: boolean;
  isDark: boolean;
  stock?: ShopStockItem[];
  onBuy?: (item: ShopItem) => void;
};

export default function ShopItemGrid({
  category,
  money,
  isVietnamese,
  isDark,
  stock = [],
  onBuy,
}: ShopItemGridProps) {
  const categoryItems = getItemsByCategory(category);

  const stockMap = new Map(
    stock.map((entry) => [
      entry.itemId,
      entry.remainingStock,
    ])
  );

  const items = categoryItems.filter((item) => {
    return stockMap.has(item.id);
  });

  return (
    <div className="grid grid-cols-1 gap-4">
      {items.map((item) => {
        const remainingStock =
          stockMap.get(item.id) ?? 0;

        return (
          <ShopItemCard
            key={item.id}
            item={item}
            money={money}
            isVietnamese={isVietnamese}
            isDark={isDark}
            remainingStock={remainingStock}
            onBuy={onBuy}
          />
        );
      })}

      {items.length === 0 && (
        <div
          className={`rounded-[24px] border p-6 text-center ${
            isDark
              ? "border-[#39352e] bg-[#1b1916] text-[#938c80]"
              : "border-[#d0c8ba] bg-[#f8f4ec] text-[#746e64]"
          }`}
        >
          <p className="text-xs font-bold">
            {isVietnamese
              ? "Hiện không có vật phẩm trong danh mục này."
              : "No items are currently available in this category."}
          </p>
        </div>
      )}
    </div>
  );
}