"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";

type Theme = "dark" | "light";

type ThemeContextType = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextType | undefined>(
  undefined
);

const STORAGE_KEY = "duong-bien-dem-theme";

export function ThemeProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [theme, setThemeState] = useState<Theme>("dark");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);

      if (saved === "light" || saved === "dark") {
        setThemeState(saved);
      } else {
        setThemeState("dark");
      }
    } catch {
      setThemeState("dark");
    }

    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;

    const root = document.documentElement;

    root.classList.remove("light", "dark");
    root.classList.add(theme);
    root.style.colorScheme = theme;

    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch {}
  }, [theme, ready]);

  function setTheme(nextTheme: Theme) {
    setThemeState(nextTheme);
  }

  function toggleTheme() {
    setThemeState((current) =>
      current === "dark" ? "light" : "dark"
    );
  }

  return (
    <ThemeContext.Provider
      value={{
        theme,
        setTheme,
        toggleTheme,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error(
      "useTheme must be used inside ThemeProvider"
    );
  }

  return context;
}