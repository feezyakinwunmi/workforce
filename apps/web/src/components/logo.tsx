import { cn } from "@/lib/utils";

/** The Workbase mark: the curved "work" shape resting on its base (from Femi's sketch). */
export function LogoMark({ className, tile = false }: { className?: string; tile?: boolean }) {
  if (tile) {
    return (
      <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
        <rect width="48" height="48" rx="12" fill="#6A4CF5" />
        <path d="M12 28V17C12 13.4 14.5 11 17.8 11C26 11 33 17.6 36.5 28Z" fill="#fff" />
        <rect x="9" y="31" width="30" height="6" rx="3" fill="#F2A93B" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <path d="M9 29V15.5C9 10.8 12.2 8 16.5 8C27 8 36.5 17 41 29Z" className="fill-brand-600 dark:fill-brand-400" />
      <rect x="4" y="32" width="40" height="8" rx="4" fill="#F2A93B" />
    </svg>
  );
}

/** Mark + wordmark. */
export function Logo({ className, size = "md" }: { className?: string; size?: "sm" | "md" | "lg" }) {
  const mark = size === "lg" ? "h-10 w-10" : size === "sm" ? "h-6 w-6" : "h-8 w-8";
  const text = size === "lg" ? "text-3xl" : size === "sm" ? "text-lg" : "text-[1.4rem]";
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark className={mark} />
      <span className={cn("font-display font-bold tracking-tight text-slate-900", text)}>Workbase</span>
    </span>
  );
}
