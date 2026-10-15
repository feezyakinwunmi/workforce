"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/icons";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type State = "loading" | "unsupported" | "ios-install" | "blocked" | "off" | "on";

function keyToBytes(key: string) {
  const pad = "=".repeat((4 - (key.length % 4)) % 4);
  const raw = atob((key + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/**
 * Turn phone / browser notifications on for this device (Web Push). Clock-in reminders,
 * messages and tasks then arrive even when Workbase isn't open.
 */
export function PushToggle({ compact = false }: { compact?: boolean }) {
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
      const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        return alive && setState(ios && !standalone ? "ios-install" : "unsupported");
      }
      try {
        const reg = await navigator.serviceWorker.register("/sw.js");
        const sub = await reg.pushManager.getSubscription();
        if (!alive) return;
        if (Notification.permission === "denied") setState("blocked");
        else setState(sub ? "on" : "off");
      } catch {
        if (alive) setState("unsupported");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function turnOn() {
    setBusy(true);
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "blocked" : "off");
        return;
      }
      const res = await fetch("/api/push/key");
      const json = (await res.json()) as { publicKey?: string; error?: string };
      if (!json.publicKey) throw new Error(json.error ?? "Couldn't turn notifications on.");
      const reg = await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(json.publicKey) }));
      const keys = sub.toJSON().keys ?? {};
      const { error: err } = await createClient()
        .from("push_subscriptions")
        .insert({ endpoint: sub.endpoint, p256dh: keys.p256dh, auth: keys.auth, user_agent: navigator.userAgent.slice(0, 300) });
      if (err && err.code !== "23505") throw new Error(err.message);
      setState("on");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't turn notifications on.");
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await createClient().from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
        await sub.unsubscribe();
      }
      setState("off");
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    const reg = await navigator.serviceWorker.ready;
    await reg.showNotification("Time to clock in", {
      body: "This is how your reminders will look.",
      icon: "/icon-192.png",
      tag: "test",
      requireInteraction: false,
      // @ts-expect-error vibrate is supported by phones but missing from the TypeScript type
      vibrate: [400, 200, 400, 200, 400],
    });
  }

  if (state === "loading") return null;

  const text: Record<State, string> = {
    loading: "",
    unsupported: "This browser can't show notifications. Use Chrome, or add Workbase to your home screen.",
    "ios-install": "On iPhone, add Workbase to your home screen first (Share → Add to Home Screen), then open it from there to turn on reminders.",
    blocked: "Notifications are blocked for this site. Allow them in your browser's site settings, then come back.",
    off: "Get clock-in reminders, messages and tasks on this device, even when Workbase is closed.",
    on: "Reminders and messages come to this device.",
  };

  return (
    <div className={cn("flex flex-wrap items-center gap-3 text-sm", compact ? "card px-4 py-3" : "")}>
      <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", state === "on" ? "bg-emerald-50 text-emerald-600" : "bg-brand-50 text-brand-600 dark:text-brand-700")}>
        <Icon name="bell" />
      </span>
      <span className="min-w-0 flex-1 text-left text-slate-600">
        <span className="block font-medium text-slate-900">{state === "on" ? "Notifications are on" : "Notifications on this device"}</span>
        {text[state]}
        {error && <span className="block text-red-600">{error}</span>}
      </span>
      {state === "off" && (
        <button type="button" className="btn-primary btn-sm" onClick={turnOn} disabled={busy}>
          {busy ? "Turning on…" : "Turn on"}
        </button>
      )}
      {state === "on" && (
        <span className="flex gap-2">
          <button type="button" className="btn-secondary btn-sm" onClick={test}>Test</button>
          <button type="button" className="btn-ghost btn-sm" onClick={turnOff} disabled={busy}>Turn off</button>
        </span>
      )}
    </div>
  );
}
