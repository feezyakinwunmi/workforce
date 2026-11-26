"use client";

/**
 * The chat with Padi. Messages are rendered by the server (page.tsx) and passed in; sending
 * runs the sendMessage action, which saves both sides and refreshes the page.
 * While Padi is thinking, the typed message shows at once (faded) with a "writing…" bubble.
 */
import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Icon } from "@/components/icons";
import { cn } from "@/lib/utils";
import { sendMessage, type ChatState } from "./actions";

export type ChatMessage = { id: string; role: "user" | "assistant"; content: string; post?: { id: string; topic: string } | null };

/** Quick starts shown under an empty chat (and above the box). */
const STARTERS = [
  "Post for this weekend",
  "Announce a new product",
  "A tip my customers would love",
  "December promo idea",
  "Behind the scenes post",
];

function Send() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} aria-label="Send" className="btn-primary h-11 w-11 shrink-0 rounded-xl p-0">
      <Icon name="send" className="h-5 w-5" />
    </button>
  );
}

/** Shows the person's message + "Padi is writing…" while the action runs. */
function Pending({ text }: { text: string }) {
  const { pending } = useFormStatus();
  if (!pending || !text) return null;
  return (
    <>
      <li className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-brand-600 px-4 py-2.5 text-sm text-white opacity-70">{text}</li>
      <li className="flex max-w-[85%] items-center gap-2 rounded-2xl rounded-bl-md bg-slate-100 px-4 py-3 text-sm text-slate-500">
        <span className="flex gap-1">
          <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.2s]" />
          <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.1s]" />
          <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400" />
        </span>
        Padi is writing…
      </li>
    </>
  );
}

export function Chat({ messages, base, ready }: { messages: ChatMessage[]; base: string; ready: boolean }) {
  const [state, action] = useActionState<ChatState, FormData>(sendMessage, undefined);
  const [text, setText] = useState("");
  const [sent, setSent] = useState("");
  const end = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);

  // Keep the newest message in view.
  useEffect(() => end.current?.scrollIntoView({ block: "end" }), [messages.length, sent]);
  // Clear the box once the server answered.
  useEffect(() => {
    if (state?.at) setSent("");
  }, [state?.at]);

  const submit = (fd: FormData) => {
    setSent(String(fd.get("message") ?? ""));
    setText("");
    return action(fd);
  };

  return (
    <form action={submit} className="card flex h-[calc(100dvh-13rem)] min-h-[28rem] flex-col">
      <ul className="flex-1 space-y-3 overflow-y-auto p-4 sm:p-5" aria-live="polite">
        {messages.length === 0 && (
          <li className="mx-auto max-w-md py-10 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
              <Icon name="sparkle" className="h-6 w-6" />
            </span>
            <p className="mt-3 font-semibold text-slate-900">What should we post?</p>
            <p className="mt-1 text-sm text-slate-500">Tell Padi in your own words. It writes the captions, the flyer and picks a time.</p>
          </li>
        )}
        {messages.map((m) => (
          <li
            key={m.id}
            className={cn(
              "max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm",
              m.role === "user" ? "ml-auto rounded-br-md bg-brand-600 text-white" : "rounded-bl-md bg-slate-100 text-slate-800",
            )}
          >
            {m.content}
            {m.post && (
              <Link
                href={`${base}/posts/${m.post.id}`}
                className="mt-2 flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-surface px-3 py-2 text-slate-800 transition hover:border-brand-400"
              >
                <span className="min-w-0 truncate font-medium">{m.post.topic}</span>
                <span className="flex shrink-0 items-center gap-1 text-xs text-brand-700">
                  Open post <Icon name="arrowRight" className="h-3.5 w-3.5" />
                </span>
              </Link>
            )}
          </li>
        ))}
        <Pending text={sent} />
        <div ref={end} />
      </ul>

      <div className="border-t border-slate-200 p-3 sm:p-4">
        {state?.error && <p role="alert" className="mb-2 text-sm text-red-600">{state.error}</p>}
        {!ready && <p className="mb-2 text-sm text-amber-700">Padi's brain is being switched on. You can set up your brand meanwhile.</p>}
        <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
          {STARTERS.map((s) => (
            <button key={s} type="button" onClick={() => { setText(s); box.current?.focus(); }}
              className="shrink-0 rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600 transition hover:border-brand-400 hover:text-brand-700">
              {s}
            </button>
          ))}
        </div>
        <div className="flex items-end gap-2">
          <textarea
            ref={box}
            name="message"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              // Enter sends, Shift+Enter adds a new line (like WhatsApp Web).
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (text.trim()) e.currentTarget.form?.requestSubmit();
              }
            }}
            rows={1}
            maxLength={2000}
            placeholder="e.g. We have new wigs in stock, ₦45k, make a post for Friday"
            className="input max-h-40 min-h-11 flex-1 resize-none py-2.5"
          />
          <Send />
        </div>
      </div>
    </form>
  );
}
