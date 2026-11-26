"use client";

/**
 * The chat with Padi (redesigned 26 Nov 2026).
 *
 *   Empty chat   a welcome panel with six idea cards (tap one to fill the box)
 *   Messages     yours on the right in violet; Padi's on the left with its avatar. When Padi
 *                wrote a post, a rich card follows: a mini flyer in the brand colours, the
 *                Instagram caption's first lines, the platforms it wrote for, and "Open post".
 *   While waiting  your message shows at once with a "Padi is writing" bubble
 *   Composer     a floating box with a glowing border on focus; Enter sends, Shift+Enter = new line
 */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Icon, type IconName } from "@/components/icons";
import { LogoMark } from "@/components/logo";
import type { Flyer, Platform } from "@/lib/padi/types";
import { cn } from "@/lib/utils";
import { sendChat } from "./actions";

export type ChatPost = { id: string; topic: string; flyer: Flyer; captions: Partial<Record<Platform, string>> };
export type ChatMessage = { id: string; role: "user" | "assistant"; content: string; post?: ChatPost | null };

const IDEAS: Array<{ icon: IconName; title: string; prompt: string }> = [
  { icon: "zap", title: "Weekend promo", prompt: "Make a promo post for this weekend" },
  { icon: "sparkle", title: "New arrival", prompt: "Announce a new product we just got in stock" },
  { icon: "info", title: "Helpful tip", prompt: "Write a useful tip my customers would love and save" },
  { icon: "users", title: "Behind the scenes", prompt: "A behind-the-scenes post showing how we work" },
  { icon: "chat", title: "Ask a question", prompt: "An engagement post that gets people commenting" },
  { icon: "party", title: "December special", prompt: "A December special offer post" },
];

const PLATFORM_LABEL: Record<Platform, string> = { instagram: "IG", facebook: "FB", linkedin: "in", x: "X", tiktok: "TT", whatsapp: "WA" };

function PadiAvatar() {
  return <LogoMark tile product="padi" className="h-8 w-8 shrink-0" />;
}

/** The rich card under Padi's reply when it produced a post. */
function PostCard({ post, base, colors, brandName }: { post: ChatPost; base: string; colors: { primary: string; accent: string }; brandName: string }) {
  const first = post.captions.instagram || post.captions.facebook || Object.values(post.captions)[0] || "";
  return (
    <Link href={`${base}/posts/${post.id}`}
      className="group mt-2 flex max-w-md gap-3 overflow-hidden rounded-2xl border border-slate-200 bg-surface p-3 transition duration-300 hover:-translate-y-0.5 hover:border-[#a996ff] hover:shadow-[0_18px_40px_-24px_rgba(106,76,245,0.55)]">
      {/* Mini flyer */}
      <span className="flex aspect-[4/5] w-24 shrink-0 flex-col justify-between rounded-xl p-2 text-white transition duration-500 group-hover:scale-[1.03]" style={{ background: colors.primary }}>
        <b className="text-[0.45rem] tracking-[0.14em] opacity-90">{brandName.toUpperCase().slice(0, 18)}</b>
        <span className="text-[0.72rem] leading-tight font-semibold">{post.flyer.headline || post.topic}</span>
        {post.flyer.cta && (
          <span className="w-fit rounded-full px-1.5 py-0.5 text-[0.45rem] font-bold" style={{ background: colors.accent, color: "#15123a" }}>{post.flyer.cta}</span>
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <b className="truncate text-[0.9rem] text-slate-900">{post.topic}</b>
        <span className="mt-1 line-clamp-3 text-[0.8rem] text-slate-600">{first}</span>
        <span className="mt-auto flex items-center justify-between pt-2">
          <span className="flex gap-1">
            {(Object.keys(post.captions) as Platform[]).map((p) => (
              <span key={p} className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[0.62rem] font-semibold text-slate-600">{PLATFORM_LABEL[p]}</span>
            ))}
          </span>
          <span className="flex items-center gap-1 text-[0.78rem] font-medium text-brand-700">
            Open post <Icon name="arrowRight" className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
          </span>
        </span>
      </span>
    </Link>
  );
}

function Send({ pending }: { pending: boolean }) {
  return (
    <button type="submit" disabled={pending} aria-label="Send"
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#6a4cf5] text-white shadow-[0_8px_20px_-8px_rgba(106,76,245,0.8)] transition hover:-translate-y-px hover:bg-[#5b3ee6] disabled:opacity-50">
      <Icon name="send" className="h-[1.1rem] w-[1.1rem]" />
    </button>
  );
}

function Pending({ text }: { text: string }) {
  if (!text) return null;
  return (
    <>
      <li className="ml-auto max-w-[80%] rounded-2xl rounded-br-md bg-[#6a4cf5] px-4 py-2.5 text-[0.92rem] text-white opacity-70">{text}</li>
      <li className="flex items-end gap-2.5">
        <PadiAvatar />
        <span className="flex items-center gap-2 rounded-2xl rounded-bl-md bg-surface px-4 py-3 text-sm text-slate-500 ring-1 ring-slate-200">
          <span className="flex gap-1">
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#6a4cf5] [animation-delay:-0.2s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#6a4cf5] [animation-delay:-0.1s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#6a4cf5]" />
          </span>
          Padi is writing your post
        </span>
      </li>
    </>
  );
}

export function Chat({
  messages,
  base,
  ready,
  colors,
  brandName,
}: {
  messages: ChatMessage[];
  base: string;
  ready: boolean;
  colors: { primary: string; accent: string };
  brandName: string;
}) {
  // The conversation lives here: starts with what the server rendered, then grows as replies come back.
  const [list, setList] = useState<ChatMessage[]>(messages);
  const [text, setText] = useState("");
  const [sent, setSent] = useState(""); // the message being answered right now
  const [error, setError] = useState("");
  const end = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);

  useEffect(() => end.current?.scrollIntoView({ block: "end", behavior: "smooth" }), [list.length, sent]);

  // Grow the box with the text, up to about 6 lines.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [text]);

  const send = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const msg = text.trim();
    if (!msg || sent) return;
    setError("");
    setSent(msg);
    setText("");
    try {
      const res = await sendChat(msg);
      if (res.ok) {
        setList((l) => [...l, { id: res.user.id, role: "user", content: res.user.content }, { id: res.reply.id, role: "assistant", content: res.reply.content, post: res.reply.post }]);
      } else {
        setError(res.error);
        setText(msg); // give the message back so nothing is lost
      }
    } catch {
      setError("Couldn't reach Padi. Check your internet and try again.");
      setText(msg);
    } finally {
      setSent("");
    }
  };

  return (
    <form onSubmit={send} className="relative flex h-[calc(100dvh-10.5rem)] min-h-[30rem] flex-col overflow-hidden rounded-3xl border border-slate-200 bg-[#fbfbfe] dark:bg-raised">
      <ul className="flex-1 space-y-4 overflow-y-auto px-4 pt-5 pb-36 sm:px-6" aria-live="polite">
        {list.length === 0 && !sent && (
          <li className="mx-auto max-w-2xl pt-4">
            <div className="relative overflow-hidden rounded-3xl bg-[#15123a] p-6 text-white sm:p-8">
              <span className="pointer-events-none absolute -top-16 -right-10 h-56 w-56 rounded-full bg-[#6a4cf5] opacity-50 blur-3xl" aria-hidden="true" />
              <span className="pointer-events-none absolute -bottom-20 left-10 h-40 w-40 rounded-full bg-[#f2a93b] opacity-20 blur-3xl" aria-hidden="true" />
              <div className="relative flex items-center gap-3">
                <LogoMark tile product="padi" className="h-11 w-11" />
                <div>
                  <h2 className="text-xl font-semibold">What should we post today?</h2>
                  <p className="text-sm text-white/60">Pick an idea or tell me in your own words.</p>
                </div>
              </div>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {IDEAS.map((i) => (
                <button key={i.title} type="button" onClick={() => { setText(i.prompt); box.current?.focus(); }}
                  className="group flex items-start gap-3 rounded-2xl border border-slate-200 bg-surface p-4 text-left transition duration-300 hover:-translate-y-0.5 hover:border-[#a996ff] hover:shadow-[0_18px_40px_-26px_rgba(106,76,245,0.6)]">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#f3f0ff] text-[#6a4cf5] transition duration-300 group-hover:-rotate-6 group-hover:bg-[#6a4cf5] group-hover:text-white">
                    <Icon name={i.icon} className="h-[1.1rem] w-[1.1rem]" />
                  </span>
                  <span>
                    <b className="block text-[0.9rem] text-slate-900">{i.title}</b>
                    <span className="text-[0.8rem] text-slate-500">{i.prompt}</span>
                  </span>
                </button>
              ))}
            </div>
          </li>
        )}

        {list.map((m) =>
          m.role === "user" ? (
            <li key={m.id} className="ml-auto max-w-[80%] rounded-2xl rounded-br-md bg-[#6a4cf5] px-4 py-2.5 text-[0.92rem] whitespace-pre-wrap text-white shadow-[0_10px_24px_-16px_rgba(106,76,245,0.9)]">
              {m.content}
            </li>
          ) : (
            <li key={m.id} className="flex items-start gap-2.5">
              <PadiAvatar />
              <div className="min-w-0 max-w-[85%]">
                <p className="rounded-2xl rounded-tl-md bg-surface px-4 py-2.5 text-[0.92rem] whitespace-pre-wrap text-slate-800 ring-1 ring-slate-200">{m.content}</p>
                {m.post && <PostCard post={m.post} base={base} colors={colors} brandName={brandName} />}
              </div>
            </li>
          ),
        )}
        <Pending text={sent} />
        <div ref={end} />
      </ul>

      {/* Floating composer */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#fbfbfe] via-[#fbfbfe]/95 to-transparent px-3 pt-10 pb-3 sm:px-5 sm:pb-5 dark:from-raised dark:via-raised/95">
        <div className="pointer-events-auto mx-auto max-w-3xl">
          {error && <p role="alert" className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          {!ready && <p className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">Padi is being switched on. Set up your brand meanwhile.</p>}
          <div className="flex items-end gap-2 rounded-2xl border border-slate-200 bg-surface p-2 shadow-[0_20px_50px_-30px_rgba(21,18,58,0.5)] transition focus-within:border-[#a996ff] focus-within:shadow-[0_0_0_4px_rgba(106,76,245,0.12),0_20px_50px_-30px_rgba(21,18,58,0.5)]">
            <textarea
              ref={box}
              name="message"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              rows={1}
              maxLength={2000}
              placeholder="Tell Padi what's new, e.g. new wigs in stock, ₦45k, post for Friday"
              className="max-h-40 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-[0.94rem] text-slate-900 outline-none placeholder:text-slate-400"
            />
            <Send pending={Boolean(sent)} />
          </div>
          <p className="mt-1.5 text-center text-[0.7rem] text-slate-400">Padi never invents prices or reviews. Check every post before you share it.</p>
        </div>
      </div>
    </form>
  );
}
