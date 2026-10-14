import type { Metadata } from "next";
import Link from "next/link";
import { hasPro } from "@/lib/billing";
import { getBilling } from "@/lib/billing-server";
import { requireMember } from "@/lib/session";
import { addDays, formatClock, formatDay, isValidDate, localDateIn, zonedMidnight } from "@/lib/time";
import { displayName, loadPeople, visibleMembers } from "@/lib/tracking";
import { isAdminRole } from "@/lib/types";
import { ConfirmSubmit } from "../team/forms";
import { deleteScreenshot } from "./actions";

export const metadata: Metadata = { title: "Screenshots" };

type Shot = {
  id: string;
  user_id: string;
  taken_at: string;
  path: string;
  app: string | null;
  blurred: boolean;
  deleted_at: string | null;
};

export default async function ScreenshotsPage({
  searchParams,
}: {
  searchParams: Promise<{ user?: string; date?: string; error?: string }>;
}) {
  const params = await searchParams;
  const [{ supabase, member: me, org }, billing] = await Promise.all([requireMember(), getBilling()]);
  const { members, teams, profiles } = await loadPeople(supabase, { includeRemoved: true });
  const visible = visibleMembers(me, members, teams);
  const target = visible.find((m) => m.user_id === (params.user ?? me.user_id)) ?? visible.find((m) => m.user_id === me.user_id);
  const s = org.settings;
  const on = s.screenshots_enabled && hasPro(billing);

  if (!target) return null;
  const tz = target.timezone;
  const today = localDateIn(tz);
  const date = isValidDate(params.date) ? params.date : today;
  const from = zonedMidnight(date, tz).toISOString();
  const to = zonedMidnight(addDays(date, 1), tz).toISOString();
  const isMe = target.user_id === me.user_id;

  const { data } = await supabase
    .from("screenshots")
    .select("id, user_id, taken_at, path, app, blurred, deleted_at")
    .eq("user_id", target.user_id)
    .gte("taken_at", from)
    .lt("taken_at", to)
    .order("taken_at");
  const shots = (data ?? []) as Shot[];
  const live = shots.filter((x) => !x.deleted_at);
  const { data: signed } = live.length
    ? await supabase.storage.from("screenshots").createSignedUrls(live.map((x) => x.path), 60 * 60)
    : { data: [] as Array<{ path: string | null; signedUrl: string }> };
  const url = new Map<string, string>();
  for (const x of (signed ?? []) as Array<{ path: string | null; signedUrl: string | null }>) {
    if (x.path && x.signedUrl) url.set(x.path, x.signedUrl);
  }

  // Group by hour of the worker's day.
  const hours = new Map<string, Shot[]>();
  for (const shot of shots) {
    const h = formatClock(shot.taken_at, tz).slice(0, 2) + ":00";
    hours.set(h, [...(hours.get(h) ?? []), shot]);
  }
  const here = `/dashboard/screenshots?user=${target.user_id}&date=${date}`;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Screenshots{isMe ? "" : ` · ${displayName(profiles.get(target.user_id))}`}</h1>
          <p className="mt-1 text-slate-600">
            {formatDay(date, { weekday: "long", day: "numeric", month: "long", year: "numeric" })} · {tz.replaceAll("_", " ")} time
          </p>
        </div>
        <form className="flex flex-wrap items-center gap-2" action="/dashboard/screenshots">
          {visible.length > 1 ? (
            <select name="user" defaultValue={target.user_id} className="input w-auto" aria-label="Member">
              {visible.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {displayName(profiles.get(m.user_id))}
                  {m.user_id === me.user_id ? " (you)" : ""}
                </option>
              ))}
            </select>
          ) : (
            <input type="hidden" name="user" value={target.user_id} />
          )}
          <input type="date" name="date" defaultValue={date} max={today} className="input w-auto" aria-label="Date" />
          <button className="btn-secondary">Show</button>
          <Link className="btn-secondary" href={`/dashboard/screenshots?user=${target.user_id}&date=${addDays(date, -1)}`} aria-label="Previous day">←</Link>
          {date < today && (
            <Link className="btn-secondary" href={`/dashboard/screenshots?user=${target.user_id}&date=${addDays(date, 1)}`} aria-label="Next day">→</Link>
          )}
        </form>
      </header>

      <p className={`rounded-lg px-4 py-3 text-sm ${on ? "bg-brand-50 text-brand-900" : "bg-slate-50 text-slate-600"}`}>
        {on
          ? `Screenshots are on: one at a random moment about every ${s.screenshot_interval_minutes} minutes while clocked in${s.blur_screenshots ? ", blurred before upload" : ""}. Kept for 90 days.`
          : "Screenshots are off. Nothing new is being taken."}{" "}
        {isMe && "You can delete any of yours; your company sees that one was deleted."}
        {!on && isAdminRole(me.role) && (
          <> <Link href={hasPro(billing) ? "/dashboard/settings" : "/dashboard/billing"} className="font-medium text-brand-700 hover:underline">
            {hasPro(billing) ? "Company settings" : "Pro plan"}
          </Link></>
        )}
      </p>

      {params.error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{params.error}</p>}

      {shots.length === 0 ? (
        <div className="card p-8 text-center text-sm text-slate-500">No screenshots on this day.</div>
      ) : (
        [...hours.entries()].map(([hour, list]) => (
          <section key={hour}>
            <h2 className="mb-2 text-sm font-semibold text-slate-500">{hour}</h2>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {list.map((shot) => (
                <li key={shot.id} className="card overflow-hidden">
                  {shot.deleted_at ? (
                    <div className="flex aspect-video items-center justify-center bg-slate-100 px-3 text-center text-xs text-slate-500">
                      Deleted by {isMe ? "you" : displayName(profiles.get(shot.user_id))}
                    </div>
                  ) : (
                    <a href={url.get(shot.path)} target="_blank" rel="noreferrer" className="block aspect-video bg-slate-100">
                      {url.get(shot.path) && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={url.get(shot.path)} alt={`Screenshot at ${formatClock(shot.taken_at, tz)}`} className="h-full w-full object-cover" loading="lazy" />
                      )}
                    </a>
                  )}
                  <div className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
                    <span className="min-w-0 truncate">
                      <span className="font-medium text-slate-800">{formatClock(shot.taken_at, tz)}</span>
                      {shot.app && <span className="text-slate-500"> · {shot.app}</span>}
                      {shot.blurred && !shot.deleted_at && <span className="text-slate-400"> · blurred</span>}
                    </span>
                    {isMe && !shot.deleted_at && (
                      <form action={deleteScreenshot}>
                        <input type="hidden" name="id" value={shot.id} />
                        <input type="hidden" name="back" value={here} />
                        <ConfirmSubmit message="Delete this screenshot? Your company will see that one was deleted." className="text-slate-400 hover:text-red-600">
                          Delete
                        </ConfirmSubmit>
                      </form>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
