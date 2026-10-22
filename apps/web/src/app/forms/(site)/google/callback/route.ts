import { NextResponse, type NextRequest } from "next/server";
import { createSheet, exchangeCode, readState, rebuildSheet, seal } from "@/lib/forms/google";
import { formsOrigin, formsRequestBase } from "@/lib/forms/server";
import { getMeetUser } from "@/lib/meet/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Google sends the maker back here. The state must be ours (signed), match the cookie set when
 * they clicked Connect, and belong to the person signed in now. Then: keep the (encrypted) refresh
 * token, make a spreadsheet for the form and write every answer so far into it.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const [{ user }, origin, base] = await Promise.all([getMeetUser(), formsOrigin(), formsRequestBase()]);
  const state = readState(url.searchParams.get("state") ?? "");
  const nonce = req.cookies.get("wf_google")?.value;
  const home = NextResponse.redirect(`${origin}${base || "/"}`);
  if (!state || !user || state.uid !== user.id || !nonce || nonce !== state.nonce) return home;
  const back = (q: string) => {
    const r = NextResponse.redirect(`${origin}${base}/build/${state.form}/responses?${q}`);
    r.cookies.delete("wf_google");
    return r;
  };
  if (url.searchParams.get("error")) return back(`sheet_error=${encodeURIComponent("Google sign-in was cancelled.")}`);

  const admin = createAdminClient();
  const { data: form } = await admin.from("forms").select("id, title, owner_id").eq("id", state.form).maybeSingle();
  const f = form as { id: string; title: string; owner_id: string } | null;
  if (!f || f.owner_id !== user.id) return home;
  try {
    const g = await exchangeCode(url.searchParams.get("code") ?? "", `${origin}${base}/google/callback`);
    if (g.refresh) {
      const { error } = await admin.from("form_google_accounts").upsert({ user_id: user.id, email: g.email, refresh_token_enc: seal(g.refresh), updated_at: new Date().toISOString() });
      if (error) throw new Error(error.message);
    } else {
      const { data: had } = await admin.from("form_google_accounts").select("user_id").eq("user_id", user.id).maybeSingle();
      if (!had) throw new Error("Google didn't give lasting access. Remove Workbase Forms from your Google account's connected apps, then connect again.");
    }
    const sheet = await createSheet(user.id, f.title);
    const { error } = await admin.from("form_sheets").upsert({ form_id: f.id, owner_id: user.id, spreadsheet_id: sheet.id, sheet_url: sheet.url, connected_at: new Date().toISOString(), last_error: null });
    if (error) throw new Error(error.message);
    await admin.from("form_responses").update({ sheet_row: null, sheet_synced_at: null }).eq("form_id", f.id);
    const problem = await rebuildSheet(f.id);
    return back(problem ? `sheet_error=${encodeURIComponent(problem)}` : "sheet=connected");
  } catch (e) {
    return back(`sheet_error=${encodeURIComponent(e instanceof Error ? e.message : "Couldn't connect Google Sheets.")}`);
  }
}
