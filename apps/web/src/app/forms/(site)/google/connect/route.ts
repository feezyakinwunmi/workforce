import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { authUrl, sheetsConfigured, signState } from "@/lib/forms/google";
import { formsOrigin, formsRequestBase } from "@/lib/forms/server";
import { getMeetUser } from "@/lib/meet/server";

/** Start connecting a form to Google Sheets (Pro). Google sends the maker back to ./callback. */
export async function GET(req: Request) {
  const formId = new URL(req.url).searchParams.get("form") ?? "";
  const [{ supabase, user }, origin, base] = await Promise.all([getMeetUser(), formsOrigin(), formsRequestBase()]);
  const back = (q: string) => NextResponse.redirect(`${origin}${base}/build/${formId}/responses?${q}`);
  if (!user) return NextResponse.redirect(`${origin}/login?next=${encodeURIComponent(`${base}/build/${formId}/responses`)}`);
  if (!/^[0-9a-f-]{36}$/i.test(formId)) return NextResponse.redirect(`${origin}${base || "/"}`);
  const { data: form } = await supabase.from("forms").select("id").eq("id", formId).maybeSingle();
  if (!form) return NextResponse.redirect(`${origin}${base || "/"}`);
  if (!sheetsConfigured()) return back(`sheet_error=${encodeURIComponent("Google Sheets isn't set up on this site yet.")}`);
  const { data: plan } = await supabase.rpc("book_my_plan");
  if ((plan as { tier?: string } | null)?.tier !== "pro") return back(`sheet_error=${encodeURIComponent("Google Sheets sync is part of Pro.")}`);

  const nonce = randomBytes(16).toString("hex");
  const res = NextResponse.redirect(authUrl(`${origin}${base}/google/callback`, signState({ uid: user.id, form: formId, nonce })));
  res.cookies.set("wf_google", nonce, { httpOnly: true, secure: origin.startsWith("https"), sameSite: "lax", path: "/", maxAge: 900 });
  return res;
}
