"use client";

import { useActionState, useEffect, useRef } from "react";
import { FormMessage, SubmitButton } from "@/components/form";
import { PROJECT_COLORS, PROJECT_DOT, type Project } from "@/lib/tasks";
import { cn } from "@/lib/utils";
import { createProject, updateProject } from "./actions";

const COLOR_NAME: Record<string, string> = {
  violet: "Violet",
  blue: "Blue",
  green: "Green",
  amber: "Amber",
  red: "Red",
  pink: "Pink",
  slate: "Grey",
};

export function ProjectForm({ project }: { project?: Project }) {
  const [state, action] = useActionState(project ? updateProject : createProject, undefined);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (!project && state?.success) formRef.current?.reset();
  }, [state, project]);
  const key = project?.id ?? "new";

  return (
    <form ref={formRef} action={action} className="space-y-3">
      {project && <input type="hidden" name="id" value={project.id} />}
      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <div>
          <label className="label" htmlFor={`${key}-name`}>Name</label>
          <input className="input" id={`${key}-name`} name="name" defaultValue={project?.name} maxLength={80} required
                 placeholder="e.g. Website redesign, Client: Acme" />
        </div>
        <fieldset>
          <legend className="label">Colour</legend>
          <div className="flex gap-1.5 py-2">
            {PROJECT_COLORS.map((c) => (
              <label key={c} className="cursor-pointer" title={COLOR_NAME[c]}>
                <input type="radio" name="color" value={c} defaultChecked={(project?.color ?? "violet") === c} className="peer sr-only" />
                <span className={cn("block h-6 w-6 rounded-full ring-offset-2 peer-checked:ring-2 peer-checked:ring-slate-700 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500", PROJECT_DOT[c])} />
                <span className="sr-only">{COLOR_NAME[c]}</span>
              </label>
            ))}
          </div>
        </fieldset>
      </div>
      <div>
        <label className="label" htmlFor={`${key}-description`}>Description <span className="font-normal text-slate-400">(optional)</span></label>
        <input className="input" id={`${key}-description`} name="description" defaultValue={project?.description ?? ""} maxLength={1000} />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton className={project ? "btn-secondary" : "btn-primary"} pendingText="Saving…">
          {project ? "Save" : "Create project"}
        </SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}
