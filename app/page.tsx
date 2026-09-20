"use client";

import Link from "next/link";
import { useLanguage } from "./components/LanguageProvider";
import FeedbackButton from "./components/FeedbackButton";

export default function Home() {
  const { language } = useLanguage();

  const isVietnamese = language === "vi";

  return (
    <main
      className="
        relative
        flex
        min-h-screen
        items-center
        justify-center
        overflow-hidden
        px-5
        py-10

        bg-[#eee9df]
        text-[#24221e]

        dark:bg-[#151412]
        dark:text-[#eee7d9]

        transition-colors
        duration-300
      "
    >
      {/* Light theme background */}
      <div
        className="
          pointer-events-none
          fixed
          inset-0
          bg-[radial-gradient(circle_at_50%_15%,rgba(139,110,62,0.12),transparent_34%),radial-gradient(circle_at_10%_90%,rgba(100,80,50,0.07),transparent_28%)]
          dark:hidden
        "
      />

      {/* Dark theme background */}
      <div
        className="
          pointer-events-none
          fixed
          inset-0
          hidden
          bg-[radial-gradient(circle_at_50%_15%,rgba(160,130,75,0.10),transparent_34%),radial-gradient(circle_at_10%_90%,rgba(120,70,50,0.07),transparent_28%)]
          dark:block
        "
      />

      {/* Light texture */}
      <div
        className="
          pointer-events-none
          fixed
          inset-0
          opacity-[0.035]
          [background-image:linear-gradient(rgba(60,50,40,0.35)_1px,transparent_1px),linear-gradient(90deg,rgba(60,50,40,0.25)_1px,transparent_1px)]
          [background-size:34px_34px]
          dark:hidden
        "
      />

      {/* Dark texture */}
      <div
        className="
          pointer-events-none
          fixed
          inset-0
          hidden
          opacity-[0.025]
          [background-image:linear-gradient(rgba(255,255,255,0.5)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.35)_1px,transparent_1px)]
          [background-size:34px_34px]
          dark:block
        "
      />

      {/* Settings */}
      <Link
        href="/settings"
        className="
          fixed
          right-4
          top-4
          z-50
          flex
          h-12
          w-12
          items-center
          justify-center
          rounded-full

          border
          border-[#c9c1b3]
          bg-[#f8f5ef]
          text-xl
          text-[#302d27]
          shadow-[0_6px_20px_rgba(70,55,35,0.12)]

          dark:border-[#454139]
          dark:bg-[#211f1b]
          dark:text-[#e6dfd1]
          dark:shadow-[0_8px_25px_rgba(0,0,0,0.35)]

          transition-all
          duration-200

          hover:bg-[#e9e3d8]
          dark:hover:bg-[#2b2822]

          active:scale-95
        "
        aria-label={
          isVietnamese
            ? "Cài đặt"
            : "Settings"
        }
      >
        ⚙️
      </Link>

      {/* Feedback */}
      <FeedbackButton />

      {/* Main content */}
      <div className="relative w-full max-w-md text-center">

        {/* Header */}
        <p
          className="
            text-sm
            font-semibold
            tracking-wide

            text-[#6c665d]
            dark:text-[#9b9589]
          "
        >
          Multiplayer AI RPG
        </p>

        {/* Title */}
        <h1
          className="
            mt-5
            text-5xl
            font-bold
            leading-tight
            tracking-tight
            sm:text-6xl

            text-[#24221e]
            dark:text-[#eee7d9]
          "
        >
          {isVietnamese
            ? "Đường Biên Đêm"
            : "Night Border"}
        </h1>

        {/* Decorative divider */}
        <div className="mx-auto mt-6 flex items-center justify-center gap-3">
          <span
            className="
              h-px
              w-12
              bg-[#b6ad9f]
              dark:bg-[#514a3e]
            "
          />

          <span
            className="
              h-2
              w-2
              rotate-45
              border
              border-[#8b734d]
              dark:border-[#a58a59]
            "
          />

          <span
            className="
              h-px
              w-12
              bg-[#b6ad9f]
              dark:bg-[#514a3e]
            "
          />
        </div>

        {/* Description */}
        <p
          className="
            mx-auto
            mt-6
            max-w-sm
            text-base
            font-medium
            leading-7
            sm:text-lg

            text-[#555047]
            dark:text-[#aaa397]
          "
        >
          {isVietnamese
            ? "Một chuyến đi không biết trước điểm dừng."
            : "A journey with no certain destination."}
        </p>

        <p
          className="
            mt-2
            text-sm
            font-medium
            italic

            text-[#777066]
            dark:text-[#817a70]
          "
        >
          {isVietnamese
            ? "Mỗi lựa chọn đều có giá của nó."
            : "Every choice comes with a price."}
        </p>

        {/* Buttons */}
        <div className="mt-10 space-y-3.5">

          {/* Create room */}
          <Link
            href="/create-room"
            className="
              flex
              min-h-[60px]
              w-full
              items-center
              justify-center
              gap-3
              rounded-2xl
              border
              px-5
              py-4
              text-lg
              font-bold
              shadow-md
              transition-all
              duration-200
              active:scale-[0.98]

              border-[#89734d]
              bg-[#806b48]
              text-[#181612]

              hover:bg-[#927d56]
            "
          >
            <span className="text-lg">
              🚗
            </span>

            <span>
              {isVietnamese
                ? "Tạo phòng"
                : "Create Room"}
            </span>

            <span className="ml-1 text-xl opacity-60">
              →
            </span>
          </Link>

          {/* Join room */}
          <Link
            href="/join-room"
            className="
              flex
              min-h-[60px]
              w-full
              items-center
              justify-center
              gap-3
              rounded-2xl
              border
              px-5
              py-4
              text-lg
              font-semibold
              shadow-sm
              transition-all
              duration-200
              active:scale-[0.98]

              border-[#c9c1b3]
              bg-[#f8f5ef]
              text-[#292620]

              hover:bg-[#e9e4da]

              dark:border-[#454139]
              dark:bg-[#211f1b]
              dark:text-[#ddd5c6]

              dark:hover:bg-[#2b2822]
            "
          >
            <span className="text-lg">
              🎒
            </span>

            <span>
              {isVietnamese
                ? "Tham gia phòng"
                : "Join Room"}
            </span>

            <span
              className="
                ml-1
                text-xl

                text-[#777066]
                dark:text-[#686158]
              "
            >
              →
            </span>
          </Link>

          {/* Spectate */}
          <Link
            href="/spectate"
            className="
              flex
              min-h-[56px]
              w-full
              items-center
              justify-center
              gap-3
              rounded-2xl
              border
              bg-transparent
              px-5
              py-3.5
              text-base
              font-semibold
              transition-all
              duration-200
              active:scale-[0.98]

              border-[#d0c8ba]
              text-[#625d54]

              hover:bg-[#e5dfd4]
              hover:text-[#292620]

              dark:border-[#35332e]
              dark:text-[#827c71]

              dark:hover:bg-[#1c1b18]
              dark:hover:text-[#aaa397]
            "
          >
            <span className="text-base">
              👁
            </span>

            <span>
              {isVietnamese
                ? "Xem phòng"
                : "Spectate"}
            </span>

            <span
              className="
                ml-1
                text-xl

                text-[#9a9287]
                dark:text-[#555149]
              "
            >
              →
            </span>
          </Link>

        </div>

        {/* Game info */}
        <div
          className="
            mt-9
            border-t
            pt-5

            border-[#d2cabc]
            dark:border-[#302e29]
          "
        >
          <p
            className="
              text-sm
              font-medium
              leading-6

              text-[#6c665d]
              dark:text-[#817b72]
            "
          >
            {isVietnamese
              ? "1–4 người chơi • AI Game Master • Realtime"
              : "1–4 players • AI Game Master • Realtime"}
          </p>
        </div>

        {/* Footer */}
        <p
          className="
            mt-4
            text-xs
            font-medium

            text-[#888075]
            dark:text-[#625d55]
          "
        >
          © 2026 Khoa Hoàng · Đường Biên Đêm
        </p>

      </div>
    </main>
  );
}