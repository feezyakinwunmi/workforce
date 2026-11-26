"use client";

import { useActionState, useState } from "react";
import { FormMessage, SubmitButton } from "@/components/form";
import { PLATFORMS, TONES, type Brand } from "@/lib/padi/types";
import { cn } from "@/lib/utils";
import { saveBrand } from "../actions";

/**
 * The brand profile form. Grouped into three short steps on one page:
 * the business, how it sounds and looks, and where it posts.
 */
export function BrandForm({ brand }: { brand: Brand | null }) {
  const [state, action] = useActionState(saveBrand, undefined);
  const [primary, setPrimary] = useState(brand?.colors.primary ?? "#6a4cf5");
  const [accent, setAccent] = useState(brand?.colors.accent ?? "#f2a93b");
  const [tone, setTone] = useState(brand?.tone ?? "friendly");
  const on = new Set(brand?.platforms ?? ["instagram", "facebook", "whatsapp"]);

  return (
    <form action={action} className="mt-6 space-y-6">
      {/* 1. The business ------------------------------------------------------ */}
      <section className="card space-y-4 p-5 sm:p-6">
        <h2 className="font-semibold text-slate-900">Your business</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="name">Business name</label>
            <input className="input" id="name" name="name" required maxLength={80} defaultValue={brand?.name} placeholder="Ada's Hair Studio" />
          </div>
          <div>
            <label className="label" htmlFor="industry">Type of business</label>
            <input className="input" id="industry" name="industry" maxLength={80} defaultValue={brand?.industry} placeholder="Hair salon" />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="about">What do you sell, and what makes you different?</label>
          <textarea className="input min-h-28" id="about" name="about" maxLength={1500} defaultValue={brand?.about}
            placeholder="Knotless braids, wigs and silk press. We use quality hair, never rush you, and we're open on Sundays. Braids from ₦25,000." />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="audience">Who are your customers?</label>
            <input className="input" id="audience" name="audience" maxLength={600} defaultValue={brand?.audience} placeholder="Working women in Lekki and Ajah, 22–40" />
          </div>
          <div>
            <label className="label" htmlFor="location">Where are you?</label>
            <input className="input" id="location" name="location" maxLength={120} defaultValue={brand?.location} placeholder="Lekki Phase 1, Lagos" />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="contact">Contact to show on posts</label>
          <input className="input" id="contact" name="contact" maxLength={160} defaultValue={brand?.contact} placeholder="WhatsApp 0801 234 5678 · @adashair" />
        </div>
      </section>

      {/* 2. Voice and look ---------------------------------------------------- */}
      <section className="card space-y-4 p-5 sm:p-6">
        <h2 className="font-semibold text-slate-900">How you sound and look</h2>
        <input type="hidden" name="tone" value={tone} />
        <div className="grid gap-2 sm:grid-cols-3">
          {TONES.map((t) => (
            <button
              type="button"
              key={t.key}
              onClick={() => setTone(t.key)}
              aria-pressed={tone === t.key}
              className={cn(
                "rounded-xl border p-3 text-left transition",
                tone === t.key ? "border-brand-500 bg-brand-50 ring-1 ring-brand-500" : "border-slate-200 hover:border-slate-300",
              )}
            >
              <span className="block font-medium text-slate-900">{t.label}</span>
              <span className="mt-0.5 block text-xs text-slate-500">{t.hint}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-6">
          <label className="flex items-center gap-3 text-sm text-slate-700">
            <input type="color" name="primary" value={primary} onChange={(e) => setPrimary(e.target.value)} className="h-10 w-14 cursor-pointer rounded-lg border border-slate-200 bg-surface" />
            Main colour
          </label>
          <label className="flex items-center gap-3 text-sm text-slate-700">
            <input type="color" name="accent" value={accent} onChange={(e) => setAccent(e.target.value)} className="h-10 w-14 cursor-pointer rounded-lg border border-slate-200 bg-surface" />
            Highlight colour
          </label>
          {/* A tiny live preview of how flyers will look. */}
          <span className="ml-auto inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold text-white" style={{ background: primary }}>
            Your flyer <span className="rounded-md px-2 py-0.5 text-xs" style={{ background: accent, color: "#15123a" }}>Book now</span>
          </span>
        </div>
      </section>

      {/* 3. Where and how often ----------------------------------------------- */}
      <section className="card space-y-4 p-5 sm:p-6">
        <h2 className="font-semibold text-slate-900">Where you post</h2>
        <div className="flex flex-wrap gap-2">
          {PLATFORMS.map((p) => (
            <label key={p.key} className="cursor-pointer">
              <input type="checkbox" name="platforms" value={p.key} defaultChecked={on.has(p.key)} className="peer sr-only" />
              <span className="inline-block rounded-full border border-slate-200 px-3.5 py-1.5 text-sm text-slate-700 transition peer-checked:border-brand-500 peer-checked:bg-brand-50 peer-checked:font-medium peer-checked:text-brand-800 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-400">
                {p.label}
              </span>
            </label>
          ))}
        </div>
        <div className="max-w-xs">
          <label className="label" htmlFor="posts_per_week">Posts per week</label>
          <select className="input" id="posts_per_week" name="posts_per_week" defaultValue={brand?.posts_per_week ?? 3}>
            {[2, 3, 4, 5, 7, 10, 14].map((n) => <option key={n} value={n}>{n} posts</option>)}
          </select>
        </div>
      </section>

      <FormMessage state={state} />
      <SubmitButton pendingText="Saving…">{brand ? "Save changes" : "Save and start"}</SubmitButton>
    </form>
  );
}
