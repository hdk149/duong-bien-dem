"use client";

import { useEffect, useRef, useState } from "react";

import {
  getRoomMessages,
  sendRoomMessage,
} from "@/lib/chat/messages";
import { subscribeToRoomChat } from "@/lib/chat/realtime";
import type { RoomMessage } from "@/lib/chat/types";

type RoomChatProps = {
  roomId: string;
  playerId: string;
  playerName: string;
  canSend?: boolean;
  isVietnamese?: boolean;
  onClose?: () => void;
};

const EMOJIS = [
  "😀", "😂", "🤣", "😊", "😍", "😎", "🤔", "😭",
  "😡", "💀", "❤️", "🖤", "💔", "👍", "🙏", "🔥",
  "🎉", "🎲", "💰", "🩸", "🚗", "🏠", "😮", "😅",
  "😈", "👀", "💪", "✨", "⚡", "❌", "✅", "❤️‍🔥",
];

export default function RoomChat({
  roomId,
  playerId,
  playerName,
  canSend = true,
  isVietnamese = true,
  onClose,
}: RoomChatProps) {
  const [messages, setMessages] = useState<RoomMessage[]>([]);
  const [text, setText] = useState("");
  const [showEmoji, setShowEmoji] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let mounted = true;

    async function loadMessages() {
      setLoading(true);
      setError("");

      try {
        const history = await getRoomMessages(roomId, 100);

        if (mounted) {
          setMessages(history.slice(-100));
        }
      } catch (err) {
        console.error("[ROOM CHAT] LOAD ERROR:", err);

        if (mounted) {
          setError(
            isVietnamese
              ? "Không thể tải tin nhắn."
              : "Unable to load messages."
          );
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    void loadMessages();

    const unsubscribe = subscribeToRoomChat(roomId, (message) => {
      if (!mounted) return;

      setMessages((current) => {
        if (current.some((item) => item.id === message.id)) {
          return current;
        }

        return [...current, message].slice(-100);
      });
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [roomId, isVietnamese]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "end",
    });
  }, [messages]);

  async function handleSend() {
    const message = text.trim();

    if (!canSend || !message || sending) return;

    if (message.length > 500) {
      setError(
        isVietnamese
          ? "Tin nhắn tối đa 500 ký tự."
          : "Messages are limited to 500 characters."
      );
      return;
    }

    try {
      setSending(true);
      setError("");

      const created = await sendRoomMessage(
        roomId,
        playerId,
        playerName,
        message
      );

      // Realtime may deliver the same INSERT immediately after this.
      // Keeping the local insert makes the UI feel instant; the id check
      // in the realtime handler prevents duplicates.
      setMessages((current) => {
        if (current.some((item) => item.id === created.id)) {
          return current;
        }

        return [...current, created].slice(-100);
      });

      setText("");
      setShowEmoji(false);
      inputRef.current?.focus();
    } catch (err) {
      console.error("[ROOM CHAT] SEND ERROR:", err);

      setError(
        err instanceof Error && err.message
          ? err.message
          : isVietnamese
            ? "Không thể gửi tin nhắn."
            : "Unable to send message."
      );
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(
    event: React.KeyboardEvent<HTMLInputElement>
  ) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void handleSend();
    }
  }

  function addEmoji(emoji: string) {
    setText((current) => {
      const next = `${current}${emoji}`;
      return next.slice(0, 500);
    });
    inputRef.current?.focus();
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-transparent">
      <div className="flex shrink-0 items-center justify-between border-b border-current/10 px-4 py-3">
        <div className="min-w-0">
          <div className="text-sm font-black">
            {isVietnamese ? "Chat phòng" : "Room chat"}
          </div>
          <div className="mt-0.5 text-[11px] opacity-60">
            {isVietnamese
              ? "Mọi người trong phòng đều thấy tin nhắn"
              : "Everyone in the room can see messages"}
          </div>
        </div>

        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label={isVietnamese ? "Đóng chat" : "Close chat"}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-current/10 text-xl transition hover:bg-current/5 active:scale-95"
          >
            ×
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {loading ? (
          <div className="py-10 text-center text-xs opacity-50">
            {isVietnamese ? "Đang tải tin nhắn..." : "Loading messages..."}
          </div>
        ) : messages.length === 0 ? (
          <div className="py-10 text-center text-xs opacity-50">
            {isVietnamese ? "Chưa có tin nhắn nào." : "No messages yet."}
          </div>
        ) : (
          <div className="space-y-2">
            {messages.map((message) => {
              const isMine = message.player_id === playerId;

              return (
                <div
                  key={message.id}
                  className={`flex ${
                    isMine ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={[
                      "max-w-[85%] rounded-2xl px-3 py-2",
                      isMine
                        ? "bg-[#b69c57]/20"
                        : "bg-current/5",
                    ].join(" ")}
                  >
                    <div className="flex items-center gap-2">
                      <div className="text-[11px] font-black">
                        {isMine
                          ? isVietnamese
                            ? "Bạn"
                            : "You"
                          : message.player_name}
                      </div>
                      <div className="text-[9px] opacity-40">
                        {new Date(message.created_at).toLocaleTimeString(
                          isVietnamese ? "vi-VN" : "en-US",
                          {
                            hour: "2-digit",
                            minute: "2-digit",
                          }
                        )}
                      </div>
                    </div>

                    <div className="mt-1 break-words text-sm leading-5">
                      {message.message}
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {error && (
        <div className="shrink-0 border-t border-current/10 px-3 py-2 text-xs text-[#b97969]">
          {error}
        </div>
      )}

      {canSend ? (
        <>
          {showEmoji && (
            <div className="shrink-0 border-t border-current/10 p-2">
              <div className="grid grid-cols-8 gap-1">
                {EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => addEmoji(emoji)}
                    className="rounded-lg p-2 text-lg transition hover:bg-current/5 active:scale-95"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          )}

          <form
            className="shrink-0 border-t border-current/10 p-2"
            onSubmit={(event) => {
              event.preventDefault();
              void handleSend();
            }}
          >
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowEmoji((value) => !value)}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-current/10 bg-current/5 text-lg transition hover:bg-current/10 active:scale-95"
                aria-label={isVietnamese ? "Emoji" : "Emoji"}
              >
                😊
              </button>

              <input
                ref={inputRef}
                value={text}
                onChange={(event) => setText(event.target.value.slice(0, 500))}
                onKeyDown={handleKeyDown}
                maxLength={500}
                placeholder={
                  isVietnamese ? "Nhắn gì đó..." : "Type a message..."
                }
                className="min-w-0 flex-1 rounded-xl border border-current/10 bg-current/5 px-3 py-2.5 text-sm outline-none placeholder:opacity-40 focus:border-[#b69c57]/60"
              />

              <button
                type="submit"
                disabled={!text.trim() || sending}
                className="h-10 shrink-0 rounded-xl bg-[#b69c57] px-4 text-sm font-black text-[#171613] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-30"
              >
                {sending
                  ? "…"
                  : isVietnamese
                    ? "Gửi"
                    : "Send"}
              </button>
            </div>
          </form>
        </>
      ) : (
        <div className="shrink-0 border-t border-current/10 px-4 py-3 text-center text-xs opacity-50">
          {isVietnamese
            ? "Khán giả có thể xem chat nhưng không thể gửi tin nhắn."
            : "Spectators can view chat but cannot send messages."}
        </div>
      )}
    </div>
  );
}
