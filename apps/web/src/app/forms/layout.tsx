import type { Metadata } from "next";
import { FORMS_NAME } from "@/lib/forms/paths";

export const metadata: Metadata = {
  icons: { icon: "/icon-forms.svg" },
  title: { default: `${FORMS_NAME}: forms that take payments`, template: `%s · ${FORMS_NAME}` },
  description: "Build a form in minutes, take payments with Paystack and put it on your website or WordPress.",
};

export default function FormsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
