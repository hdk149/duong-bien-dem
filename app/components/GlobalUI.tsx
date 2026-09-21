"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLanguage } from "./LanguageProvider";
import EndGameOverlay from "./EndGameOverlay";

export default function GlobalUI() {
  const pathname = usePathname();
  const { language } = useLanguage();

  const isVietnamese = language === "vi";
  const isSettingsPage = pathname === "/settings";

  return (
    <>
      {/* =================================================
          GLOBAL SETTINGS BUTTON
          ================================================= */}

      {!isSettingsPage && (
        <Link
          href="/settings"
          className="
            fixed
            right-4
            top-4
            z-50

            flex
            h-11
            w-11
            items-center
            justify-center

            rounded-full

            border
            border-border

            bg-card/90
            text-foreground

            text-xl

            shadow-lg
            backdrop-blur

            transition-all
            duration-200

            hover:bg-black/10
            hover:shadow-xl

            active:scale-95

            dark:hover:bg-white/10
          "
          aria-label={isVietnamese ? "Cài đặt" : "Settings"}
        >
          ⚙️
        </Link>
      )}

      {/* =================================================
          GLOBAL END GAME OVERLAY

          Luôn mount kể cả ở /settings.
          Overlay tự quyết định khi nào hiện.
          ================================================= */}

      <EndGameOverlay />
    </>
  );
}