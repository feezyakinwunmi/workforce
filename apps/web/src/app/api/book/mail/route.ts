import { NextResponse } from "next/server";
import { processBookMail } from "@/lib/book/mail";

/** Called by the database every 5 minutes when Book emails are due (no secret: it only sends what is due, each once). */
export async function POST() {
  const sent = await processBookMail();
  return NextResponse.json({ sent });
}
