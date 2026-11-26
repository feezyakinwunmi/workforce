/**
 * Photos used on the public landing pages.
 *
 * All of them are free photos from Unsplash (unsplash.com, "Unsplash License": free for
 * commercial use, no permission or credit needed; we still credit Unsplash in the footer).
 * They are loaded straight from Unsplash's image CDN, which resizes and compresses them on the
 * fly (`photo(id, width)` asks for WebP/AVIF at the size we need).
 *
 * To swap a photo: find a free one on unsplash.com (filter "Free"), open it, copy the
 * "photo-…" part of the image address and put it below with a good description.
 * When Femi has photos of real customers or the team, replace these with those.
 */

export type Photo = { id: string; alt: string };

export const PHOTOS = {
  // People at work
  braidsLaptop: { id: "photo-1604933762021-54a5858c9832", alt: "A woman with long braids working on a laptop at her desk" },
  sofaLaptop: { id: "photo-1573496800440-5c9c48a8d0f0", alt: "A woman working on a laptop from her sofa" },
  officeRed: { id: "photo-1573878414075-be35f08479e5", alt: "A smiling woman in a red top working on her laptop in a bright office" },
  cafeDesk: { id: "photo-1765648684898-2213d6b11c5d", alt: "A woman working on a laptop at an outdoor café table" },
  manSmiling: { id: "photo-1612299273045-362a39972259", alt: "A smiling young man on a call at his laptop" },
  manPlants: { id: "photo-1594077810908-9ffd89d704ac", alt: "A man working on a laptop at a desk with plants" },
  manCafe: { id: "photo-1638514351607-585e69bbbb7e", alt: "A man working on a laptop in a café" },
  // Small businesses and events
  barber: { id: "photo-1512864084360-7c0c4d0a0845", alt: "A barber trimming a customer's hair" },
  volunteers: { id: "photo-1584012961506-b6fc4c9f3105", alt: "A group of young people in matching event T-shirts sitting together" },
  teamOutdoors: { id: "photo-1655720348590-c739c860beed", alt: "A team working together on laptops outdoors" },
  // Lagos
  lagosSkyline: { id: "photo-1618828665347-d870c38c95c7", alt: "The Lagos skyline and lagoon on a clear day" },
  lekkiBridge: { id: "photo-1719314073622-9399d167725b", alt: "The Lekki–Ikoyi Link Bridge in Lagos" },
} satisfies Record<string, Photo>;

/** Unsplash CDN address for a photo at a given width (height follows unless `h` is given). */
export function photo(p: Photo, w: number, h?: number) {
  const size = h ? `&h=${h}&fit=crop` : "";
  return `https://images.unsplash.com/${p.id}?auto=format&q=75&w=${w}${size}`;
}

/** srcset for crisp images on phones and retina screens. */
export function photoSet(p: Photo, w: number, h?: number) {
  return [1, 2].map((x) => `${photo(p, w * x, h ? h * x : undefined)} ${x}x`).join(", ");
}
