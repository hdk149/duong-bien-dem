"use client";

import { useEffect, useState } from "react";

type ShopTimerProps = {
  duration?: number;
  onExpire: () => void;
};

export default function ShopTimer({
  duration = 85,
  onExpire,
}: ShopTimerProps) {
  const [timeLeft, setTimeLeft] = useState(duration);

  useEffect(() => {
    setTimeLeft(duration);

    const interval = window.setInterval(() => {
      setTimeLeft((current) => {
        if (current <= 1) {
          window.clearInterval(interval);
          onExpire();
          return 0;
        }

        return current - 1;
      });
    }, 1000);

    return () => {
      window.clearInterval(interval);
    };
  }, [duration, onExpire]);

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;

  return (
    <div className="flex items-center justify-center">
      <div className="rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-center">
        <div className="text-[10px] uppercase tracking-[0.2em] text-white/50">
          Thời gian còn lại
        </div>

        <div className="mt-1 font-mono text-2xl font-bold text-white">
          {minutes}:{seconds.toString().padStart(2, "0")}
        </div>
      </div>
    </div>
  );
}