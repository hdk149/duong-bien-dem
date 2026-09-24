"use client";

type SideQuestConfirmProps = {
  open: boolean;
  itemName: string;
  itemIcon?: string | null;
  loading?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export default function SideQuestConfirm({
  open,
  itemName,
  itemIcon,
  loading = false,
  onCancel,
  onConfirm,
}: SideQuestConfirmProps) {
  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 px-4"
      onClick={() => {
        if (!loading) {
          onCancel();
        }
      }}
    >
      <div
        className="w-full max-w-sm overflow-hidden rounded-2xl border border-white/10 bg-[#171411] shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="p-5 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-white/[0.06] text-3xl">
            {itemIcon || "📦"}
          </div>

          <h2 className="mt-4 text-lg font-bold text-white">
            Sử dụng vật phẩm?
          </h2>

          <p className="mt-2 text-sm leading-relaxed text-white/55">
            Bạn chuẩn bị sử dụng{" "}
            <span className="font-semibold text-white/80">
              {itemName}
            </span>
            .
          </p>

          <p className="mt-2 text-xs leading-relaxed text-white/35">
            Vật phẩm này sẽ mở một Side Quest. Bạn có thể
            quyết định cách xử lý sau khi bước vào nhiệm vụ.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 border-t border-white/10 p-3">
          <button
            type="button"
            disabled={loading}
            onClick={onCancel}
            className="rounded-xl bg-white/[0.05] px-4 py-3 text-sm font-semibold text-white/65 transition hover:bg-white/[0.09] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            Hủy
          </button>

          <button
            type="button"
            disabled={loading}
            onClick={onConfirm}
            className="rounded-xl bg-white/[0.10] px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/[0.15] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loading ? "Đang mở..." : "Đồng ý"}
          </button>
        </div>
      </div>
    </div>
  );
}