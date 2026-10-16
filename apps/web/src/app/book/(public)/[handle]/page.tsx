import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/icons";
import { bookRequestBase } from "@/lib/book/server";
import { LOCATION_SHORT, minutes, priceLine, type PublicPage } from "@/lib/book/types";
import { createClient } from "@/lib/supabase/server";
import { HostHeader, PoweredBy } from "../chrome";

type Params = { params: Promise<{ handle: string }> };

async function load(handle: string) {
  if (!/^[a-z0-9-]{3,30}$/i.test(handle)) return null;
  const supabase = await createClient();
  const { data } = await supabase.rpc("book_public", { p_handle: handle });
  return (data as PublicPage | null) ?? null;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const page = await load((await params).handle);
  return page ? { title: `Book ${page.name}`, description: page.about || `Book a time with ${page.name}.` } : { title: "Not found" };
}

export default async function HostPublicPage({ params }: Params) {
  const { handle } = await params;
  const [page, base] = await Promise.all([load(handle), bookRequestBase()]);
  if (!page) notFound();
  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:py-16">
      <div className="h-1.5 w-16 rounded-full" style={{ background: page.color }} />
      <div className="mt-6">
        <HostHeader name={page.name} about={page.about} color={page.color} />
      </div>
      <h1 className="mt-10 mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Book a time</h1>
      {page.services.length ? (
        <ul className="space-y-3">
          {page.services.map((s) => (
            <li key={s.id}>
              <Link
                href={`${base}/${page.handle}/${s.id}`}
                className="card group flex items-center gap-4 p-5 transition hover:-translate-y-0.5 hover:shadow-md"
                style={{ borderLeft: `4px solid ${page.color}` }}
              >
                <div className="min-w-0 flex-1">
                  <p className="font-display text-lg font-semibold text-slate-900">{s.title}</p>
                  {s.description && <p className="mt-1 line-clamp-2 text-sm text-slate-600">{s.description}</p>}
                  <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500">
                    <span className="inline-flex items-center gap-1"><Icon name="clock" className="h-4 w-4" />{minutes(s.duration_min)}</span>
                    <span className="inline-flex items-center gap-1"><Icon name={s.location === "meet" ? "video" : s.location === "phone" ? "phone" : "pin"} className="h-4 w-4" />{LOCATION_SHORT[s.location]}</span>
                    <span className="font-medium text-slate-700">{priceLine(s.price_kobo, s.pay_now_kobo)}</span>
                  </p>
                </div>
                <Icon name="chevronRight" className="h-5 w-5 shrink-0 text-slate-400 transition group-hover:translate-x-0.5" />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="card p-6 text-sm text-slate-600">{page.name} has no times open for booking right now.</p>
      )}
      <PoweredBy pro={page.pro} base={base} />
    </div>
  );
}
