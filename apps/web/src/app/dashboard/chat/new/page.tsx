import type { Metadata } from "next";
import { requireMember } from "@/lib/session";
import { isManagerOrAdmin } from "@/lib/tasks";
import { displayName, loadPeople } from "@/lib/tracking";
import { ROLE_LABELS } from "@/lib/types";
import { initials } from "@/lib/utils";
import { openDirect } from "../actions";
import { NewGroupForm } from "./forms";

export const metadata: Metadata = { title: "New message" };

export default async function NewChatPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const { supabase, member: me } = await requireMember();
  const [{ members, profiles }, { data: online }] = await Promise.all([loadPeople(supabase), supabase.rpc("online_member_ids")]);
  const onlineIds = new Set((online ?? []) as string[]);
  const others = members
    .filter((m) => m.status === "active" && m.user_id !== me.user_id)
    .map((m) => ({ m, name: displayName(profiles.get(m.user_id)), p: profiles.get(m.user_id) }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="space-y-6">
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <section className="card p-5">
        <h2 className="mb-3 font-semibold">Message someone</h2>
        {others.length === 0 ? (
          <p className="text-sm text-slate-500">Nobody else is in your company yet.</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {others.map(({ m, name, p }) => (
              <li key={m.user_id}>
                <form action={openDirect}>
                  <input type="hidden" name="user_id" value={m.user_id} />
                  <button className="flex w-full items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 text-left text-sm hover:border-brand-200 hover:bg-brand-50">
                    <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-700">
                      {initials(p?.full_name ?? "", p?.email ?? "")}
                      {onlineIds.has(m.user_id) && <span className="absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full border-2 border-surface bg-emerald-500" aria-label="Working now" />}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{name}</span>
                      <span className="block truncate text-xs text-slate-500">{m.job_title || ROLE_LABELS[m.role]}</span>
                    </span>
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      {isManagerOrAdmin(me) ? (
        <section className="card p-5">
          <h2 className="mb-3 font-semibold">New group</h2>
          <NewGroupForm people={others.map(({ m, name }) => ({ id: m.user_id, name }))} />
        </section>
      ) : (
        <p className="text-sm text-slate-500">Need a group for your team? Ask a manager or admin to create one.</p>
      )}
    </div>
  );
}
