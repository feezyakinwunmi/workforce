import type { Metadata, Viewport } from "next";
import { MEET_NAME } from "@/lib/meet/paths";

export const metadata: Metadata = {
  title: { default: `${MEET_NAME}: free video meetings`, template: `%s · ${MEET_NAME}` },
  description: "Free video meetings for teams in Nigeria and beyond. Up to 1 hour and 25 people free, nothing to install, data saver built in.",
};

export const viewport: Viewport = { themeColor: "#0f0d26" };

export default function MeetLayout({ children }: { children: React.ReactNode }) {
  return children;
}
