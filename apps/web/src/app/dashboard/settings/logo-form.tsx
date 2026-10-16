"use client";

import { useActionState, useState } from "react";
import { FormMessage, SubmitButton } from "@/components/form";
import { LogoPicker } from "@/components/logo-picker";
import { saveLogo } from "./actions";

export function LogoForm({ current, name }: { current: string | null; name: string }) {
  const [state, action] = useActionState(saveLogo, undefined);
  const [remove, setRemove] = useState(false);
  return (
    <form action={action} className="space-y-4 py-3.5" onChange={() => setRemove(false)}>
      <input type="hidden" name="remove" value={remove ? "1" : ""} />
      <LogoPicker current={current} name={name} onRemove={() => setRemove(true)} />
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton className="btn-primary" pendingText="Saving…">Save logo</SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}
