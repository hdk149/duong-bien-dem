"use client";

import { ShopItem } from "./shopItems";

type ShopItemCardProps = {
  item: ShopItem;
  money: number;
  isVietnamese: boolean;
  isDark: boolean;
  remainingStock?: number;
  onBuy?: (item: ShopItem) => void;
};

function formatMoney(value: number) {
  return `${new Intl.NumberFormat("vi-VN").format(value)}đ`;
}

export default function ShopItemCard({
  item,
  money,
  isVietnamese,
  isDark,
  remainingStock,
  onBuy,
}: ShopItemCardProps) {
  const canAfford = money >= item.price;

  const hasStock =
    typeof remainingStock !== "number" || remainingStock > 0;

  const canBuy = canAfford && hasStock;

  const cardClass = isDark
    ? "border-[#39352e] bg-[#1b1916]"
    : "border-[#d0c8ba] bg-[#f8f4ec]";

  const mutedClass = isDark
    ? "text-[#938c80]"
    : "text-[#746e64]";

  return (
    <article
      className={`overflow-hidden rounded-[24px] border ${cardClass}`}
    >
      <div className="flex items-center gap-4 p-5">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[18px] border border-[#b69c57]/20 bg-[#b69c57]/10 text-3xl">
          {item.icon}
        </div>

        <div className="min-w-0 flex-1">
          <h3 className="text-base font-black">
            {isVietnamese ? item.name : item.nameEn}
          </h3>

          <p className={`mt-1 text-xs leading-5 ${mutedClass}`}>
            {isVietnamese
              ? item.description
              : item.descriptionEn}
          </p>
        </div>
      </div>

      <div className="border-t border-current/10 px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p
              className={`text-[9px] font-black uppercase tracking-[0.16em] ${mutedClass}`}
            >
              {isVietnamese ? "GIÁ" : "PRICE"}
            </p>

            <p className="mt-1 text-sm font-black text-[#b69c57]">
              {formatMoney(item.price)}
            </p>

            {typeof remainingStock === "number" && (
              <p
                className={`mt-2 text-[9px] font-black uppercase tracking-[0.12em] ${
                  remainingStock > 0
                    ? "text-emerald-500"
                    : "text-red-400"
                }`}
              >
                {remainingStock > 0
                  ? isVietnamese
                    ? `CÒN ${remainingStock}`
                    : `${remainingStock} LEFT`
                  : isVietnamese
                    ? "HẾT HÀNG"
                    : "OUT OF STOCK"}
              </p>
            )}
          </div>

          <button
            type="button"
            disabled={!canBuy}
            onClick={() => {
              if (!canBuy) return;
              onBuy?.(item);
            }}
            className={`rounded-2xl border px-5 py-3 text-[10px] font-black uppercase tracking-[0.14em] transition ${
              canBuy
                ? "border-[#b69c57]/40 bg-[#b69c57]/10 text-[#b69c57] active:scale-[0.98]"
                : "cursor-not-allowed border-current/10 bg-current/5 opacity-40"
            }`}
          >
            {isVietnamese ? "MUA" : "BUY"}
          </button>
        </div>

        <p
          className={`mt-3 text-right text-[9px] font-bold ${
            !hasStock
              ? "text-red-400"
              : canAfford
                ? "text-emerald-500"
                : "text-red-400"
          }`}
        >
          {!hasStock
            ? isVietnamese
              ? "HẾT HÀNG"
              : "OUT OF STOCK"
            : canAfford
              ? isVietnamese
                ? "ĐỦ TIỀN"
                : "AFFORDABLE"
              : isVietnamese
                ? "KHÔNG ĐỦ TIỀN"
                : "NOT ENOUGH"}
        </p>
      </div>
    </article>
  );
}