"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/form";
import { planMyWeek, type ChatState } from "./actions";

/** "Plan my week": Padi fills the next 7 days with the brand's posts. Takes 20–40 seconds. */
export function PlanWeekButton({ count }: { count: number }) {
  const [state, action] = useActionState<ChatState, FormData>(planMyWeek, undefined);
  return (
    <form action={action} className="mt-3">
      <SubmitButton className="btn-primary w-full" pendingText={`Planning ${count} posts…`}>
        Plan my week
      </SubmitButton>
      {state?.error && <p role="alert" className="mt-2 text-sm text-red-600">{state.error}</p>}
    </form>
  );
}
