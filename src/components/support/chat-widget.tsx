"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Loader2, MessageCircle, Send, X } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";
import { postChatMessage } from "@/app/(app)/support/actions";
import { cn } from "@/lib/utils";

type Msg = { id: string; body: string; fromStaff: boolean; author: string; at: string };
const OPEN_EVENT = "orb:open-chat";
const POLL_MS = 4000;

/** Button that opens the chat panel from anywhere on the page. */
export function OpenChatButton() {
  return (
    <button type="button" onClick={() => window.dispatchEvent(new Event(OPEN_EVENT))} className={buttonClasses()}>
      <MessageCircle className="h-4 w-4" /> Live chat
    </button>
  );
}

/**
 * Floating live-chat panel for signed-in customers. Polls for new messages
 * every few seconds while open (and only while open, so an idle tab doesn't
 * keep the session alive or load the server).
 */
export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [pending, startTransition] = useTransition();
  const listRef = useRef<HTMLOListElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/support/chat", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { messages: Msg[] };
      setMessages(data.messages);
      setLoaded(true);
    } catch {
      /* offline: next poll retries */
    }
  }, []);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(OPEN_EVENT, onOpen);
    if (new URLSearchParams(window.location.search).get("chat") === "1") onOpen();
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, []);

  useEffect(() => {
    if (!open) return;
    const first = setTimeout(load, 0);
    const id = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, POLL_MS);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [open, load]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages.length, open]);

  const send = () => {
    const body = draft.trim();
    if (!body) return;
    setError(null);
    startTransition(async () => {
      const res = await postChatMessage(body);
      if (res.error) setError(res.error);
      else {
        setDraft("");
        await load();
      }
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Close chat" : "Chat with support"}
        aria-expanded={open}
        className="bg-brand fixed right-4 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-40 grid h-14 w-14 place-items-center rounded-full text-white shadow-[0_8px_30px_-8px_var(--glow-violet)] transition-transform hover:scale-105 md:right-6 md:bottom-6"
      >
        {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
      </button>
      {open && (
        <section
          role="dialog"
          aria-label="Chat with Trade In Orbit support"
          className="fixed inset-x-3 bottom-[calc(9.75rem+env(safe-area-inset-bottom))] z-40 flex max-h-[60dvh] flex-col overflow-hidden rounded-2xl border border-line bg-bg shadow-2xl sm:left-auto sm:w-96 md:right-6 md:bottom-24"
        >
          <header className="bg-brand px-4 py-3 text-white">
            <p className="font-semibold">Trade In Orbit support</p>
            <p className="text-xs text-white/80">We usually reply within a few minutes during business hours.</p>
          </header>
          <ol ref={listRef} className="flex-1 space-y-2 overflow-y-auto p-3 text-sm" aria-live="polite" data-testid="chat-messages">
            {!loaded ? (
              <li className="flex justify-center py-6 text-muted">
                <Loader2 className="h-5 w-5 animate-spin" />
              </li>
            ) : messages.length === 0 ? (
              <li className="py-6 text-center text-muted">Hi! How can we help? Ask anything about your account.</li>
            ) : (
              messages.map((m) => (
                <li key={m.id} className={cn("flex", m.fromStaff ? "justify-start" : "justify-end")}>
                  <div
                    className={cn(
                      "max-w-[85%] rounded-2xl px-3 py-2",
                      m.fromStaff ? "rounded-bl-md border border-line bg-surface" : "bg-brand rounded-br-md text-white",
                    )}
                  >
                    {m.fromStaff && <p className="text-[11px] text-muted">{m.author}</p>}
                    <p className="break-words whitespace-pre-wrap">{m.body}</p>
                  </div>
                </li>
              ))
            )}
          </ol>
          {error && (
            <p role="alert" className="px-3 pb-1 text-xs text-down">
              {error}
            </p>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
            className="flex items-end gap-2 border-t border-line p-2"
          >
            <label htmlFor="chat-input" className="sr-only">
              Message
            </label>
            <textarea
              id="chat-input"
              rows={1}
              maxLength={4000}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder="Type a message"
              className="max-h-32 min-h-10 flex-1 resize-none rounded-xl border border-line-strong bg-surface px-3 py-2 text-base outline-none focus:border-accent sm:text-sm"
            />
            <button
              type="submit"
              disabled={pending || !draft.trim()}
              aria-label="Send"
              className="bg-brand grid h-10 w-10 shrink-0 place-items-center rounded-xl text-white disabled:opacity-50"
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </form>
        </section>
      )}
    </>
  );
}
