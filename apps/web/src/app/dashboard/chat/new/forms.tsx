"use client";

import { useActionState, useState } from "react";
import { FormMessage, SubmitButton } from "@/components/form";
import { createGroup } from "../actions";

export function NewGroupForm({ people }: { people: Array<{ id: string; name: string }> }) {
  const [state, action] = useActionState(createGroup, undefined);
  const [visibility, setVisibility] = useState<"private" | "public">("private");
  const [filter, setFilter] = useState("");
  const shown = people.filter((p) => p.name.toLowerCase().includes(filter.toLowerCase()));
  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="group-name">Name</label>
          <input className="input" id="group-name" name="name" maxLength={60} required placeholder="e.g. design-team, sales, project-x" />
        </div>
        <div>
          <label className="label" htmlFor="group-description">What it&apos;s for <span className="font-normal text-slate-400">(optional)</span></label>
          <input className="input" id="group-description" name="description" maxLength={300} />
        </div>
      </div>
      <fieldset>
        <legend className="label">Who can see it</legend>
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input type="radio" name="visibility" value="private" checked={visibility === "private"} onChange={() => setVisibility("private")} />
            Private: only the people you add
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="visibility" value="public" checked={visibility === "public"} onChange={() => setVisibility("public")} />
            Open: everyone in the company
          </label>
        </div>
      </fieldset>
      {visibility === "private" && (
        <div>
          <p className="label">Members</p>
          <input className="input mb-2" placeholder="Search people" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Search people" />
          <div className="max-h-60 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2 text-sm">
            {people.map((p) => (
              <label key={p.id} className={shown.includes(p) ? "flex items-center gap-2 rounded px-1 py-0.5 hover:bg-slate-50" : "hidden"}>
                <input type="checkbox" name="member_ids" value={p.id} />
                {p.name}
              </label>
            ))}
          </div>
        </div>
      )}
      <div className="flex items-center gap-3">
        <SubmitButton pendingText="Creating…">Create group</SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}
