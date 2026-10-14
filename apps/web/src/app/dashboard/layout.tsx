import { SideNav, type NavItem } from "@/components/nav";
import { APP_NAME } from "@/lib/config";
import { requireMember } from "@/lib/session";
import { isAdminRole, ROLE_LABELS } from "@/lib/types";
import { initials } from "@/lib/utils";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { supabase, org, member, profile, user } = await requireMember();
  const admin = isAdminRole(member.role);
  const { count: unread } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .is("read_at", null);

  const items: NavItem[] = [
    { href: "/dashboard", label: "Overview" },
    { href: "/dashboard/notifications", label: "Notifications", badge: unread ?? 0 },
    { href: "/dashboard/activity", label: admin || member.role === "manager" ? "Activity" : "My activity" },
    { href: "/dashboard/timesheets", label: "Timesheets" },
    { href: "/dashboard/team", label: "Team" },
    { href: "/dashboard/tasks", label: "Tasks" },
    ...(admin || member.role === "manager" ? [{ href: "/dashboard/projects", label: "Projects" }] : []),
    ...(admin ? [{ href: "/dashboard/settings", label: "Company settings" }] : []),
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
        <div className="mx-auto max-w-5xl">{children}</div>
      </main>
    </div>
  );
}
