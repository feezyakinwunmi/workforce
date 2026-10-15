import { createCipheriv, createECDH, createPrivateKey, generateKeyPairSync, hkdfSync, randomBytes, sign } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SUPPORT_EMAIL } from "@/lib/config";

/**
 * Web Push without a library (RFC 8291 payload encryption + RFC 8292 VAPID), server only.
 * The VAPID key pair is made on first use and kept in public.push_config, which only the
 * service role can read.
 */

const b64u = (b: Buffer | Uint8Array) => Buffer.from(b).toString("base64url");
const fromB64u = (s: string) => Buffer.from(s, "base64url");

export type Vapid = { publicKey: string; privateJwk: { kty: string; crv: string; d: string; x: string; y: string } };

/** The server's VAPID keys (created and stored the first time). */
export async function getVapid(admin: SupabaseClient): Promise<Vapid> {
  const { data } = await admin.from("push_config").select("public_key, private_jwk").eq("id", 1).maybeSingle();
  if (data) return { publicKey: data.public_key as string, privateJwk: data.private_jwk as Vapid["privateJwk"] };
  const { privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const jwk = privateKey.export({ format: "jwk" }) as Vapid["privateJwk"];
  const publicKey = b64u(Buffer.concat([Buffer.from([4]), fromB64u(jwk.x), fromB64u(jwk.y)]));
  // Two servers racing on the very first push: keep whichever row was stored first.
  await admin.from("push_config").upsert({ id: 1, public_key: publicKey, private_jwk: jwk }, { onConflict: "id", ignoreDuplicates: true });
  const { data: stored } = await admin.from("push_config").select("public_key, private_jwk").eq("id", 1).single();
  return { publicKey: stored!.public_key as string, privateJwk: stored!.private_jwk as Vapid["privateJwk"] };
}

/** VAPID "Authorization" header for one push service (audience = its origin). */
export function vapidHeader(endpoint: string, vapid: Vapid, now = Date.now()) {
  const aud = new URL(endpoint).origin;
  const header = b64u(Buffer.from(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64u(Buffer.from(JSON.stringify({ aud, exp: Math.floor(now / 1000) + 12 * 3600, sub: `mailto:${SUPPORT_EMAIL}` })));
  const key = createPrivateKey({ key: vapid.privateJwk, format: "jwk" });
  const signature = sign("sha256", Buffer.from(`${header}.${claims}`), { key, dsaEncoding: "ieee-p1363" });
  return `vapid t=${header}.${claims}.${b64u(signature)}, k=${vapid.publicKey}`;
}

/** Encrypt a payload for one browser subscription (aes128gcm, a single record). `ecdh` = a fresh key pair. */
export function encryptPayload(payload: Buffer, p256dh: string, auth: string, ecdh: ReturnType<typeof createECDH>, salt = randomBytes(16)) {
  const uaPublic = fromB64u(p256dh);
  const authSecret = fromB64u(auth);
  const asPublic = ecdh.getPublicKey();
  const shared = ecdh.computeSecret(uaPublic);
  const keyInfo = Buffer.concat([Buffer.from("WebPush: info\0"), uaPublic, asPublic]);
  const ikm = Buffer.from(hkdfSync("sha256", shared, authSecret, keyInfo, 32));
  const cek = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0"), 16));
  const nonce = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: nonce\0"), 12));
  const cipher = createCipheriv("aes-128-gcm", cek, nonce);
  const body = Buffer.concat([cipher.update(Buffer.concat([payload, Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);
  const rs = Buffer.alloc(4);
  rs.writeUInt32BE(4096);
  return Buffer.concat([salt, rs, Buffer.from([asPublic.length]), asPublic, body]);
}

export type PushResult = { ok: boolean; gone: boolean; status: number };

/** Send one push. gone = the browser dropped this subscription (delete it). */
export async function sendPush(sub: { endpoint: string; p256dh: string; auth: string }, data: unknown, vapid: Vapid, urgent = false): Promise<PushResult> {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  const body = encryptPayload(Buffer.from(JSON.stringify(data)), sub.p256dh, sub.auth, ecdh);
  try {
    const res = await fetch(sub.endpoint, {
      method: "POST",
      headers: {
        Authorization: vapidHeader(sub.endpoint, vapid),
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        TTL: "1800",
        Urgency: urgent ? "high" : "normal",
      },
      body: new Uint8Array(body),
      signal: AbortSignal.timeout(10_000),
    });
    return { ok: res.ok, gone: res.status === 404 || res.status === 410, status: res.status };
  } catch {
    return { ok: false, gone: false, status: 0 };
  }
}
