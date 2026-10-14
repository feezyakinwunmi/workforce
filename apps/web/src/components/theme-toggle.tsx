"use client";

import { useEffect, useState } from "react";
import { Icon, type IconName } from "@/components/icons";
import { cn } from "@/lib/utils";

type Theme = "light" | "dark" | "system";
const OPTIONS: Array<{ value: Theme; icon: IconName; label: string }> = [
  { value: "light", icon: "sun", label: "Light" },
  { value: "dark", icon: "moon", label: "Dark" },
  { value: "system", icon: "monitor", label: "System" },
];

function apply(theme: Theme) {
  const dark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

/** Light / dark / system switch. The choice is remembered on this device. */
export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    let saved: Theme = "system";
    try {
      saved = (localStorage.getItem("theme") as Theme | null) ?? "system";
    } catch {}
    setTheme(saved);
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      let current: string | null = null;
      try {
        current = localStorage.getItem("theme");
      } catch {}
      if (!current || current === "system") apply("system");
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  function choose(next: Theme) {
    setTheme(next);
    try {
      localStorage.setItem("theme", next);
    } catch {}
    apply(next);
  }

  return (
    <div role="radiogroup" aria-label="Theme" className={cn("inline-flex rounded-lg bg-slate-100 p-0.5", className)}>
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={theme === o.value}
          title={o.label}
          onClick={() => choose(o.value)}
          className={cn(
            "flex h-7 w-8 items-center justify-center rounded-md transition",
            theme === o.value ? "bg-surface text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800",
          )}
        >
          <Icon name={o.icon} className="h-4 w-4" />
          <span className="sr-only">{o.label}</span>
        </button>
      ))}
    </div>
  );
}
