"use client";

import { useActionState, useState } from "react";
import { FormMessage, SubmitButton, TimezoneSelect } from "@/components/form";
import { createPage } from "./actions";

const slug = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30);

export function SetupForm({ suggestedName, base }: { suggestedName: string; base: string }) {
  const [state, action] = useActionState(createPage, undefined);
  const [name, setName] = useState(suggestedName);
  const [handle, setHandle] = useState(slug(suggestedName));
  const [touched, setTouched] = useState(false);
  return (
    <form action={action} className="space-y-4">
      <label className="block">
        <span className="label">Name customers will see</span>
        <input
          name="name"
          required
          maxLength={80}
          className="input"
          value={name}
          placeholder="e.g. Amaka Obi Skin Clinic"
          onChange={(e) => {
            setName(e.target.value);
            if (!touched) setHandle(slug(e.target.value));
          }}
        />
      </label>
      <label className="block">
        <span className="label">Your address</span>
        <div className="flex items-center overflow-hidden rounded-lg border border-slate-300 bg-surface focus-within:ring-2 focus-within:ring-brand-500">
          <span className="shrink-0 border-r border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">{(base || "book")}/</span>
          <input
            name="handle"
            required
            minLength={3}
            maxLength={30}
            pattern="[a-z0-9][a-z0-9\-]{1,28}[a-z0-9]"
            title="3 to 30 letters, numbers or dashes"
            className="w-full bg-transparent px-3 py-2 text-sm outline-none"
            value={handle}
            onChange={(e) => {
              setTouched(true);
              setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
            }}
          />
        </div>
      </label>
      <label className="block">
        <span className="label">Your time zone</span>
        <TimezoneSelect />
      </label>
      <FormMessage state={state} />
      <SubmitButton pendingText="Creating…">Create my page</SubmitButton>
    </form>
  );
}
