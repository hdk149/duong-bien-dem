"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";

type Language = "vi" | "en";

type LanguageContextType = {
  language: Language;
  setLanguage: (language: Language) => void;
  ready: boolean;
};

const LanguageContext =
  createContext<LanguageContextType | undefined>(
    undefined
  );

const STORAGE_KEY = "language";

export function LanguageProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [language, setLanguageState] =
    useState<Language>("vi");

  const [ready, setReady] = useState(false);

  /* =========================
     LOAD SAVED LANGUAGE
  ========================= */

  useEffect(() => {
    try {
      const saved =
        window.localStorage.getItem(STORAGE_KEY);

      if (saved === "vi" || saved === "en") {
        setLanguageState(saved);
      } else {
        // Mặc định tiếng Việt
        setLanguageState("vi");
      }
    } catch {
      setLanguageState("vi");
    }

    setReady(true);
  }, []);

  /* =========================
     SYNC LANGUAGE BETWEEN TABS
  ========================= */

  useEffect(() => {
    function handleStorage(event: StorageEvent) {
      if (
        event.key !== STORAGE_KEY ||
        !event.newValue
      ) {
        return;
      }

      if (
        event.newValue === "vi" ||
        event.newValue === "en"
      ) {
        setLanguageState(event.newValue);
      }
    }

    window.addEventListener(
      "storage",
      handleStorage
    );

    return () => {
      window.removeEventListener(
        "storage",
        handleStorage
      );
    };
  }, []);

  /* =========================
     CHANGE LANGUAGE
  ========================= */

  function setLanguage(
    nextLanguage: Language
  ) {
    setLanguageState(nextLanguage);

    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        nextLanguage
      );
    } catch {}
  }

  return (
    <LanguageContext.Provider
      value={{
        language,
        setLanguage,
        ready,
      }}
    >
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);

  if (!context) {
    throw new Error(
      "useLanguage must be used inside LanguageProvider"
    );
  }

  return context;
}