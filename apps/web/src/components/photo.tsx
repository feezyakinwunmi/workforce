/* eslint-disable @next/next/no-img-element -- Unsplash's CDN already resizes and compresses, so a
   plain <img> with srcset is enough and avoids sending every photo through Vercel's optimiser. */
import { photo, photoSet, type Photo as PhotoData } from "@/lib/photos";

/**
 * One landing-page photo: right size for the slot, 2x for sharp screens, lazy below the fold.
 * `priority` = in the first screen (loads at once, no lazy).
 */
export function Photo({
  p,
  w,
  h,
  className = "",
  priority = false,
}: {
  p: PhotoData;
  w: number;
  h?: number;
  className?: string;
  priority?: boolean;
}) {
  return (
    <img
      src={photo(p, w, h)}
      srcSet={photoSet(p, w, h)}
      alt={p.alt}
      width={w}
      height={h ?? Math.round(w * 0.66)}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      fetchPriority={priority ? "high" : "auto"}
      className={className}
    />
  );
}
