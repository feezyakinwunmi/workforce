// Server only: Workbase Forms → Google Sheets.
//
// The maker connects their Google account once (OAuth, scope drive.file: we can only see and
// change spreadsheets this app creates, nothing else in their Drive). The refresh token is
// encrypted here (AES-256-GCM, key derived from the server's service-role key) before it is
// stored in form_google_accounts, which only the service role can read. Each connected form gets
// its own spreadsheet; every answer is one row (row 1 = the questions). Edited answers update
// their row. Anything that fails is retried by the nightly job (form_sheet_backlog).
import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { siteUrl } from "@/lib/utils";
import { formsLink } from "./paths";
import { AMOUNT_KEY, answerText, isFileAnswer, isStatic, naira, type Answers, type Field } from "./schema";

const SCOPES = "openid email https://www.googleapis.com/auth/drive.file";
export const sheetsConfigured = () => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.SUPABASE_SERVICE_ROLE_KEY);

function key() {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("Server key missing");
  return Buffer.from(hkdfSync("sha256", secret, "workbase-forms", "google-refresh-token", 32));
}

export function seal(text: string) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([c.update(text, "utf8"), c.final()]);
  return `v1.${Buffer.concat([iv, c.getAuthTag(), body]).toString("base64url")}`;
}

export function open(sealed: string) {
  const raw = Buffer.from(sealed.replace(/^v1\./, ""), "base64url");
  const d = createDecipheriv("aes-256-gcm", key(), raw.subarray(0, 12));
  d.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString("utf8");
}

/** Signed OAuth state: who started it, for which form, a nonce (also in a cookie), and expiry. */
export function signState(payload: { uid: string; form: string; nonce: string }) {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + 15 * 60_000 })).toString("base64url");
  const mac = createHmac("sha256", key()).update(body).digest("base64url");
  return `${body}.${mac}`;
}

export function readState(state: string): { uid: string; form: string; nonce: string } | null {
  const [body, mac] = state.split(".");
  if (!body || !mac) return null;
  const want = createHmac("sha256", key()).update(body).digest("base64url");
  if (want.length !== mac.length || !timingSafeEqual(Buffer.from(want), Buffer.from(mac))) return null;
  const p = JSON.parse(Buffer.from(body, "base64url").toString()) as { uid: string; form: string; nonce: string; exp: number };
  return p.exp > Date.now() ? p : null;
}

export function authUrl(redirectUri: string, state: string) {
  const u = new URL(process.env.GOOGLE_AUTH_URL || "https://accounts.google.com/o/oauth2/v2/auth"); // env only for local tests
  u.searchParams.set("client_id", process.env.GOOGLE_CLIENT_ID!);
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", SCOPES);
  u.searchParams.set("access_type", "offline");
  u.searchParams.set("prompt", "consent");
  u.searchParams.set("include_granted_scopes", "true");
  u.searchParams.set("state", state);
  return u.toString();
}

const OAUTH = process.env.GOOGLE_OAUTH_BASE || "https://oauth2.googleapis.com"; // stand-in for local tests only
const SHEETS = process.env.GOOGLE_SHEETS_BASE || "https://sheets.googleapis.com";
const USERINFO = process.env.GOOGLE_USERINFO_URL || "https://openidconnect.googleapis.com/v1/userinfo";

export async function exchangeCode(code: string, redirectUri: string) {
  const res = await fetch(`${OAUTH}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code, redirect_uri: redirectUri, grant_type: "authorization_code",
      client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    cache: "no-store",
  });
  const j = (await res.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; scope?: string; error_description?: string };
  if (!res.ok || !j.access_token) throw new Error(j.error_description || "Google didn't accept the sign-in.");
  if (j.scope && !j.scope.includes("drive.file")) throw new Error("Please tick the box that lets Workbase Forms create spreadsheets.");
  const who = await fetch(USERINFO, { headers: { Authorization: `Bearer ${j.access_token}` }, cache: "no-store" })
    .then((r) => r.json() as Promise<{ email?: string }>).catch(() => ({ email: "" }));
  return { access: j.access_token, refresh: j.refresh_token ?? null, email: who.email ?? "" };
}

class GoogleError extends Error {
  constructor(message: string, public reconnect = false) {
    super(message);
  }
}

async function accessToken(userId: string) {
  const admin = createAdminClient();
  const { data } = await admin.from("form_google_accounts").select("refresh_token_enc").eq("user_id", userId).maybeSingle();
  const sealed = (data as { refresh_token_enc: string } | null)?.refresh_token_enc;
  if (!sealed) throw new GoogleError("Connect Google again.", true);
  let refresh: string;
  try {
    refresh = open(sealed);
  } catch {
    throw new GoogleError("Connect Google again.", true);
  }
  const res = await fetch(`${OAUTH}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refresh, grant_type: "refresh_token",
      client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    cache: "no-store",
  });
  const j = (await res.json().catch(() => ({}))) as { access_token?: string; error?: string };
  if (!res.ok || !j.access_token) {
    throw new GoogleError(j.error === "invalid_grant" ? "Google access was removed. Connect Google again." : "Google didn't answer. We'll try again.", j.error === "invalid_grant");
  }
  return j.access_token;
}

async function sheetsApi<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${SHEETS}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
    cache: "no-store",
  });
  const j = (await res.json().catch(() => ({}))) as T & { error?: { message?: string; status?: string } };
  if (!res.ok) {
    const gone = res.status === 404 || res.status === 403;
    throw new GoogleError(gone ? "The spreadsheet was deleted or can't be reached. Connect it again." : j.error?.message || "Google Sheets refused the change.", gone);
  }
  return j;
}

/** Column headings and one row of values for an answer. Files link to the maker's download page. */
function columns(fields: Field[]) {
  return fields.filter((f) => !isStatic(f.type));
}
function header(fields: Field[]) {
  return ["Sent (Lagos time)", ...columns(fields).map((f) => f.label), "Amount typed", "Paid", "Payment", "Edited"];
}
type Row = { id: string; answers: Answers; amount_kobo: number; status: string; created_at: string; edited_at: string | null; sheet_row: number | null };
function rowOf(fields: Field[], r: Row, fileLink: (path: string) => string) {
  const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { timeZone: "Africa/Lagos" });
  return [
    when(r.created_at),
    ...columns(fields).map((f) => {
      const a = r.answers[f.id];
      return isFileAnswer(a) ? `${a.name} — ${fileLink(a.path)}` : answerText(a, f.type);
    }),
    r.answers[AMOUNT_KEY] ? naira(Number(r.answers[AMOUNT_KEY])) : "",
    r.amount_kobo ? naira(r.amount_kobo) : "",
    r.amount_kobo === 0 ? "" : r.status === "paid" ? "Paid" : "Not paid",
    r.edited_at ? when(r.edited_at) : "",
  ];
}
const colName = (n: number) => {
  let s = "";
  for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s;
  return s;
};

/** A new spreadsheet in the maker's Drive for this form. */
export async function createSheet(userId: string, title: string) {
  const token = await accessToken(userId);
  const s = await sheetsApi<{ spreadsheetId: string; spreadsheetUrl: string }>(token, "/v4/spreadsheets", {
    method: "POST",
    body: JSON.stringify({ properties: { title: `${title} (Workbase Forms)`.slice(0, 100) }, sheets: [{ properties: { title: "Answers", gridProperties: { frozenRowCount: 1 } } }] }),
  });
  return { id: s.spreadsheetId, url: s.spreadsheetUrl };
}

type Ctx = { form: { id: string; fields: Field[] }; sheet: { spreadsheet_id: string; owner_id: string }; token: string; fileLink: (p: string) => string };

async function context(formId: string): Promise<Ctx | null> {
  const admin = createAdminClient();
  const [{ data: sheet }, { data: form }] = await Promise.all([
    admin.from("form_sheets").select("spreadsheet_id, owner_id").eq("form_id", formId).maybeSingle(),
    admin.from("forms").select("id, fields").eq("id", formId).maybeSingle(),
  ]);
  if (!sheet || !form) return null;
  const s = sheet as Ctx["sheet"];
  const { data: tier } = await admin.rpc("form_owner_is_pro", { p_user: s.owner_id });
  if (!tier) throw new GoogleError("Google Sheets sync is part of Pro. Renew Pro to keep the sheet up to date.");
  const token = await accessToken(s.owner_id);
  const f = form as Ctx["form"];
  return { form: f, sheet: s, token, fileLink: (p) => formsLink(`/build/${f.id}/file?p=${encodeURIComponent(p)}`, siteUrl()) };
}

async function writeHeader(c: Ctx) {
  const h = header(c.form.fields);
  await sheetsApi(c.token, `/v4/spreadsheets/${c.sheet.spreadsheet_id}/values/${encodeURIComponent(`Answers!A1:${colName(h.length)}1`)}?valueInputOption=RAW`, {
    method: "PUT",
    body: JSON.stringify({ values: [h] }),
  });
}

async function markError(formId: string, e: unknown) {
  await createAdminClient().from("form_sheets").update({ last_error: e instanceof Error ? e.message.slice(0, 300) : "Sync failed" }).eq("form_id", formId);
}

/** Add (or update) one answer's row. Never throws. */
export async function syncAnswer(responseId: string) {
  if (!sheetsConfigured()) return;
  const admin = createAdminClient();
  const { data } = await admin
    .from("form_responses")
    .select("id, form_id, answers, amount_kobo, status, created_at, edited_at, sheet_row")
    .eq("id", responseId)
    .maybeSingle();
  const r = data as (Row & { form_id: string }) | null;
  if (!r || (r.status !== "received" && r.status !== "paid")) return;
  try {
    const c = await context(r.form_id);
    if (!c) return;
    await writeHeader(c);
    const values = [rowOf(c.form.fields, r, c.fileLink)];
    let row = r.sheet_row;
    if (row) {
      await sheetsApi(c.token, `/v4/spreadsheets/${c.sheet.spreadsheet_id}/values/${encodeURIComponent(`Answers!A${row}:${colName(values[0].length)}${row}`)}?valueInputOption=RAW`, {
        method: "PUT",
        body: JSON.stringify({ values }),
      });
    } else {
      const res = await sheetsApi<{ updates?: { updatedRange?: string } }>(
        c.token,
        `/v4/spreadsheets/${c.sheet.spreadsheet_id}/values/${encodeURIComponent("Answers!A1")}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
        { method: "POST", body: JSON.stringify({ values }) },
      );
      const m = /![A-Z]+(\d+)/.exec(res.updates?.updatedRange ?? "");
      row = m ? Number(m[1]) : null;
    }
    const now = new Date().toISOString();
    await admin.from("form_responses").update({ sheet_row: row, sheet_synced_at: now }).eq("id", r.id);
    await admin.from("form_sheets").update({ last_synced_at: now, last_error: null }).eq("form_id", r.form_id);
  } catch (e) {
    await markError(r.form_id, e);
  }
}

/** Write the whole sheet again: headings + every answer (oldest first). Returns an error message or null. */
export async function rebuildSheet(formId: string): Promise<string | null> {
  const admin = createAdminClient();
  try {
    const c = await context(formId);
    if (!c) return "This form isn't connected to a sheet.";
    const rows: Row[] = [];
    for (let from = 0; from < 20000; from += 1000) {
      const { data } = await admin
        .from("form_responses")
        .select("id, answers, amount_kobo, status, created_at, edited_at, sheet_row")
        .eq("form_id", formId)
        .in("status", ["received", "paid"])
        .order("created_at", { ascending: true })
        .range(from, from + 999);
      rows.push(...((data ?? []) as Row[]));
      if (!data || data.length < 1000) break;
    }
    const values = [header(c.form.fields), ...rows.map((r) => rowOf(c.form.fields, r, c.fileLink))];
    await sheetsApi(c.token, `/v4/spreadsheets/${c.sheet.spreadsheet_id}/values/${encodeURIComponent("Answers")}:clear`, { method: "POST", body: "{}" });
    await sheetsApi(c.token, `/v4/spreadsheets/${c.sheet.spreadsheet_id}/values/${encodeURIComponent("Answers!A1")}?valueInputOption=RAW`, {
      method: "PUT",
      body: JSON.stringify({ values }),
    });
    const now = new Date().toISOString();
    // Row numbers: row 1 is the headings, answers follow in order.
    for (let i = 0; i < rows.length; i += 200) {
      await Promise.all(rows.slice(i, i + 200).map((r, k) =>
        admin.from("form_responses").update({ sheet_row: i + k + 2, sheet_synced_at: now }).eq("id", r.id)));
    }
    await admin.from("form_sheets").update({ last_synced_at: now, last_error: null }).eq("form_id", formId);
    return null;
  } catch (e) {
    await markError(formId, e);
    return e instanceof Error ? e.message : "Sync failed";
  }
}
