import type { Metadata } from "next";
import Link from "next/link";
import { hasPro } from "@/lib/billing";
import { getBilling } from "@/lib/billing-server";
import { requireMember } from "@/lib/session";
import { addDays, formatClock, formatDay, isValidDate, localDateIn, zonedMidnight } from "@/lib/time";
import { displayName, loadPeople, visibleMembers } from "@/lib/tracking";
import { isAdminRole } from "@/lib/types";
import { DayNav } from "@/components/day-nav";
import { Icon } from "@/components/icons";
import { EmptyState, Notice, PageHeader } from "@/components/ui";
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
      <PageHeader
        title={isMe ? "My screenshots" : `Screenshots · ${displayName(profiles.get(target.user_id))}`}
        meta={`${formatDay(date, { weekday: "long", day: "numeric", month: "long", year: "numeric" })} · ${tz.replaceAll("_", " ")}`}
        actions={
          <DayNav
            action="/dashboard/screenshots"
            people={visible.map((m) => ({ id: m.user_id, name: `${displayName(profiles.get(m.user_id))}${m.user_id === me.user_id ? " (you)" : ""}` }))}
            user={target.user_id}
            date={date}
            max={today}
            prevHref={`/dashboard/screenshots?user=${target.user_id}&date=${addDays(date, -1)}`}
            nextHref={date < today ? `/dashboard/screenshots?user=${target.user_id}&date=${addDays(date, 1)}` : null}
          />
        }
      />

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className={`badge px-2.5 py-1 ${on ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${on ? "bg-emerald-500" : "bg-slate-400"}`} aria-hidden />
          {on ? `On · about every ${s.screenshot_interval_minutes} min${s.blur_screenshots ? " · blurred" : ""}` : "Off"}
        </span>
        <span className="text-slate-500">Kept 90 days.</span>
        {isMe && <span className="text-slate-500">You can delete yours; your company sees that one was deleted.</span>}
        {!on && isAdminRole(me.role) && (
          <Link href={hasPro(billing) ? "/dashboard/settings" : "/dashboard/billing"} className="font-medium text-brand-700 hover:underline">
            {hasPro(billing) ? "Switch on in settings" : "Available on Pro"}
          </Link>
        )}
      </div>

      {params.error && <Notice tone="error">{params.error}</Notice>}

      {shots.length === 0 ? (
        <div className="card"><EmptyState icon="camera" title="No screenshots on this day." /></div>
      ) : (
        <div className="space-y-6">
          {[...hours.entries()].map(([hour, list]) => (
            <section key={hour} className="grid gap-3 sm:grid-cols-[4rem_minmax(0,1fr)]">
              <h2 className="pt-1 text-sm font-semibold text-slate-500 tabular-nums">{hour}</h2>
              <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
                {list.map((shot) => (
                  <li key={shot.id} className="group overflow-hidden rounded-xl border border-slate-200 bg-surface">
                    {shot.deleted_at ? (
                      <div className="flex aspect-video flex-col items-center justify-center gap-1.5 bg-slate-50 px-3 text-center text-xs text-slate-500">
                        <Icon name="trash" className="h-4 w-4" />
                        Deleted by {isMe ? "you" : displayName(profiles.get(shot.user_id)).split(" ")[0]}
                      </div>
                    ) : (
                      <a href={url.get(shot.path)} target="_blank" rel="noreferrer" className="relative block aspect-video overflow-hidden bg-slate-100">
                        {url.get(shot.path) && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={url.get(shot.path)}
                            alt={`Screenshot at ${formatClock(shot.taken_at, tz)}`}
                            className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
                            loading="lazy"
                          />
                        )}
                        {shot.blurred && (
                          <span className="absolute top-2 left-2 rounded-md bg-slate-950/60 px-1.5 py-0.5 text-[10px] font-medium text-white dark:bg-black/60">Blurred</span>
                        )}
                      </a>
                    )}
                    <div className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
                      <span className="min-w-0 truncate">
                        <span className="font-semibold text-slate-900 tabular-nums">{formatClock(shot.taken_at, tz)}</span>
                        {shot.app && <span className="text-slate-500"> · {shot.app}</span>}
                      </span>
                      {isMe && !shot.deleted_at && (
                        <form action={deleteScreenshot}>
                          <input type="hidden" name="id" value={shot.id} />
                          <input type="hidden" name="back" value={here} />
                          <ConfirmSubmit message="Delete this screenshot? Your company will see that one was deleted." className="text-slate-400 hover:text-red-600">
                            <Icon name="trash" className="h-3.5 w-3.5" />
                            <span className="sr-only">Delete</span>
                          </ConfirmSubmit>
                        </form>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
