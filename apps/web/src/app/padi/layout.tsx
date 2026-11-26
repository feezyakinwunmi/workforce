import type { Metadata } from "next";
import { PADI_NAME } from "@/lib/padi/paths";

/**
 * Bizz Padi: AI content and growth assistant (26 Nov 2026), part of the Workbase family.
 * Pages: (site)/ = landing or home, setup = brand profile, posts = calendar, posts/[id] = one post.
 */
export const metadata: Metadata = {
  icons: { icon: "/icon-padi.svg" },
  title: { default: `${PADI_NAME}: your AI social media manager`, template: `%s · ${PADI_NAME}` },
  description: "Bizz Padi writes your posts, designs your flyers and keeps your pages consistent. Built in Lagos.",
};

export default function PadiLayout({ children }: { children: React.ReactNode }) {
  return children;
}
