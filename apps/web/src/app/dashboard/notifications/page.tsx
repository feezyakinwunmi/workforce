import type { Metadata } from "next";
import { requireMember } from "@/lib/session";
import { formatClock, formatDay, localDateIn } from "@/lib/time";
import { Icon, type IconName } from "@/components/icons";
import { EmptyState, PageHeader } from "@/components/ui";
import { cn } from "@/lib/utils";
import { markAllRead, openNotification } from "./actions";

export const metadata: Metadata = { title: "Notifications" };

type Notification = {
  id: string;
  kind:
    | "task_assigned" | "task_comment" | "task_done" | "task_due"
    | "chat_direct" | "announcement" | "leave_requested" | "leave_decided" | "billing" | "mention";
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
};

const ICON: Record<Notification["kind"], { icon: IconName; tone: string }> = {
  task_assigned: { icon: "tasks", tone: "bg-brand-50 text-brand-600 dark:text-brand-700" },
  task_comment: { icon: "chat", tone: "bg-brand-50 text-brand-600 dark:text-brand-700" },
  task_done: { icon: "check", tone: "bg-emerald-50 text-emerald-600" },
  task_due: { icon: "clock", tone: "bg-amber-50 text-amber-700" },
  chat_direct: { icon: "chat", tone: "bg-sky-50 text-sky-700" },
  announcement: { icon: "bell", tone: "bg-marigold-50 text-marigold-700" },
  leave_requested: { icon: "leave", tone: "bg-sky-50 text-sky-700" },
  leave_decided: { icon: "leave", tone: "bg-sky-50 text-sky-700" },
  billing: { icon: "card", tone: "bg-slate-100 text-slate-600" },
  mention: { icon: "user", tone: "bg-brand-50 text-brand-600 dark:text-brand-700" },
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

  const groups = [
    { title: "Today", items: items.filter((n) => localDateIn(tz, new Date(n.created_at)) === today) },
    { title: "Earlier", items: items.filter((n) => localDateIn(tz, new Date(n.created_at)) !== today) },
  ].filter((g) => g.items.length);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Notifications"
        meta={unread ? `${unread} unread` : "All caught up"}
        actions={
          unread > 0 ? (
            <form action={markAllRead}>
              <button className="btn-secondary"><Icon name="check" className="h-4 w-4" />Mark all as read</button>
            </form>
          ) : undefined
        }
      />

      {items.length === 0 ? (
        <div className="card"><EmptyState icon="bell" title="Nothing yet. Task updates, mentions and leave requests show up here." /></div>
      ) : (
        groups.map((g) => (
          <section key={g.title} className="space-y-2">
            <h2 className="px-1 text-xs font-medium text-slate-500">{g.title}</h2>
            <ul className="card divide-y divide-slate-100 overflow-hidden">
              {g.items.map((n) => {
                const ic = ICON[n.kind] ?? { icon: "bell" as IconName, tone: "bg-slate-100 text-slate-600" };
                return (
                  <li key={n.id}>
                    <form action={openNotification}>
                      <input type="hidden" name="id" value={n.id} />
                      <input type="hidden" name="link" value={n.link ?? "/dashboard/notifications"} />
                      <button className={cn("flex w-full items-start gap-3.5 px-5 py-4 text-left text-sm transition hover:bg-slate-50", !n.read_at && "bg-brand-50/50")}>
                        <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", ic.tone)}>
                          <Icon name={ic.icon} className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className={cn("block text-slate-900", !n.read_at && "font-semibold")}>{n.title}</span>
                          {n.body && <span className="mt-0.5 block truncate text-slate-500">{n.body}</span>}
                        </span>
                        <span className="shrink-0 pt-0.5 text-xs text-slate-400 tabular-nums">{when(n.created_at)}</span>
                        {!n.read_at && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-brand-600" aria-label="Unread" />}
                      </button>
                    </form>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
