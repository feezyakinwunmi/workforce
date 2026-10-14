"use client";

import { useActionState, useEffect, useRef } from "react";
import { CopyButton, FormMessage, SubmitButton } from "@/components/form";
import type { Team } from "@/lib/types";
import { createTeam, inviteMember } from "./actions";

export function InviteForm({ teams }: { teams: Team[] }) {
  const [state, action] = useActionState(inviteMember, undefined);
  const formRef = useRef<HTMLFormElement>(null);
  const link = state?.success?.match(/https?:\/\/\S+/)?.[0];

  useEffect(() => {
    if (state?.success) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={action} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_140px_160px_auto] sm:items-end">
        <div>
          <label className="label" htmlFor="invite-email">Email</label>
          <input className="input" id="invite-email" name="email" type="email" placeholder="name@company.com" required />
        </div>
        <div>
          <label className="label" htmlFor="invite-role">Role</label>
          <select className="input" id="invite-role" name="role" defaultValue="worker">
            <option value="worker">Worker</option>
            <option value="manager">Manager</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="invite-team">Team</label>
          <select className="input" id="invite-team" name="team_id" defaultValue="">
            <option value="">No team</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
        <SubmitButton pendingText="Inviting…">Invite</SubmitButton>
      </div>
      {state?.error && <FormMessage state={state} />}
      {link && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          <span>Invitation created. Send the link by email or WhatsApp:</span>
          <CopyButton text={link} />
          <a className="btn-secondary btn-sm" target="_blank" rel="noreferrer"
             href={`https://wa.me/?text=${encodeURIComponent(`You've been invited to join our team. Accept here: ${link}`)}`}>
            Share on WhatsApp
          </a>
        </div>
      )}
    </form>
  );
}

export function CreateTeamForm() {
  const [state, action] = useActionState(createTeam, undefined);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.success) formRef.current?.reset();
  }, [state]);
  return (
    <form ref={formRef} action={action} className="space-y-2">
      <div className="flex gap-2">
        <input className="input" name="name" placeholder="e.g. Design, Sales, Support" maxLength={80} required aria-label="Team name" />
        <SubmitButton className="btn-secondary" pendingText="Adding…">Add team</SubmitButton>
      </div>
      <FormMessage state={state} />
    </form>
  );
}

/** Button that asks for confirmation before submitting its form. */
export function ConfirmSubmit({ message, children, className = "btn-danger btn-sm" }: {
  message: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="submit"
      className={className}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
