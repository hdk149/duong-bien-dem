import type {
  BackendChoice,
  ChoiceResult,
  GameEvent,
} from "./types";

/* =========================
   MOCK GAME
   ========================= */

export function resolveChoice(
  event: GameEvent,
  choiceId: string
): ChoiceResult {
  const choice = event.choices.find(
    (item) => item.id === choiceId
  );

  if (!choice) {
    return {
      moneyChange: 0,
      hpChange: 0,
      message: "Không có thay đổi.",
    };
  }

  return {
    moneyChange: 0,
    hpChange: 0,
    message: `Bạn đã chọn: ${choice.title}`,
  };
}

/* =========================
   REAL BACKEND HELPERS
   ========================= */

export function getChoiceId(
  choice: BackendChoice,
  index: number
): string {
  return String(
    choice.id ??
      choice.choice_id ??
      `choice-${index}`
  );
}

export function getChoiceTitle(
  choice: BackendChoice
): string {
  return (
    choice.title ??
    choice.label ??
    choice.text ??
    "Lựa chọn"
  );
}

export function getChoiceDescription(
  choice: BackendChoice
): string {
  return choice.description ?? "";
}

export function getChoiceLetter(
  index: number
): string {
  return String.fromCharCode(65 + index);
}

export function getPhaseText(
  phase: string
): string {
  switch (phase) {
    case "waiting":
      return "Đang chờ";

    case "generating_event":
      return "Đang tạo sự kiện";

    case "choosing":
      return "Đang lựa chọn";

    case "resolving":
      return "Đang xử lý";

    case "result":
      return "Kết quả";

    case "finished":
      return "Đã kết thúc";

    default:
      return phase;
  }
}

export function formatMoney(
  value: number
): string {
  return new Intl.NumberFormat(
    "vi-VN"
  ).format(value ?? 0);
}

export function getHpPercent(
  hp: number
): number {
  return Math.max(
    0,
    Math.min(100, hp ?? 0)
  );
}

export function isChoosing(
  phase: string
): boolean {
  return phase === "choosing";
}

export function hasChosen(
  lastChoice: string | null,
  selectedChoice: string | null
): boolean {
  return Boolean(
    lastChoice || selectedChoice
  );
}

export function getEventQuestion(
  event: {
    question?: string | null;
    title?: string | null;
  } | null
): string {
  if (event?.question?.trim()) {
    return event.question;
  }

  if (event?.title?.trim()) {
    return `Bạn sẽ làm gì trong tình huống "${event.title}"?`;
  }

  return "Bạn sẽ làm gì?";
}