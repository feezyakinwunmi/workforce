"use client";

import { useEffect, useRef } from "react";

/**
 * Cloudflare Turnstile: a free "are you human?" check. Most people never see it (it decides in the
 * background); a suspicious visitor gets a one-click box. It puts a hidden `cf-turnstile-response`
 * field into the surrounding form, which the server checks (lib/turnstile.ts).
 * Shows nothing when NEXT_PUBLIC_TURNSTILE_SITE_KEY isn't set (local development).
 * `resetKey`: change it after each submit (a token works only once).
 */
type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id: string) => void;
  remove: (id: string) => void;
};
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";
let loading: Promise<TurnstileApi> | null = null;

function loadScript(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true;
    s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("no turnstile")));
    s.onerror = () => {
      loading = null;
      reject(new Error("turnstile failed to load"));
    };
    document.head.appendChild(s);
  });
  return loading;
}

export const humanCheckEnabled = () => SITE_KEY !== "";

export function Turnstile({ resetKey, onToken, className }: { resetKey?: unknown; onToken?: (token: string | null) => void; className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const tokenCb = useRef(onToken);
  tokenCb.current = onToken;

  useEffect(() => {
    if (!SITE_KEY || !box.current) return;
    let alive = true;
    loadScript()
      .then((ts) => {
        if (!alive || !box.current || widget.current) return;
        widget.current = ts.render(box.current, {
          sitekey: SITE_KEY,
          appearance: "interaction-only", // only shows a box when Cloudflare wants a click
          theme: document.documentElement.classList.contains("dark") ? "dark" : "light",
          callback: (t: string) => tokenCb.current?.(t),
          "expired-callback": () => tokenCb.current?.(null),
          "error-callback": () => tokenCb.current?.(null),
        });
      })
      .catch(() => tokenCb.current?.(null));
    return () => {
      alive = false;
      if (widget.current) window.turnstile?.remove(widget.current);
      widget.current = null;
    };
  }, []);

  // A token can be used once: get a fresh one after every submit.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (widget.current) {
      tokenCb.current?.(null);
      window.turnstile?.reset(widget.current);
    }
  }, [resetKey]);

  if (!SITE_KEY) return null;
  return <div ref={box} className={className} />;
}
