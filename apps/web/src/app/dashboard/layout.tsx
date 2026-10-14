import Link from "next/link";
import { SideNav, type NavItem } from "@/components/nav";
import { daysLeft } from "@/lib/billing";
import { getBilling } from "@/lib/billing-server";
import { APP_NAME } from "@/lib/config";
import { requireMember } from "@/lib/session";
import { isAdminRole, ROLE_LABELS } from "@/lib/types";
import { initials } from "@/lib/utils";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { supabase, org, member, profile, user } = await requireMember();
  const admin = isAdminRole(member.role);
  const manager = admin || member.role === "manager";
  const [{ count: unread }, billing, { data: channels }, { count: leaveWaiting }] = await Promise.all([
    supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", user.id).is("read_at", null),
    getBilling(),
    supabase.rpc("my_channels"),
    manager
      ? supabase.from("leave_requests").select("id", { count: "exact", head: true }).eq("status", "pending").neq("user_id", user.id)
      : Promise.resolve({ count: 0 }),
  ]);
  const unreadChat = ((channels ?? []) as Array<{ unread: number; archived: boolean }>)
    .filter((c) => !c.archived)
    .reduce((s, c) => s + (c.unread ?? 0), 0);
  const banner = billingBanner(billing, admin);

  const items: NavItem[] = [
    { href: "/dashboard", label: "Overview" },
    { href: "/dashboard/chat", label: "Chat", badge: unreadChat },
    { href: "/dashboard/notifications", label: "Notifications", badge: unread ?? 0 },
    { href: "/dashboard/activity", label: admin || member.role === "manager" ? "Activity" : "My activity" },
    { href: "/dashboard/timesheets", label: "Timesheets" },
    { href: "/dashboard/team", label: "Team" },
    { href: "/dashboard/tasks", label: "Tasks" },
    { href: "/dashboard/leave", label: "Leave", badge: leaveWaiting ?? 0 },
    ...(admin || member.role === "manager" ? [{ href: "/dashboard/projects", label: "Projects" }] : []),
    ...(admin ? [{ href: "/dashboard/settings", label: "Company settings" }] : []),
    ...(admin ? [{ href: "/dashboard/billing", label: "Plan and billing" }] : []),
    { href: "/dashboard/profile", label: "My profile" },
    { href: "/download", label: "Download desktop app" },
  ];

  const name = profile?.full_name || user.email || "";

  return (
    <div className="min-h-screen md:flex">
      <aside className="border-b border-slate-200 bg-white md:sticky md:top-0 md:flex md:h-screen md:w-60 md:flex-col md:border-r md:border-b-0">
        <div className="flex items-center gap-3 px-4 py-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-600 font-bold text-white">
            {APP_NAME[0]}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{org.name}</p>
            <p className="text-xs text-slate-500">{APP_NAME}</p>
          </div>
        </div>
        <div className="px-3 pb-3 md:flex-1">
          <SideNav items={items} />
        </div>
        <div className="hidden items-center gap-3 border-t border-slate-200 px-4 py-3 md:flex">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-700">
            {initials(profile?.full_name ?? "", user.email ?? "")}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{name}</p>
            <p className="text-xs text-slate-500">{ROLE_LABELS[member.role]}</p>
          </div>
          <form action="/auth/signout" method="post">
            <button className="text-xs text-slate-500 hover:text-slate-800" title="Sign out">
              Sign out
            </button>
          </form>
        </div>
      </aside>
      <main className="flex-1 px-4 py-8 md:px-10">
        <div className="mx-auto max-w-5xl">
          {banner && (
            <div className={`mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${banner.urgent ? "border-amber-200 bg-amber-50 text-amber-900" : "border-brand-200 bg-brand-50 text-brand-900"}`}>
              <span>{banner.text}</span>
              {banner.action && <Link href="/dashboard/billing" className="btn-primary btn-sm">{banner.action}</Link>}
            </div>
          )}
          {children}
        </div>
      </main>
    </div>
  );
}

/** One line at the top of every page when the plan needs attention. */
function billingBanner(b: Awaited<ReturnType<typeof getBilling>>, admin: boolean) {
  const over = b.seat_limit !== null ? b.active_members - b.seat_limit : 0;
  if (!admin) {
    return b.can_track
      ? null
      : { text: "Your company's plan doesn't cover you yet, so the desktop app can't clock you in. Ask your company admin.", urgent: true, action: null };
  }
  if (over > 0) {
    return {
      text: `${over} ${over === 1 ? "person isn't" : "people aren't"} covered by your ${b.tier === "free" ? "free plan" : "plan"} and can't clock in.`,
      urgent: true,
      action: b.tier === "free" ? "Upgrade" : "Add people",
    };
  }
  if (b.tier === "trial") {
    const d = daysLeft(b.trial_ends_at);
    return d <= 7 ? { text: `Your free trial ends in ${d} ${d === 1 ? "day" : "days"}. Choose a plan to keep every feature.`, urgent: d <= 2, action: "Choose a plan" } : null;
  }
  if (b.tier === "standard") {
    const d = daysLeft(b.paid_until);
    return d <= 5 ? { text: `Your plan ends in ${d} ${d === 1 ? "day" : "days"}.`, urgent: true, action: "Renew" } : null;
  }
  return null;
}
