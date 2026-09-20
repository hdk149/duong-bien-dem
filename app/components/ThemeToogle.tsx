"use client";

import { useTheme } from "./ThemeProvider";

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      aria-label="Đổi giao diện"
      className="
        flex
        items-center
        gap-2
        rounded-xl
        border
        border-black/10
        bg-white
        px-4
        py-2
        text-sm
        font-medium
        text-black
        shadow-sm
        transition-all
        hover:scale-105
        dark:border-white/10
        dark:bg-white/10
        dark:text-white
      "
    >
      {theme === "dark" ? (
        <>
          ☀️
          <span>Light</span>
        </>
      ) : (
        <>
          🌙
          <span>Dark</span>
        </>
      )}
    </button>
  );
}