import { cn } from "@/lib/utils";

/**
 * The Workbase family of marks: one shape resting on the marigold base (from Femi's sketch).
 * The shape says what the product does: Workbase = the curved "work" sail, Meet = a video camera,
 * Book = a calendar with a tick. Same tile, same base, same colours, so they read as one family.
 */
export type Product = "workbase" | "meet" | "book";

/** The shape on the base, drawn on the 48-unit tile grid (white on violet). */
function Shape({ product, on }: { product: Product; on: "tile" | "plain" }) {
  const fg = on === "tile" ? "#fff" : undefined; // plain: violet via className
  const detail = on === "tile" ? "#6A4CF5" : "#fff";
  if (product === "meet") {
    return (
      <>
        <rect x="10.5" y="12.5" width="18.5" height="15.5" rx="4.2" fill={fg} />
        <path d="M30.6 18.3 37.2 14.2a.9.9 0 0 1 1.3.8v11.5a.9.9 0 0 1-1.3.8l-6.6-4.1z" fill={fg} />
        <circle cx="16.3" cy="18" r="2" fill={detail} />
      </>
    );
  }
  if (product === "book") {
    return (
      <>
        <rect x="11.5" y="12.5" width="25" height="15.5" rx="3.6" fill={fg} />
        <rect x="16.5" y="9" width="3.2" height="6.5" rx="1.6" fill={fg} />
        <rect x="28.3" y="9" width="3.2" height="6.5" rx="1.6" fill={fg} />
        <path d="m18.6 20.4 3.6 3.4 7-7" fill="none" stroke={detail} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
      </>
    );
  }
  return <path d="M12 28V17C12 13.4 14.5 11 17.8 11C26 11 33 17.6 36.5 28Z" fill={fg} />;
}

export function LogoMark({ className, tile = false, product = "workbase" }: { className?: string; tile?: boolean; product?: Product }) {
  if (tile) {
    return (
      <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
        <rect width="48" height="48" rx="12" fill="#6A4CF5" />
        <Shape product={product} on="tile" />
        <rect x="9" y="31" width="30" height="6" rx="3" fill="#F2A93B" />
      </svg>
    );
  }
  if (product === "workbase") {
    return (
      <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
        <path d="M9 29V15.5C9 10.8 12.2 8 16.5 8C27 8 36.5 17 41 29Z" className="fill-brand-600 dark:fill-brand-400" />
        <rect x="4" y="32" width="40" height="8" rx="4" fill="#F2A93B" />
      </svg>
    );
  }
  // Without the tile: the same shape, larger and violet, on the wider base.
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <g transform="translate(-7 -6.7) scale(1.333)" className="fill-brand-600 dark:fill-brand-400">
        <Shape product={product} on="plain" />
      </g>
      <rect x="4" y="32" width="40" height="8" rx="4" fill="#F2A93B" />
    </svg>
  );
}

/** Mark + wordmark ("Workbase", "Workbase Meet", "Workbase Book"). */
export function Logo({ className, size = "md", product = "workbase" }: { className?: string; size?: "sm" | "md" | "lg"; product?: Product }) {
  const mark = size === "lg" ? "h-10 w-10" : size === "sm" ? "h-6 w-6" : "h-8 w-8";
  const text = size === "lg" ? "text-3xl" : size === "sm" ? "text-lg" : "text-[1.4rem]";
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark className={mark} product={product} />
      <span className={cn("font-display font-bold tracking-tight text-slate-900", text)}>
        Workbase
        {product !== "workbase" && <span className="text-brand-600 dark:text-brand-700"> {product === "meet" ? "Meet" : "Book"}</span>}
      </span>
    </span>
  );
}
