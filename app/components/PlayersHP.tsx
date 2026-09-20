"use client";

type PlayerHPProps = {
  hp: number;
  showValue?: boolean;
  className?: string;
};

export default function PlayerHP({
  hp,
  showValue = true,
  className = "",
}: PlayerHPProps) {
  const safeHP = Math.max(
    0,
    Math.min(100, hp)
  );

  return (
    <div className={className}>
      <div className="flex items-center justify-between text-sm">
        <span className="text-zinc-500">
          ❤️ HP
        </span>

        {showValue && (
          <span className="font-bold">
            {safeHP}
          </span>
        )}
      </div>

      <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-900">
        <div
          className="h-full rounded-full bg-green-500 transition-all duration-500 ease-out"
          style={{
            width: `${safeHP}%`,
          }}
        />
      </div>
    </div>
  );
}