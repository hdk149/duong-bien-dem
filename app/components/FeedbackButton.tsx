"use client";

import { useState } from "react";
import { useLanguage } from "./LanguageProvider";

type FeedbackType =
  | "Góp ý"
  | "Báo lỗi"
  | "Ý tưởng";

export default function FeedbackButton() {
  const { language } = useLanguage();
  const isVietnamese = language === "vi";

  const [open, setOpen] = useState(false);

  const [type, setType] =
    useState<FeedbackType>("Góp ý");

  const [name, setName] = useState("");
  const [message, setMessage] = useState("");

  const [website, setWebsite] = useState("");

  const [loading, setLoading] =
    useState(false);

  const [sent, setSent] =
    useState(false);

  const [error, setError] =
    useState("");

  const texts = isVietnamese
    ? {
        button: "Feedback",
        ariaButton: "Gửi feedback",

        title: "Feedback",
        subtitle:
          "Góp ý để Đường Biên Đêm tốt hơn.",
        close: "Đóng",

        typeLabel: "Loại feedback",
        suggestion: "Góp ý",
        bug: "Báo lỗi",
        idea: "Ý tưởng",

        name: "Tên",
        optional: "(không bắt buộc)",
        namePlaceholder: "Tên của bạn",

        content: "Nội dung",
        contentPlaceholder:
          "Bro muốn góp ý gì?",

        sending: "Đang gửi...",
        submit: "Gửi feedback",

        successTitle:
          "Đã gửi feedback!",
        successMessage:
          "Cảm ơn bro đã góp ý cho Đường Biên Đêm.",

        emptyMessage:
          "Vui lòng nhập nội dung feedback.",

        messageTooLong:
          "Feedback không được vượt quá 1000 ký tự.",

        nameTooLong:
          "Tên không được vượt quá 50 ký tự.",

        genericError:
          "Không thể gửi feedback.",
      }
    : {
        button: "Feedback",
        ariaButton: "Send feedback",

        title: "Feedback",
        subtitle:
          "Help make Đường Biên Đêm better.",
        close: "Close",

        typeLabel: "Feedback type",
        suggestion: "Suggestion",
        bug: "Bug report",
        idea: "Idea",

        name: "Name",
        optional: "(optional)",
        namePlaceholder: "Your name",

        content: "Message",
        contentPlaceholder:
          "What would you like to tell us?",

        sending: "Sending...",
        submit: "Send feedback",

        successTitle:
          "Feedback sent!",
        successMessage:
          "Thanks for helping us improve Đường Biên Đêm.",

        emptyMessage:
          "Please enter your feedback.",

        messageTooLong:
          "Feedback cannot exceed 1000 characters.",

        nameTooLong:
          "Name cannot exceed 50 characters.",

        genericError:
          "Could not send feedback.",
      };

  const feedbackTypes: {
    value: FeedbackType;
    label: string;
  }[] = [
    {
      value: "Góp ý",
      label: texts.suggestion,
    },
    {
      value: "Báo lỗi",
      label: texts.bug,
    },
    {
      value: "Ý tưởng",
      label: texts.idea,
    },
  ];

  function closeModal() {
    if (loading) return;

    setOpen(false);
    setError("");
  }

  function resetForm() {
    setType("Góp ý");
    setName("");
    setMessage("");
    setWebsite("");
    setError("");
  }

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    const cleanName = name.trim();
    const cleanMessage = message.trim();

    if (!cleanMessage) {
      setError(texts.emptyMessage);
      return;
    }

    if (cleanMessage.length > 1000) {
      setError(texts.messageTooLong);
      return;
    }

    if (cleanName.length > 50) {
      setError(texts.nameTooLong);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch(
        "/api/feedback",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            type,
            name: cleanName,
            message: cleanMessage,
            website: website.trim(),
          }),
        }
      );

      let data: {
        success?: boolean;
        error?: string;
      } = {};

      try {
        data = await response.json();
      } catch {
        data = {};
      }

      if (!response.ok) {
        throw new Error(
          data.error || texts.genericError
        );
      }

      setSent(true);

      window.setTimeout(() => {
        setSent(false);
        setOpen(false);
        resetForm();
      }, 1800);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : texts.genericError
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {/* FLOATING BUTTON */}

      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setError("");
        }}
        className="
          fixed bottom-5 right-5 z-40
          flex items-center gap-2
          rounded-full
          border border-border
          bg-card
          px-4 py-3
          text-sm font-black
          text-foreground
          shadow-lg
          transition-all
          hover:-translate-y-0.5
          hover:shadow-xl
          active:scale-95
          sm:bottom-6 sm:right-6
        "
        aria-label={texts.ariaButton}
      >
        <span className="text-lg">
          💬
        </span>

        <span className="hidden sm:inline">
          {texts.button}
        </span>
      </button>

      {/* MODAL */}

      {open && (
        <div
          className="
            fixed inset-0 z-50
            flex items-center justify-center
            bg-black/50
            px-4
            backdrop-blur-sm
          "
          onMouseDown={(event) => {
            if (
              event.target ===
              event.currentTarget
            ) {
              closeModal();
            }
          }}
        >
          <div
            className="
              w-full max-w-lg
              overflow-hidden
              rounded-[2rem]
              border border-border
              bg-card
              text-foreground
              shadow-2xl
            "
          >
            {/* HEADER */}

            <div
              className="
                flex items-center
                justify-between
                border-b border-border
                px-5 py-5
                sm:px-6
              "
            >
              <div>
                <div className="text-xl font-black">
                  💬 {texts.title}
                </div>

                <p className="mt-1 text-sm text-muted">
                  {texts.subtitle}
                </p>
              </div>

              <button
                type="button"
                onClick={closeModal}
                disabled={loading}
                className="
                  flex h-10 w-10
                  items-center justify-center
                  rounded-full
                  border border-border
                  text-xl font-bold
                  transition
                  hover:bg-black/5
                  disabled:opacity-40
                  dark:hover:bg-white/10
                "
                aria-label={texts.close}
              >
                ×
              </button>
            </div>

            {/* SUCCESS */}

            {sent ? (
              <div className="px-6 py-12 text-center">
                <div className="text-5xl">
                  ✅
                </div>

                <h2 className="mt-5 text-2xl font-black">
                  {texts.successTitle}
                </h2>

                <p className="mt-2 text-sm leading-6 text-muted">
                  {texts.successMessage}
                </p>
              </div>
            ) : (
              /* FORM */

              <form
                onSubmit={handleSubmit}
                className="space-y-5 p-5 sm:p-6"
              >
                {/* TYPE */}

                <div>
                  <label className="mb-2 block text-sm font-black">
                    {texts.typeLabel}
                  </label>

                  <div className="grid grid-cols-3 gap-2">
                    {feedbackTypes.map(
                      (item) => (
                        <button
                          key={item.value}
                          type="button"
                          disabled={loading}
                          onClick={() =>
                            setType(item.value)
                          }
                          className={`
                            rounded-2xl
                            border
                            px-3 py-3
                            text-sm font-bold
                            transition-all
                            disabled:opacity-50
                            ${
                              type === item.value
                                ? "border-foreground bg-foreground text-background"
                                : "border-border bg-background text-foreground hover:bg-black/5 dark:hover:bg-white/10"
                            }
                          `}
                        >
                          {item.label}
                        </button>
                      )
                    )}
                  </div>
                </div>

                {/* NAME */}

                <div>
                  <label
                    htmlFor="feedback-name"
                    className="
                      mb-2 block
                      text-sm font-black
                    "
                  >
                    {texts.name}

                    <span className="ml-1 font-normal text-muted">
                      {texts.optional}
                    </span>
                  </label>

                  <input
                    id="feedback-name"
                    type="text"
                    value={name}
                    onChange={(event) =>
                      setName(
                        event.target.value
                      )
                    }
                    placeholder={
                      texts.namePlaceholder
                    }
                    maxLength={50}
                    disabled={loading}
                    autoComplete="name"
                    className="
                      w-full
                      rounded-2xl
                      border border-border
                      bg-background
                      px-4 py-3.5
                      text-sm
                      text-foreground
                      outline-none
                      transition
                      placeholder:text-muted
                      focus:border-foreground
                      disabled:opacity-50
                    "
                  />
                </div>

                {/* MESSAGE */}

                <div>
                  <label
                    htmlFor="feedback-message"
                    className="
                      mb-2 block
                      text-sm font-black
                    "
                  >
                    {texts.content}
                  </label>

                  <textarea
                    id="feedback-message"
                    value={message}
                    onChange={(event) =>
                      setMessage(
                        event.target.value
                      )
                    }
                    placeholder={
                      texts.contentPlaceholder
                    }
                    maxLength={1000}
                    rows={5}
                    required
                    disabled={loading}
                    className="
                      w-full
                      resize-none
                      rounded-2xl
                      border border-border
                      bg-background
                      px-4 py-3.5
                      text-sm
                      leading-6
                      text-foreground
                      outline-none
                      transition
                      placeholder:text-muted
                      focus:border-foreground
                      disabled:opacity-50
                    "
                  />

                  <div className="mt-1 text-right text-xs text-muted">
                    {message.length}/1000
                  </div>
                </div>

                {/* HONEYPOT */}

                <input
                  type="text"
                  name="website"
                  value={website}
                  onChange={(event) =>
                    setWebsite(
                      event.target.value
                    )
                  }
                  tabIndex={-1}
                  autoComplete="off"
                  aria-hidden="true"
                  className="hidden"
                />

                {/* ERROR */}

                {error && (
                  <div
                    className="
                      rounded-2xl
                      border border-red-500/30
                      bg-red-500/10
                      px-4 py-3
                      text-sm
                      font-medium
                      text-red-500
                    "
                  >
                    ⚠️ {error}
                  </div>
                )}

                {/* SUBMIT */}

                <button
                  type="submit"
                  disabled={
                    loading ||
                    !message.trim()
                  }
                  className="
                    flex w-full
                    items-center
                    justify-center
                    gap-2
                    rounded-2xl
                    bg-foreground
                    px-5 py-4
                    text-base font-black
                    text-background
                    transition-all
                    hover:opacity-90
                    active:scale-[0.98]
                    disabled:cursor-not-allowed
                    disabled:opacity-40
                  "
                >
                  {loading ? (
                    <>
                      <span
                        className="
                          h-4 w-4
                          animate-spin
                          rounded-full
                          border-2
                          border-background/30
                          border-t-background
                        "
                      />

                      {texts.sending}
                    </>
                  ) : (
                    texts.submit
                  )}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}