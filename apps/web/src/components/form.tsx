"use client";

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Icon } from "@/components/icons";
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

/** Password field with a show/hide button. */
export function PasswordInput({
  id,
  name,
  autoComplete,
  minLength,
  placeholder,
}: {
  id: string;
  name: string;
  autoComplete: string;
  minLength?: number;
  placeholder?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        className="input pr-10"
        id={id}
        name={name}
        type={show ? "text" : "password"}
        autoComplete={autoComplete}
        minLength={minLength}
        placeholder={placeholder}
        required
      />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-slate-400 hover:text-slate-700"
        aria-label={show ? "Hide password" : "Show password"}
        aria-pressed={show}
      >
        <Icon name={show ? "eyeOff" : "eye"} className="h-4 w-4" />
      </button>
    </div>
  );
}

export function FormMessage({ state }: { state: FormState }) {
  if (!state?.error && !state?.success) return null;
  return (
    <p
      role={state.error ? "alert" : "status"}
      className={cn(
        "flex items-start gap-2 rounded-lg border px-3 py-2 text-sm",
        state.error ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-800",
      )}
    >
      <Icon name={state.error ? "alert" : "check"} className="mt-0.5 h-4 w-4" />
      <span>{state.error ?? state.success}</span>
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
      className="input w-auto py-1.5 pr-8 text-sm"
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

/** An on/off switch that submits as a normal checkbox. */
export function Switch({ name, label, hint, defaultChecked, disabled }: {
  name: string;
  label: string;
  hint?: string;
  defaultChecked: boolean;
  disabled?: boolean;
}) {
  return (
    <label className={`flex items-start justify-between gap-6 py-3.5 ${disabled ? "opacity-60" : "cursor-pointer"}`}>
      <span>
        <span className="block text-sm font-medium text-slate-900">{label}</span>
        {hint && <span className="mt-0.5 block text-xs text-slate-500">{hint}</span>}
      </span>
      <span className="relative mt-0.5 inline-flex shrink-0">
        <input type="checkbox" name={name} defaultChecked={defaultChecked} disabled={disabled} className="peer sr-only" />
        <span className="h-6 w-11 rounded-full bg-slate-300 transition peer-checked:bg-brand-600 peer-focus-visible:ring-3 peer-focus-visible:ring-brand-500/30" />
        <span className="absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition peer-checked:translate-x-5" />
      </span>
    </label>
  );
}
