"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/icons";

/** Join by code or by pasting the whole link. */
export function JoinForm({ base, dark }: { base: string; dark?: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const go = () => {
    const m = /([a-z]{3})-?([a-z]{4})-?([a-z]{3})\s*$/i.exec(value.trim().replace(/\/+$/, ""));
    if (!m) {
      setError("Codes look like abc-defg-hij.");
      return;
    }
    router.push(`${base}/${`${m[1]}-${m[2]}-${m[3]}`.toLowerCase()}`);
  };
  return (
    <div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          go();
        }}
      >
        <label className="sr-only" htmlFor="join-code">Meeting code or link</label>
        <input
          id="join-code"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          placeholder="Enter a code or link"
          autoComplete="off"
          className={dark ? "min-w-0 flex-1 rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-white placeholder:text-white/50 focus:border-white/60 focus:outline-none" : "input min-w-0 flex-1 py-3"}
        />
        <button className={dark ? "rounded-xl bg-white/15 px-5 font-semibold text-white hover:bg-white/25" : "btn-secondary px-5"} disabled={!value.trim()}>
          Join
        </button>
      </form>
      {error && <p className={dark ? "mt-2 text-sm text-amber-200" : "mt-2 text-sm text-red-600"}>{error}</p>}
    </div>
  );
}

export function CopyLink({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="btn-secondary btn-sm"
      onClick={async () => {
        await navigator.clipboard.writeText(link).catch(() => undefined);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      }}
    >
      <Icon name={copied ? "check" : "copy"} className="h-3.5 w-3.5" />
      {copied ? "Copied" : "Copy link"}
    </button>
  );
}
