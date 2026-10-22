import type { Metadata } from "next";
import Link from "next/link";
import { Icon, type IconName } from "@/components/icons";
import { Notice } from "@/components/ui";
import { TEMPLATES } from "@/lib/forms/schema";
import { formsRequestBase, type MyForm } from "@/lib/forms/server";
import { getMeetUser } from "@/lib/meet/server";
import { createForm } from "./actions";

export const metadata: Metadata = { title: { absolute: "Workbase Forms: forms that take payments" } };

type SP = Promise<{ error?: string }>;

export default async function FormsHome({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const [{ supabase, user }, base] = await Promise.all([getMeetUser(), formsRequestBase()]);
  if (!user) return <Landing base={base} />;
  const { data } = await supabase
    .from("forms")
    .select("id, slug, title, published, accepting, responses, updated_at")
    .order("updated_at", { ascending: false })
    .limit(200);
  const forms = (data ?? []) as Array<Pick<MyForm, "id" | "slug" | "title" | "published" | "accepting" | "responses" | "updated_at">>;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      {sp.error && <Notice tone="error" className="mb-6">{sp.error}</Notice>}
      <h1 className="font-display text-2xl font-bold text-slate-900">Start a new form</h1>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {TEMPLATES.map((t) => (
          <form key={t.key} action={createForm}>
            <input type="hidden" name="template" value={t.key} />
            <button className="card group flex h-full w-full flex-col items-start gap-2 p-4 text-left transition hover:border-brand-400 hover:shadow-sm">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:text-brand-700">
                <Icon name={TEMPLATE_ICON[t.key] ?? "note"} className="h-5 w-5" />
              </span>
              <span className="font-medium text-slate-900">{t.name}</span>
              <span className="text-xs text-slate-500">{t.blurb}</span>
            </button>
          </form>
        ))}
      </div>

      <h2 className="mt-10 font-display text-xl font-bold text-slate-900">My forms</h2>
      {forms.length === 0 ? (
        <p className="mt-3 text-slate-500">Nothing yet. Pick a starting point above.</p>
      ) : (
        <ul className="card mt-4 divide-y divide-slate-200">
          {forms.map((f) => (
            <li key={f.id}>
              <Link href={`${base}/build/${f.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3.5 hover:bg-slate-50 sm:px-5">
                <span className="min-w-0 flex-1 truncate font-medium text-slate-900">{f.title}</span>
                <span className={`badge ${!f.published ? "bg-slate-100 text-slate-600" : f.accepting ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                  {!f.published ? "Draft" : f.accepting ? "Live" : "Closed"}
                </span>
                <span className="w-28 text-right text-sm text-slate-600">
                  {f.responses} {f.responses === 1 ? "answer" : "answers"}
                </span>
                <span className="hidden w-28 text-right text-xs text-slate-400 sm:block">
                  {new Date(f.updated_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const TEMPLATE_ICON: Record<string, IconName> = {
  blank: "plus",
  contact: "mail",
  event: "calendar",
  order: "cash",
  feedback: "smile",
  donation: "wallet",
};

const FEATURES: Array<[IconName, string, string]> = [
  ["layers", "Drag, drop or tap", "Tap a question type to add it, drag to reorder (or use the arrows on a phone)."],
  ["cash", "Take payments", "Fixed prices, prices per option or pay-what-you-want. Paystack: card, transfer, USSD."],
  ["globe", "On your website", "Copy one line of code into any site. Works with WordPress, Wix and Squarespace."],
  ["mail", "Answers by email", "Every answer lands in your inbox and in a table you can download."],
  ["shield", "Spam protection", "A quiet human check and speed limits keep bots out."],
  ["whatsapp", "Share anywhere", "A short link for WhatsApp, Instagram bio or a QR code on a flyer."],
];

function Landing({ base }: { base: string }) {
  const start = `/signup?next=${encodeURIComponent(base || "/")}`;
  return (
    <>
      <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-14 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:py-20">
        <div>
          <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-[#f2a93b]/15 px-3 py-1 text-xs font-semibold tracking-wide text-[#9a5b06] uppercase dark:text-[#f2c27a]">
            Registrations, orders, sign-ups, feedback
          </p>
          <h1 className="font-display text-4xl leading-[1.05] font-bold tracking-tight text-slate-900 sm:text-6xl">
            Forms that <span className="text-brand-600 dark:text-brand-700">get you paid.</span>
          </h1>
          <p className="mt-5 max-w-lg text-lg text-slate-600">
            Build a form in minutes, take payments with Paystack and put it on your website or WordPress with one line of code.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link href={start} className="btn-primary px-6 py-3 text-base">Make a free form</Link>
            <Link href={`/login?next=${encodeURIComponent(base || "/")}`} className="btn-secondary px-6 py-3 text-base">Sign in</Link>
          </div>
          <p className="mt-4 text-sm text-slate-500">Free. We keep 3% of online payments; the rest goes straight to your bank.</p>
        </div>
        <FormIllustration />
      </section>
      <section className="border-y border-slate-200 bg-surface">
        <div className="mx-auto grid max-w-6xl gap-4 px-4 py-14 sm:grid-cols-2 sm:px-6 lg:grid-cols-3">
          {FEATURES.map(([icon, title, body]) => (
            <div key={title} className="p-2">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:text-brand-700"><Icon name={icon} className="h-5 w-5" /></span>
              <h2 className="mt-3 font-semibold text-slate-900">{title}</h2>
              <p className="mt-1 text-sm text-slate-600">{body}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

function FormIllustration() {
  return (
    <div aria-hidden="true" className="relative mx-auto w-full max-w-md">
      <div className="card overflow-hidden shadow-xl shadow-brand-900/10" style={{ borderTop: "4px solid #6a4cf5" }}>
        <div className="px-6 pt-6">
          <p className="font-display text-xl font-bold text-slate-900">Tech Meetup Lagos</p>
          <p className="mt-1 text-sm text-slate-500">Register and pay for your ticket.</p>
        </div>
        <div className="space-y-4 px-6 py-5">
          {["Full name", "Email"].map((l) => (
            <div key={l}>
              <p className="mb-1.5 text-sm font-medium text-slate-700">{l}</p>
              <div className="h-9 rounded-lg border border-slate-300" />
            </div>
          ))}
          <div>
            <p className="mb-1.5 text-sm font-medium text-slate-700">Ticket</p>
            {[["Regular", "₦5,000", false], ["VIP", "₦15,000", true]].map(([l, p, on]) => (
              <div key={l as string} className={`mb-2 flex items-center gap-3 rounded-xl border px-3.5 py-2.5 text-sm ${on ? "border-brand-500 bg-brand-50" : "border-slate-200"}`}>
                <span className={`h-4 w-4 rounded-full border-2 ${on ? "border-brand-600 bg-brand-600 ring-2 ring-white ring-inset" : "border-slate-300"}`} />
                <span className="text-slate-800">{l}</span>
                <span className="ml-auto text-slate-500">+{p}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between border-t border-slate-200 px-6 py-4">
          <p className="text-sm text-slate-600">Total: <span className="font-display text-lg font-bold text-slate-900">₦15,000</span></p>
          <span className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white">Continue to payment</span>
        </div>
      </div>
      <div className="absolute -right-3 -bottom-5 rotate-2 rounded-xl bg-[#15123a] px-4 py-3 font-mono text-xs text-white shadow-lg sm:-right-8">
        &lt;div data-workbase-form=…&gt;
      </div>
    </div>
  );
}
