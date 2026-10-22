import { NextResponse } from "next/server";
import { getMeetUser } from "@/lib/meet/server";

/**
 * Open a file someone attached to a form. A fresh 5-minute link every time, so links in the
 * answers table and the CSV keep working; Storage itself only lets the form's maker read it.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const path = new URL(req.url).searchParams.get("p") ?? "";
  const { supabase, user } = await getMeetUser();
  if (!user || !/^[0-9a-f-]{36}$/i.test(id) || !path.startsWith(`${id}/`)) return new NextResponse("Not found", { status: 404 });
  const download = new URL(req.url).searchParams.get("download") === "1";
  const { data } = await supabase.storage.from("form-files").createSignedUrl(path, 300, download ? { download: true } : undefined);
  if (!data?.signedUrl) return new NextResponse("Not found", { status: 404 });
  return NextResponse.redirect(data.signedUrl, { headers: { "Cache-Control": "no-store" } });
}
