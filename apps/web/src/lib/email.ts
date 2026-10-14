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

/**
 * Email active members of the current company. Never throws: a failed email
 * must not fail the action that triggered it.
 */
export async function emailMembers(
  supabase: SupabaseClient,
  userIds: Array<string | null | undefined>,
  message: { subject: string; heading: string; text?: string | null; link: string; button?: string },
) {
  const t = mailer();
  const ids = [...new Set(userIds.filter((id): id is string => Boolean(id)))];
  if (!t || !ids.length) return;
  try {
    const [{ data: active }, { data: people }] = await Promise.all([
      supabase.from("memberships").select("user_id").in("user_id", ids).eq("status", "active"),
      supabase.from("profiles").select("id, email").in("id", ids),
    ]);
    const activeIds = new Set(((active ?? []) as Array<{ user_id: string }>).map((m) => m.user_id));
    const to = ((people ?? []) as Array<{ id: string; email: string }>)
      .filter((p) => activeIds.has(p.id) && p.email)
      .map((p) => p.email);
    if (!to.length) return;

    const url = `${siteUrl()}${message.link}`;
    const body = message.text ? message.text.slice(0, 1000) : "";
    const button = message.button ?? "Open";
    await Promise.all(
      to.map((address) =>
        t.sendMail({
          from,
          to: address,
          subject: message.subject.slice(0, 200),
          text: `${message.heading}\n\n${body ? `${body}\n\n` : ""}${button}: ${url}\n\n— ${APP_NAME}`,
          html: `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:15px;color:#0f172a;max-width:520px">
  <p style="font-size:17px;font-weight:600;margin:0 0 12px">${escapeHtml(message.heading)}</p>
  ${body ? `<p style="white-space:pre-wrap;margin:0 0 16px;color:#334155">${escapeHtml(body)}</p>` : ""}
  <p style="margin:0 0 24px"><a href="${escapeHtml(url)}" style="background:#7c3aed;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;display:inline-block">${escapeHtml(button)}</a></p>
  <p style="font-size:12px;color:#94a3b8;margin:0">Sent by ${escapeHtml(APP_NAME)} because you are a member of a company that uses it.</p>
</div>`,
        }),
      ),
    );
  } catch (e) {
    console.error("Email not sent:", e instanceof Error ? e.message : e);
  }
}
