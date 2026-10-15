import nodemailer from "nodemailer";
import type { SupabaseClient } from "@supabase/supabase-js";
import { APP_NAME } from "@/lib/config";
import { siteUrl } from "@/lib/utils";

/**
 * Optional email for task notifications. Works with any SMTP server; the
 * simplest for a pilot is a Gmail address with an app password (see docs/DEPLOY.md).
 * If the SMTP_* variables are not set, nothing is sent and nothing breaks:
 * people still get the in-app and desktop notifications.
 */
const host = process.env.SMTP_HOST;
const user = process.env.SMTP_USER;
const pass = process.env.SMTP_PASS;
const port = Number(process.env.SMTP_PORT || 465);
const from = process.env.MAIL_FROM || (user ? `${APP_NAME} <${user}>` : "");

let transport: nodemailer.Transporter | null = null;
function mailer() {
  if (!host || !user || !pass) return null;
  transport ??= nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 10000,
  });
  return transport;
}

export const emailEnabled = () => Boolean(host && user && pass);

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

type Message = { subject: string; heading: string; text?: string | null; link: string; button?: string };
export type Attachment = { filename: string; content: Buffer; contentType: string };

/** Kinds of email a person can turn off on their profile (profiles.email_opt_out). */
export const EMAIL_KINDS = {
  tasks: "Tasks assigned to me and comments",
  payslips: "My payslips (with the PDF)",
  billing: "Plan reminders (owners and admins)",
} as const;
export type EmailKind = keyof typeof EMAIL_KINDS;

function render(message: Message) {
  const url = `${siteUrl()}${message.link}`;
  const body = message.text ? message.text.slice(0, 1000) : "";
  const button = message.button ?? "Open";
  return {
    subject: message.subject.slice(0, 200),
    text: `${message.heading}\n\n${body ? `${body}\n\n` : ""}${button}: ${url}\n\n— ${APP_NAME}`,
    html: `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:15px;color:#0f172a;max-width:520px">
  <p style="font-size:17px;font-weight:600;margin:0 0 12px">${escapeHtml(message.heading)}</p>
  ${body ? `<p style="white-space:pre-wrap;margin:0 0 16px;color:#334155">${escapeHtml(body)}</p>` : ""}
  <p style="margin:0 0 24px"><a href="${escapeHtml(url)}" style="background:#7c3aed;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;display:inline-block">${escapeHtml(button)}</a></p>
  <p style="font-size:12px;color:#94a3b8;margin:0">Sent by ${escapeHtml(APP_NAME)} because you are a member of a company that uses it.</p>
</div>`,
  };
}

/**
 * Send one email to known addresses (each gets their own copy). Returns how many were sent; never throws.
 */
export async function sendEmail(to: string[], message: Message, attachments?: Attachment[]): Promise<number> {
  const t = mailer();
  const list = [...new Set(to.filter(Boolean))];
  if (!t || !list.length) return 0;
  const mail = render(message);
  const results = await Promise.allSettled(list.map((address) => t.sendMail({ from, to: address, ...mail, attachments })));
  for (const r of results) {
    if (r.status === "rejected") console.error("Email not sent:", r.reason instanceof Error ? r.reason.message : r.reason);
  }
  return results.filter((r) => r.status === "fulfilled").length;
}

/**
 * Email active members of the current company. Never throws: a failed email
 * must not fail the action that triggered it.
 */
export async function emailMembers(
  supabase: SupabaseClient,
  userIds: Array<string | null | undefined>,
  message: Message,
  kind: EmailKind = "tasks",
) {
  const ids = [...new Set(userIds.filter((id): id is string => Boolean(id)))];
  if (!emailEnabled() || !ids.length) return;
  try {
    const [{ data: active }, { data: people }] = await Promise.all([
      supabase.from("memberships").select("user_id").in("user_id", ids).eq("status", "active"),
      supabase.from("profiles").select("id, email, email_opt_out").in("id", ids),
    ]);
    const activeIds = new Set(((active ?? []) as Array<{ user_id: string }>).map((m) => m.user_id));
    const to = ((people ?? []) as Array<{ id: string; email: string; email_opt_out: string[] | null }>)
      .filter((p) => activeIds.has(p.id) && p.email && !(p.email_opt_out ?? []).includes(kind))
      .map((p) => p.email);
    await sendEmail(to, message);
  } catch (e) {
    console.error("Email not sent:", e instanceof Error ? e.message : e);
  }
}
