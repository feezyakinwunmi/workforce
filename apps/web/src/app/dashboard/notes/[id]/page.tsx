import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { Note } from "@/lib/notes";
import { requireMember } from "@/lib/session";
import { StickyNote } from "./sticky-note";

export const metadata: Metadata = { title: "Note" };

export default async function NotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase } = await requireMember();
  const { data } = await supabase.from("notes").select("id, title, body, color, pinned, created_at, updated_at").eq("id", id).maybeSingle();
  if (!data) notFound();
  return <StickyNote note={data as Note} />;
}
