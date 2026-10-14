import type { Metadata } from "next";
import { requireMember } from "@/lib/session";
import { formatClock, formatDay, localDateIn } from "@/lib/time";
import { cn } from "@/lib/utils";
import { markAllRead, openNotification } from "./actions";

export const metadata: Metadata = { title: "Notifications" };

type Notification = {
  id: string;
  kind:
    | "task_assigned" | "task_comment" | "task_done" | "task_due"
    | "chat_direct" | "announcement" | "leave_requested" | "leave_decided" | "billing";
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
};

const ICON: Record<Notification["kind"], string> = {
  task_assigned: "📋",
  task_comment: "💬",
  task_done: "✅",
  task_due: "⏰",
  chat_direct: "💬",
  announcement: "📣",
  leave_requested: "🌴",
  leave_decided: "🌴",
  billing: "💳",
};

export default async function NotificationsPage() {
  const { supabase, user, member: me } = await requireMember();
  const { data } = await supabase
    .from("notifications")
    .select("id, kind, title, body, link, read_at, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);
  const items = (data ?? []) as Notification[];
  const unread = items.filter((n) => !n.read_at).length;
  const tz = me.timezone;
  const today = localDateIn(tz);

  const when = (iso: string) => {
    const day = localDateIn(tz, new Date(iso));
    return day === today ? formatClock(iso, tz) : `${formatDay(day, { day: "numeric", month: "short" })}, ${formatClock(iso, tz)}`;
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Notifications</h1>
          <p className="mt-1 text-slate-600">
            Tasks, messages, announcements, leave and plan reminders. The desktop app shows them as pop-ups too.
          </p>
        </div>
        {unread > 0 && (
          <form action={markAllRead}>
            <button className="btn-secondary">Mark all as read</button>
          </form>
        )}
      </header>

      {items.length === 0 ? (
        <div className="card p-8 text-center text-sm text-slate-500">Nothing yet.</div>
      ) : (
        <ul className="card divide-y divide-slate-100 overflow-hidden">
          {items.map((n) => (
            <li key={n.id}>
              <form action={openNotification}>
                <input type="hidden" name="id" value={n.id} />
                <input type="hidden" name="link" value={n.link ?? "/dashboard/notifications"} />
                <button
                  className={cn(
                    "flex w-full items-start gap-3 px-5 py-3 text-left text-sm hover:bg-slate-50",
                    !n.read_at && "bg-brand-50/60",
                  )}
                >
                  <span aria-hidden className="mt-0.5">{ICON[n.kind] ?? "🔔"}</span>
                  <span className="min-w-0 flex-1">
                    <span className={cn("block", !n.read_at && "font-semibold")}>{n.title}</span>
                    {n.body && <span className="mt-0.5 block truncate text-slate-600">{n.body}</span>}
                  </span>
                  <span className="shrink-0 text-xs text-slate-400">{when(n.created_at)}</span>
                  {!n.read_at && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-600" aria-label="Unread" />}
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
