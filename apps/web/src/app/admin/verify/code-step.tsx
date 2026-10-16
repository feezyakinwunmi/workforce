"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { InfoTip } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";

type Stage =
  | { kind: "loading" }
  | { kind: "setup"; factorId: string; qr: string; secret: string }
  | { kind: "code"; factorId: string }
  | { kind: "error"; message: string };

type Factor = { id: string; status: string; factor_type: string };

/** Supabase gives the QR as SVG, sometimes raw inside a data: link; encode it so every browser shows it. */
const qrSrc = (qr: string) => {
  const svg = qr.startsWith("data:") ? (qr.includes(",<") ? qr.slice(qr.indexOf(",") + 1) : null) : qr;
  return svg === null ? qr : `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
};

/** Set up an authenticator app (first time), or type its 6-digit code. */
export function CodeStep({ home, expired, hours }: { home: string; expired: boolean; hours: number }) {
  const [stage, setStage] = useState<Stage>({ kind: "loading" });
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSecret, setShowSecret] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const start = useCallback(async () => {
    const supabase = createClient();
    const { data, error: e } = await supabase.auth.mfa.listFactors();
    if (e) return setStage({ kind: "error", message: e.message });
    const verified = (data.totp as Factor[]).find((f) => f.status === "verified");
    if (verified) return setStage({ kind: "code", factorId: verified.id });
    // First time: clear half-finished set-ups, then make a new one.
    for (const f of (data.all as Factor[]).filter((f) => f.factor_type === "totp" && f.status !== "verified")) {
      await supabase.auth.mfa.unenroll({ factorId: f.id });
    }
    const { data: en, error: e2 } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: `Workbase Console ${new Date().toISOString().slice(0, 16)}`,
      issuer: "Workbase Console",
    });
    if (e2 || !en) return setStage({ kind: "error", message: e2?.message ?? "Couldn't start the set-up." });
    setStage({ kind: "setup", factorId: en.id, qr: en.totp.qr_code, secret: en.totp.secret });
  }, []);

  useEffect(() => {
    void start();
  }, [start]);

  useEffect(() => {
    if (stage.kind === "code" || stage.kind === "setup") input.current?.focus();
  }, [stage.kind]);

  async function submit(value = code) {
    if (stage.kind !== "code" && stage.kind !== "setup") return;
    if (!/^\d{6}$/.test(value)) return setError("Type the 6 numbers from the app.");
    setBusy(true);
    setError(null);
    const { error: e } = await createClient().auth.mfa.challengeAndVerify({ factorId: stage.factorId, code: value });
    if (e) {
      setBusy(false);
      setCode("");
      setError(/invalid|expired/i.test(e.message) ? "That code didn't work. Wait for a new one and try again (your phone's time must be set automatically)." : e.message);
      input.current?.focus();
      return;
    }
    // The login is now confirmed with the code: reload so the server sees it.
    window.location.assign(home);
  }

  const setup = stage.kind === "setup";
  return (
    <div className="card w-full max-w-md p-6 sm:p-8">
      <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 dark:text-brand-700">
        <Icon name="shield" className="h-5 w-5" />
      </span>
      <h1 className="mt-4 font-display text-2xl font-semibold text-slate-900">{setup ? "Set up your authenticator" : "Enter your code"}</h1>
      <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-500">
        {setup ? "Once, then a code each time you open the console." : expired ? `It's been over ${hours} hours. Open your authenticator app.` : "Open your authenticator app."}
        <InfoTip align="right">
          The console needs your password and a code from your phone, so a stolen password or email isn&apos;t enough. Lost your phone? In Supabase, open
          Authentication → Users → your account and delete its authenticator, then sign in here to set up a new one.
        </InfoTip>
      </p>

      {stage.kind === "loading" && <p className="mt-6 text-sm text-slate-500">One moment…</p>}
      {stage.kind === "error" && (
        <div className="mt-6 space-y-3">
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{stage.message}</p>
          <button className="btn-secondary" onClick={() => { setStage({ kind: "loading" }); void start(); }}>Try again</button>
        </div>
      )}

      {setup && (
        <ol className="mt-6 space-y-4 text-sm text-slate-700">
          <li>
            <span className="font-medium text-slate-900">1.</span> On your phone, install Google Authenticator, Microsoft Authenticator or any authenticator app.
          </li>
          <li>
            <span className="font-medium text-slate-900">2.</span> In the app, add an account and scan this:
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrSrc(stage.qr)} alt="QR code for your authenticator app" className="mx-auto mt-3 h-48 w-48 rounded-xl bg-white p-2" />
            <button type="button" className="mt-2 text-xs text-brand-700 hover:underline" onClick={() => setShowSecret((v) => !v)}>
              {showSecret ? "Hide the key" : "Can't scan? Type a key instead"}
            </button>
            {showSecret && <code className="mt-1 block rounded-lg bg-slate-100 px-3 py-2 font-mono text-xs break-all text-slate-800 select-all">{stage.secret}</code>}
          </li>
          <li>
            <span className="font-medium text-slate-900">3.</span> Type the 6-digit code it shows:
          </li>
        </ol>
      )}

      {(setup || stage.kind === "code") && (
        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <label className="sr-only" htmlFor="code">6-digit code</label>
          <input
            ref={input}
            id="code"
            className="input text-center font-mono text-2xl tracking-[0.5em]"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="000000"
            value={code}
            disabled={busy}
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, "").slice(0, 6);
              setCode(v);
              if (v.length === 6) void submit(v);
            }}
          />
          {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <button type="submit" className="btn-primary w-full" disabled={busy || code.length !== 6}>
            {busy ? "Checking…" : setup ? "Finish set-up" : "Open the console"}
          </button>
        </form>
      )}
    </div>
  );
}
