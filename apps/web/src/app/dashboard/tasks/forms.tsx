"use client";

import { useActionState, useEffect, useRef } from "react";
import { FormMessage, SubmitButton } from "@/components/form";
import { PRIORITIES, PRIORITY_LABEL, type Task } from "@/lib/tasks";
import { addComment, createTask, updateTask } from "./actions";

export type Option = { value: string; label: string };

/** Create a task, or edit one (when `task` is given). */
export function TaskForm({
  task,
  projects,
  people,
  defaultAssignee = "",
  defaultProject = "",
}: {
  task?: Task;
  projects: Option[];
  people: Option[]; // who may be picked as assignee ("" = nobody is added automatically)
  defaultAssignee?: string;
  defaultProject?: string;
}) {
  const [state, action] = useActionState(task ? updateTask : createTask, undefined);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (!task && state?.success) formRef.current?.reset();
  }, [state, task]);

  const id = (name: string) => `${task ? "edit" : "new"}-${name}`;
  return (
    <form ref={formRef} action={action} className="space-y-3">
      {task && <input type="hidden" name="id" value={task.id} />}
      <div>
        <label className="label" htmlFor={id("title")}>Title</label>
        <input className="input" id={id("title")} name="title" defaultValue={task?.title} maxLength={200} required
               placeholder="e.g. Design the invoice page" />
      </div>
      <div>
        <label className="label" htmlFor={id("description")}>Details <span className="font-normal text-slate-400">(optional)</span></label>
        <textarea className="input min-h-20" id={id("description")} name="description" defaultValue={task?.description ?? ""} maxLength={5000} rows={3} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <label className="label" htmlFor={id("assignee")}>Assigned to</label>
          <select className="input" id={id("assignee")} name="assignee_id" defaultValue={task ? (task.assignee_id ?? "") : defaultAssignee}>
            <option value="">Nobody yet</option>
            {people.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor={id("project")}>Project</label>
          <select className="input" id={id("project")} name="project_id" defaultValue={task ? (task.project_id ?? "") : defaultProject}>
            <option value="">No project</option>
            {projects.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor={id("priority")}>Priority</label>
          <select className="input" id={id("priority")} name="priority" defaultValue={task?.priority ?? "medium"}>
            {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor={id("due")}>Due date</label>
          <input className="input" id={id("due")} type="date" name="due_date" defaultValue={task?.due_date ?? ""} />
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-40">
          <label className="label" htmlFor={id("estimate")}>Estimate (hours)</label>
          <input className="input" id={id("estimate")} name="estimate_hours" type="number" min="0" step="0.25"
                 defaultValue={task?.estimate_minutes != null ? String(Math.round((task.estimate_minutes / 60) * 100) / 100) : ""} />
        </div>
        <SubmitButton pendingText={task ? "Saving…" : "Creating…"}>{task ? "Save changes" : "Create task"}</SubmitButton>
      </div>
      <FormMessage state={state} />
    </form>
  );
}

export function CommentForm({ taskId }: { taskId: string }) {
  const [state, action] = useActionState(addComment, undefined);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.success) formRef.current?.reset();
  }, [state]);
  return (
    <form ref={formRef} action={action} className="space-y-2">
      <input type="hidden" name="task_id" value={taskId} />
      <label className="sr-only" htmlFor="comment-body">Comment</label>
      <textarea id="comment-body" className="input min-h-20" name="body" maxLength={5000} rows={3} required
                placeholder="Write an update or ask a question…" />
      <div className="flex items-center justify-between gap-3">
        {state?.error ? <FormMessage state={state} /> : <span />}
        <SubmitButton className="btn-secondary" pendingText="Posting…">Post comment</SubmitButton>
      </div>
    </form>
  );
}
