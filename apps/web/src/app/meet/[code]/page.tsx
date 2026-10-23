import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getMeetUser, requestBase } from "@/lib/meet/server";
import { notesConfigured } from "@/lib/meet/notes";
import { MeetingApp } from "./meeting";

export const metadata: Metadata = { title: "Meeting" };

export default async function MeetingPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const clean = code.toLowerCase();
  if (!/^[a-z]{3}-[a-z]{4}-[a-z]{3}$/.test(clean)) notFound();
  const [{ name }, base] = await Promise.all([getMeetUser(), requestBase()]);
  return <MeetingApp code={clean} base={base} signedInName={name} aiAvailable={notesConfigured()} />;
}
