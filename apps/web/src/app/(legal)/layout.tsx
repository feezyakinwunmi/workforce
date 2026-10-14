import { SiteFooter, SiteHeader } from "@/components/site-chrome";

/** Public pages anyone can read without logging in: what we track, privacy policy, terms. */
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-surface">
      <SiteHeader signedIn={false} />
      <main className="legal mx-auto max-w-3xl px-4 py-14 sm:px-6">{children}</main>
      <SiteFooter />
    </div>
  );
}
