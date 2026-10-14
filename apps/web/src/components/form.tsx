"use client";

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import type { FormState } from "@/lib/types";
import { cn } from "@/lib/utils";

export function SubmitButton({
  children,
  pendingText,
  className = "btn-primary",
}: {
  children: React.ReactNode;
  pendingText?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending} aria-busy={pending}>
      {pending ? (pendingText ?? "Please wait…") : children}
    </button>
  );
}

export function FormMessage({ state }: { state: FormState }) {
  if (!state?.error && !state?.success) return null;
  return (
    <p
      role={state.error ? "alert" : "status"}
      className={cn(
        "rounded-lg px-3 py-2 text-sm",
        state.error ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700",
      )}
    >
      {state.error ?? state.success}
    </p>
  );
}

/** Time zone picker: every IANA zone the browser knows, defaulting to the device's own. */
export function TimezoneSelect({
  name = "timezone",
  defaultValue,
  id,
}: {
  name?: string;
  defaultValue?: string;
  id?: string;
}) {
  const [zones, setZones] = useState<string[]>(defaultValue ? [defaultValue] : ["Africa/Lagos"]);
  const [value, setValue] = useState(defaultValue ?? "Africa/Lagos");

  useEffect(() => {
    const all =
      typeof Intl.supportedValuesOf === "function"
        ? Intl.supportedValuesOf("timeZone")
        : ["Africa/Lagos", "Europe/London", "America/New_York"];
    setZones(all.includes(value) ? all : [value, ...all]);
    if (!defaultValue) {
      const local = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (local) setValue(local);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <select id={id} name={name} className="input" value={value} onChange={(e) => setValue(e.target.value)}>
      {zones.map((z) => (
        <option key={z} value={z}>
          {z.replaceAll("_", " ")}
        </option>
      ))}
    </select>
  );
}

export function CopyButton({ text, label = "Copy link" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  return (
    <button
      type="button"
      className="btn-secondary btn-sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => setCopied(false), 2000);
        } catch {
          window.prompt("Copy this link:", text);
        }
      }}
    >
      {copied ? "Copied" : label}
    </button>
  );
}

/** A <select> that submits its form as soon as the value changes. */
export function AutoSubmitSelect({
  name,
  defaultValue,
  options,
  disabled,
  ariaLabel,
}: {
  name: string;
  defaultValue: string;
  options: Array<{ value: string; label: string }>;
  disabled?: boolean;
  ariaLabel: string;
}) {
  return (
    <select
      name={name}
      defaultValue={defaultValue}
      disabled={disabled}
      aria-label={ariaLabel}
      className="input py-1 text-xs"
      onChange={(e) => e.currentTarget.form?.requestSubmit()}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
