import Link from "next/link";
import { Icon } from "@/components/icons";
import { Logo } from "@/components/logo";
import { AppNav, type NavGroup } from "@/components/nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { Tour, TourButton, type TourStep } from "@/components/tour";
import { daysLeft, hasPro, hasStandard, isPaid } from "@/lib/billing";
import { getBilling } from "@/lib/billing-server";
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
  const screenshots = hasPro(billing) || org.settings.screenshots_enabled;

  const groups: NavGroup[] = [
    {
      items: [
        { href: "/dashboard", label: "Overview", icon: "overview", tour: "overview" },
        ...(org.settings.phone_clock !== false ? [{ href: "/dashboard/clock", label: "Clock in", icon: "phone" as const, tour: "clock" }] : []),
        { href: "/dashboard/activity", label: manager ? "Activity" : "My activity", icon: "activity", tour: "activity" },
        { href: "/dashboard/timesheets", label: "Timesheets", icon: "clock", tour: "timesheets" },
        ...(screenshots ? [{ href: "/dashboard/screenshots", label: "Screenshots", icon: "camera" as const, tour: "screenshots" }] : []),
        { href: "/dashboard/notifications", label: "Notifications", icon: "bell", badge: unread ?? 0, tour: "notifications" },
      ],
    },
    {
      title: "Work",
      items: [
        { href: "/dashboard/chat", label: "Chat", icon: "chat", badge: unreadChat, tour: "chat" },
        { href: "/dashboard/tasks", label: "Tasks", icon: "tasks", tour: "tasks" },
        ...(manager ? [{ href: "/dashboard/projects", label: "Projects", icon: "folder" as const }] : []),
        { href: "/dashboard/leave", label: "Leave", icon: "leave", badge: leaveWaiting ?? 0, tour: "leave" },
      ],
    },
    {
      title: admin ? "Company" : "Account",
      items: [
        { href: "/dashboard/team", label: "Team", icon: "users", tour: "team" },
        ...(admin
          ? [
              { href: "/dashboard/payroll", label: "Payroll", icon: "wallet" as const, tour: "payroll" },
              { href: "/dashboard/billing", label: "Plan and billing", icon: "card" as const, tour: "billing" },
              { href: "/dashboard/settings", label: "Company settings", icon: "settings" as const, tour: "settings" },
            ]
          : []),
        ...(hasStandard(billing) ? [{ href: "/dashboard/payslips", label: "My payslips", icon: "receipt" as const }] : []),
        { href: "/dashboard/profile", label: "My profile", icon: "user" },
      ],
    },
  ];

  const name = profile?.full_name || user.email || "";
  const first = (profile?.full_name || "").split(" ")[0];

  return (
    <div className="min-h-screen lg:flex">
      <AppNav
        groups={groups}
        header={
          <div className="space-y-3">
            <Link href="/dashboard" aria-label="Overview" className="inline-block"><Logo /></Link>
            <div className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-xs font-bold text-white">
                {org.name.slice(0, 1).toUpperCase()}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-slate-900">{org.name}</span>
                <span className="block text-xs text-slate-500">{tierName(billing.tier)}</span>
              </span>
            </div>
          </div>
        }
        footer={
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span data-tour="theme"><ThemeToggle /></span>
              <div className="flex items-center gap-1">
                <Link href="/download" className="btn-ghost px-2" title="Download the desktop app" data-tour="download">
                  <Icon name="download" />
                  <span className="sr-only">Download the desktop app</span>
                </Link>
                <span data-tour="help">
                  <TourButton className="btn-ghost px-2">
                    <Icon name="help" />
                    <span className="sr-only">Take the tour</span>
                  </TourButton>
                </span>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-xl px-1">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-marigold-100 text-xs font-semibold text-marigold-700">
                {initials(profile?.full_name ?? "", user.email ?? "")}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-slate-900">{name}</span>
                <span className="block text-xs text-slate-500">{ROLE_LABELS[member.role]}</span>
              </span>
              <form action="/auth/signout" method="post">
                <button className="btn-ghost px-2" title="Sign out">
                  <Icon name="logout" />
                  <span className="sr-only">Sign out</span>
                </button>
              </form>
            </div>
          </div>
        }
      />
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-8 print:p-0">
        <div className="mx-auto max-w-6xl">
          {banner && (
            <div
              className={`mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm print:hidden ${banner.urgent ? "border-amber-200 bg-amber-50 text-amber-900" : "border-brand-200 bg-brand-50 text-brand-900"}`}
            >
              <span className="flex items-center gap-2">
                <Icon name={banner.urgent ? "alert" : "info"} className="h-4 w-4" />
                {banner.text}
              </span>
              {banner.action && <Link href="/dashboard/billing" className="btn-primary btn-sm">{banner.action}</Link>}
            </div>
          )}
          {children}
        </div>
      </main>
      <Tour steps={tourSteps(admin, manager, first)} storageKey={`workbase-tour:${user.id}`} />
    </div>
  );
}

function tierName(tier: string) {
  return tier === "pro" ? "Pro plan" : tier === "standard" ? "Standard plan" : tier === "trial" ? "Free trial" : "Free plan";
}

/** The first-visit walkthrough, in the order someone new needs it. */
function tourSteps(admin: boolean, manager: boolean, first: string): TourStep[] {
  const hello = { title: `Welcome${first ? `, ${first}` : ""}`, body: "Here's a one-minute look around. Use the arrow keys or the buttons; you can leave any time." };
  if (admin) {
    return [
      hello,
      { target: "team", title: "Invite your team", body: "Add people by email or share an invite link on WhatsApp. Put them in teams and give managers their team." },
      { target: "download", title: "Workers install the desktop app", body: "Each person installs the app and clocks in. It only records while they are clocked in." },
      { target: "overview", title: "See who's working", body: "Overview shows who is working, idle or away right now, and how today is going." },
      { target: "activity", title: "Look at any day", body: "Hours, active and idle time, apps used and tasks worked on, hour by hour." },
      { target: "timesheets", title: "Weekly timesheets", body: "Everyone's hours for the week, with leave and holidays. Download them as a spreadsheet." },
      { target: "tasks", title: "Give out work", body: "Assign tasks with due dates. Time is logged against the task each person picks in the app." },
      { target: "chat", title: "Talk to your team", body: "Groups, direct messages, files and announcements, in one place." },
      { target: "leave", title: "Leave requests", body: "People request time off here and you approve it. Approved leave flows into timesheets and payroll." },
      { target: "payroll", title: "Monthly payroll", body: "Set each person's rate once. Pay, PAYE, pension and payslips are worked out from hours and leave." },
      { target: "settings", title: "Your rules", body: "Idle time, app tracking and screenshots are set here for the whole company." },
      { target: "help", title: "That's it", body: "Open this tour again from the question mark whenever you need it." },
    ];
  }
  return [
    hello,
    { target: "download", title: "Get the desktop app", body: "Install it and clock in when you start work. Nothing is recorded while you're clocked out." },
    { target: "clock", title: "Working away from a computer?", body: "Clock in from your phone here. Add it to your home screen to open it like an app." },
    { target: "activity", title: manager ? "Your team's days" : "Your day", body: manager ? "See hours, active and idle time and tasks for you and your team." : "Everything the app recorded about your work is here for you to see." },
    { target: "timesheets", title: "Timesheets", body: "Your hours for each week, including leave and holidays." },
    { target: "tasks", title: "Your tasks", body: "Tasks assigned to you. Pick one in the desktop app to log time to it." },
    { target: "chat", title: "Chat", body: "Message your team, share files and follow announcements." },
    { target: "leave", title: "Time off", body: "Request leave and see how many days you have left." },
    { target: "help", title: "That's it", body: "Open this tour again from the question mark whenever you need it." },
  ];
}

/** One line at the top of every page when the plan needs attention. */
function billingBanner(b: Awaited<ReturnType<typeof getBilling>>, admin: boolean) {
  const over = b.seat_limit !== null ? b.active_members - b.seat_limit : 0;
  if (!admin) {
    return b.can_track
      ? null
      : { text: "Your company's plan doesn't cover you yet, so you can't clock in. Ask your company admin.", urgent: true, action: null };
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
    return d <= 7 ? { text: `Your free trial ends in ${d} ${d === 1 ? "day" : "days"}.`, urgent: d <= 2, action: "Choose a plan" } : null;
  }
  if (isPaid(b)) {
    const d = daysLeft(b.paid_until);
    return d <= 5 ? { text: `Your plan ends in ${d} ${d === 1 ? "day" : "days"}.`, urgent: true, action: "Renew" } : null;
  }
  return null;
}
