"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

type SideQuestChoice = {
  id: string;
  text: string;
  text_en?: string | null;
};

type SideQuestResult = {
  money?: number;
  hp?: number;
  location?: string;
  item_id?: string;
  item_quantity?: number;
  message?: string;
  message_en?: string;
};

type SideQuest = {
  id: string;
  room_id: string;
  player_id: string;
  item_id: string;

  title: string;
  title_en?: string | null;

  description: string;
  description_en?: string | null;

  choices: SideQuestChoice[];

  status: "choosing" | "resolving" | "resolved" | "cancelled";
  selected_choice?: string | null;
  result?: SideQuestResult | null;
};

export default function SideQuestPage() {
  const params = useParams<{ code: string }>();
  const router = useRouter();

  const code = params?.code ?? "";

  const [playerToken, setPlayerToken] = useState("");

  const [quest, setQuest] = useState<SideQuest | null>(null);
  const [loading, setLoading] = useState(true);
  const [choosing, setChoosing] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const [error, setError] = useState("");
  const [selectedChoiceId, setSelectedChoiceId] = useState<string | null>(
    null,
  );

  useEffect(() => {
    const token = sessionStorage.getItem("player_token") ?? "";
    setPlayerToken(token);
  }, []);

  useEffect(() => {
    if (!code || !playerToken) return;

    let cancelled = false;

    async function loadQuest() {
      setLoading(true);
      setError("");

      try {
        const response = await fetch(
          "/api/rooms/" + code + "/side-quests/active",
          {
            method: "GET",
            headers: {
              "x-player-token": playerToken,
            },
            cache: "no-store",
          },
        );

        const data = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(
            data?.error || "Không thể tải Side Quest.",
          );
        }

        if (cancelled) return;

        const activeQuest = data?.sideQuest ?? null;

        setQuest(activeQuest);
        setSelectedChoiceId(
          activeQuest?.selected_choice ?? null,
        );

        if (!activeQuest) {
          router.replace("/game/" + code);
        }
      } catch (err) {
        if (cancelled) return;

        console.error("Side Quest load error:", err);

        setError(
          err instanceof Error
            ? err.message
            : "Không thể tải Side Quest.",
        );
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadQuest();

    return () => {
      cancelled = true;
    };
  }, [code, playerToken, router]);

  async function chooseChoice(choice: SideQuestChoice) {
    if (!quest) return;
    if (!playerToken) return;
    if (choosing) return;
    if (quest.status !== "choosing") return;

    setChoosing(true);
    setError("");
    setSelectedChoiceId(choice.id);

    try {
      const response = await fetch(
        "/api/rooms/" + code + "/side-quests/choose",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-player-token": playerToken,
          },
          body: JSON.stringify({
            questId: quest.id,
            choiceId: choice.id,
          }),
        },
      );

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          data?.error || "Không thể xử lý lựa chọn.",
        );
      }

      const resolvedQuest =
        data?.sideQuest ?? data?.quest ?? null;

      if (resolvedQuest) {
        setQuest(resolvedQuest);

        setSelectedChoiceId(
          resolvedQuest.selected_choice ?? choice.id,
        );
      }
    } catch (err) {
      console.error("Side Quest choose error:", err);

      setSelectedChoiceId(null);

      setError(
        err instanceof Error
          ? err.message
          : "Không thể xử lý lựa chọn.",
      );
    } finally {
      setChoosing(false);
    }
  }

  async function cancelQuest() {
    if (!quest) return;
    if (!playerToken) return;
    if (cancelling) return;

    const confirmed = window.confirm(
      "Bạn có chắc muốn hủy Side Quest này không?",
    );

    if (!confirmed) return;

    setCancelling(true);
    setError("");

    try {
      const response = await fetch(
        "/api/rooms/" + code + "/side-quests/cancel",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-player-token": playerToken,
          },
          body: JSON.stringify({
            questId: quest.id,
          }),
        },
      );

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          data?.error || "Không thể hủy Side Quest.",
        );
      }

      router.replace("/game/" + code);
    } catch (err) {
      console.error("Side Quest cancel error:", err);

      setError(
        err instanceof Error
          ? err.message
          : "Không thể hủy Side Quest.",
      );

      setCancelling(false);
    }
  }

  function backToGame() {
    router.replace("/game/" + code);
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#0f0d0b] text-white">
        <div className="mx-auto flex min-h-screen w-full max-w-lg items-center justify-center px-4">
          <div className="text-center">
            <div className="text-4xl">📜</div>

            <p className="mt-3 text-sm text-white/50">
              Đang mở Side Quest...
            </p>
          </div>
        </div>
      </main>
    );
  }

  if (error && !quest) {
    return (
      <main className="min-h-screen bg-[#0f0d0b] text-white">
        <div className="mx-auto flex min-h-screen w-full max-w-lg items-center justify-center px-4">
          <div className="w-full rounded-2xl border border-red-400/20 bg-red-400/10 p-5 text-center">
            <div className="text-4xl">⚠️</div>

            <p className="mt-3 text-sm leading-relaxed text-red-200">
              {error}
            </p>

            <button
              type="button"
              onClick={backToGame}
              className="mt-4 w-full rounded-xl bg-white/10 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/15"
            >
              Quay lại game
            </button>
          </div>
        </div>
      </main>
    );
  }

  if (!quest) {
    return null;
  }

  const isChoosing = quest.status === "choosing";
  const isResolved = quest.status === "resolved";
  const isResolving = quest.status === "resolving";

  return (
    <main className="min-h-screen bg-[#0f0d0b] text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-lg flex-col">
        <header className="flex items-center justify-between border-b border-white/10 px-4 py-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.18em] text-white/30">
              Đường Biên Đêm
            </p>

            <h1 className="mt-1 text-lg font-bold">
              Side Quest
            </h1>
          </div>

          {isChoosing && (
            <button
              type="button"
              disabled={cancelling || choosing}
              onClick={() => void cancelQuest()}
              className="rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 text-xs font-semibold text-white/60 transition hover:bg-white/[0.09] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              {cancelling ? "Đang hủy..." : "Cancel Quest"}
            </button>
          )}
        </header>

        <div className="flex-1 px-4 py-5">
          <section className="rounded-2xl border border-white/10 bg-[#171411] p-5 shadow-xl">
            <div className="flex items-start gap-3">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/[0.06] text-3xl">
                📜
              </div>

              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-[0.16em] text-white/30">
                  Nhiệm vụ phụ
                </p>

                <h2 className="mt-1 text-xl font-bold leading-snug text-white">
                  {quest.title}
                </h2>
              </div>
            </div>

            <div className="mt-5 rounded-xl bg-black/20 p-4">
              <p className="text-sm leading-7 text-white/65">
                {quest.description}
              </p>
            </div>

            {error && (
              <div className="mt-4 rounded-xl border border-red-400/20 bg-red-400/10 p-3">
                <p className="text-xs leading-relaxed text-red-200">
                  {error}
                </p>
              </div>
            )}

            {isChoosing && (
              <div className="mt-5">
                <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/30">
                  Bạn sẽ làm gì?
                </p>

                <div className="space-y-2">
                  {quest.choices.map((choice, index) => {
                    const selected =
                      selectedChoiceId === choice.id;

                    return (
                      <button
                        key={choice.id}
                        type="button"
                        disabled={choosing}
                        onClick={() =>
                          void chooseChoice(choice)
                        }
                        className={[
                          "w-full rounded-xl border p-4 text-left transition",
                          "active:scale-[0.99]",
                          selected
                            ? "border-white/25 bg-white/10"
                            : "border-white/10 bg-white/[0.035] hover:bg-white/[0.07]",
                          choosing
                            ? "cursor-not-allowed opacity-60"
                            : "",
                        ].join(" ")}
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-xs font-bold text-white/60">
                            {String.fromCharCode(65 + index)}
                          </div>

                          <span className="text-sm font-medium leading-relaxed text-white/80">
                            {choice.text}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {isResolving && (
              <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.035] p-5 text-center">
                <div className="text-3xl">⏳</div>

                <p className="mt-3 text-sm font-semibold text-white/75">
                  Đang xử lý lựa chọn...
                </p>

                <p className="mt-1 text-xs text-white/35">
                  Dữ liệu nhân vật đang được cập nhật.
                </p>
              </div>
            )}

            {isResolved && (
              <div className="mt-5">
                <div className="rounded-xl border border-white/10 bg-white/[0.035] p-4">
                  <div className="flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-400/10 text-emerald-300">
                      ✓
                    </span>

                    <div>
                      <p className="text-sm font-bold text-white">
                        Side Quest hoàn thành
                      </p>

                      <p className="text-xs text-white/35">
                        Kết quả đã được cập nhật vào nhân vật.
                      </p>
                    </div>
                  </div>

                  {quest.result?.message && (
                    <p className="mt-4 text-sm leading-relaxed text-white/65">
                      {quest.result.message}
                    </p>
                  )}

                  <div className="mt-4 grid grid-cols-2 gap-2">
                    {typeof quest.result?.money ===
                      "number" && (
                      <div className="rounded-xl bg-black/20 p-3">
                        <p className="text-[10px] uppercase tracking-wide text-white/30">
                          Tiền
                        </p>

                        <p
                          className={[
                            "mt-1 text-sm font-bold",
                            quest.result.money >= 0
                              ? "text-emerald-300"
                              : "text-red-300",
                          ].join(" ")}
                        >
                          {quest.result.money >= 0 ? "+" : ""}
                          {quest.result.money.toLocaleString(
                            "vi-VN",
                          )}{" "}
                          ₫
                        </p>
                      </div>
                    )}

                    {typeof quest.result?.hp === "number" && (
                      <div className="rounded-xl bg-black/20 p-3">
                        <p className="text-[10px] uppercase tracking-wide text-white/30">
                          Máu
                        </p>

                        <p
                          className={[
                            "mt-1 text-sm font-bold",
                            quest.result.hp >= 0
                              ? "text-emerald-300"
                              : "text-red-300",
                          ].join(" ")}
                        >
                          {quest.result.hp >= 0 ? "+" : ""}
                          {quest.result.hp} HP
                        </p>
                      </div>
                    )}

                    {quest.result?.location && (
                      <div className="col-span-2 rounded-xl bg-black/20 p-3">
                        <p className="text-[10px] uppercase tracking-wide text-white/30">
                          Địa điểm
                        </p>

                        <p className="mt-1 text-sm text-white/70">
                          📍 {quest.result.location}
                        </p>
                      </div>
                    )}

                    {quest.result?.item_id && (
                      <div className="col-span-2 rounded-xl bg-black/20 p-3">
                        <p className="text-[10px] uppercase tracking-wide text-white/30">
                          Vật phẩm nhận được
                        </p>

                        <p className="mt-1 text-sm text-white/70">
                          🎁 {quest.result.item_id}
                          {quest.result.item_quantity &&
                          quest.result.item_quantity > 1
                            ? " ×" + quest.result.item_quantity
                            : ""}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={backToGame}
                  className="mt-4 w-full rounded-xl bg-white/[0.09] px-4 py-3.5 text-sm font-semibold text-white transition hover:bg-white/[0.14] active:scale-[0.99]"
                >
                  Quay lại game
                </button>
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}