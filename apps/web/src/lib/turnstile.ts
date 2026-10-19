import { headers } from "next/headers";

/**
 * Server side of the human check (components/turnstile.tsx). Returns an error message to show,
 * or null when the visitor passed. When TURNSTILE_SECRET_KEY isn't set (local development) every
 * request passes. If Cloudflare can't be reached we let people through rather than lock everyone
 * out; the database speed limits still apply.
 */
const MESSAGE = "Please wait for the security check to finish, then try again.";

export async function checkHuman(source: FormData | string | null | undefined): Promise<string | null> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return null;
  const token = typeof source === "string" || source == null ? source : String(source.get("cf-turnstile-response") ?? "");
  if (!token) return MESSAGE;

  const h = await headers();
  const ip = h.get("cf-connecting-ip") ?? h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
  const body = new URLSearchParams({ secret, response: token });
  if (ip) body.set("remoteip", ip);
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body,
      signal: AbortSignal.timeout(5000),
    });
    const data = (await res.json()) as { success?: boolean };
    return data.success ? null : MESSAGE;
  } catch {
    return null;
  }
}
