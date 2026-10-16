import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { InfoTip } from "@/components/ui";
import { bookRequestBase, getBookHost } from "@/lib/book/server";
import { DayOffForm, HoursEditor } from "./editor";
import { removeDayOff } from "../actions";

export const metadata: Metadata = { title: "Availability" };

export default async function AvailabilityPage() {
  const [{ supabase, user, page }, base] = await Promise.all([getBookHost(), bookRequestBase()]);
  if (!user || !page) redirect(base || "/");
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: page.timezone }).format(new Date());
  const [{ data: hours }, { data: off }] = await Promise.all([
    supabase.from("book_hours").select("weekday, start_min, end_min").eq("page_id", page.id).order("weekday").order("start_min"),
    supabase.from("book_days_off").select("day").eq("page_id", page.id).gte("day", today).order("day"),
  ]);
  const days = ((off ?? []) as Array<{ day: string }>).map((d) => d.day);
  const fmt = (d: string) => new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`));
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-6">
      <h1 className="flex items-center gap-2 font-display text-2xl font-bold text-slate-900">
        Availability
        <span className="badge bg-slate-100 font-sans text-xs font-medium text-slate-600">{page.timezone.replace(/_/g, " ")} time</span>
      </h1>
      <section className="card p-5">
        <h2 className="mb-4 font-semibold text-slate-900">Weekly hours</h2>
        <HoursEditor initial={(hours ?? []) as Array<{ weekday: number; start_min: number; end_min: number }>} />
      </section>
      <section className="card p-5">
        <h2 className="mb-4 flex items-center gap-1.5 font-semibold text-slate-900">
          Days off
          <InfoTip>Holidays, travel or busy days: nobody can book you then.</InfoTip>
        </h2>
        <DayOffForm min={today} />
        {days.length > 0 && (
          <ul className="mt-4 flex flex-wrap gap-2">
            {days.map((d) => (
              <li key={d}>
                <form action={removeDayOff} className="flex items-center gap-1 rounded-full bg-slate-100 py-1 pr-1 pl-3 text-sm text-slate-700">
                  <input type="hidden" name="day" value={d} />
                  {fmt(d)}
                  <button className="rounded-full px-2 text-slate-400 hover:bg-slate-200 hover:text-slate-900" aria-label={`Remove ${fmt(d)}`}>×</button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
