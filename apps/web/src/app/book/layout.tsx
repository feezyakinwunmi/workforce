import type { Metadata } from "next";
import { BOOK_NAME } from "@/lib/book/paths";

export const metadata: Metadata = {
  icons: { icon: "/icon-book.svg" },
  title: { default: `${BOOK_NAME}: booking pages that get paid`, template: `%s · ${BOOK_NAME}` },
  description: "Your own booking page. Customers pick a time, pay a deposit with Paystack and get reminders. Video calls included.",
};

export default function BookLayout({ children }: { children: React.ReactNode }) {
  return children;
}
