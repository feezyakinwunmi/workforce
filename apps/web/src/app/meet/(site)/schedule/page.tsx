import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getMeetUser, requestBase } from "@/lib/meet/server";
import { ScheduleForm } from "./form";

export const metadata: Metadata = { title: "Schedule a meeting" };

export default async function SchedulePage() {
  const [{ user }, base] = await Promise.all([getMeetUser(), requestBase()]);
  if (!user) redirect(`/login?next=${encodeURIComponent(`${base}/schedule`)}`);
  return (
    <div className="mx-auto max-w-xl px-4 py-10 sm:px-6">
      <h1 className="font-display text-3xl font-bold tracking-tight text-slate-900">Schedule a meeting</h1>
      <div className="card mt-6 p-6"><ScheduleForm /></div>
    </div>
  );
}
