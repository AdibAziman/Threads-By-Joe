import { createHmac } from "node:crypto";
import { safeEqual } from "./crypto";
import { env } from "./env";

/** Parse and verify the `signed_request` Meta posts to deauthorize and data-deletion callbacks. */
export function parseSignedRequest(signed: string | null | undefined): { user_id?: string } | null {
  if (!signed || !env.threadsAppSecret) return null;
  const [sig, payload] = signed.split(".");
  if (!sig || !payload) return null;
  const expected = createHmac("sha256", env.threadsAppSecret).update(payload).digest("base64url");
  if (!safeEqual(sig.replace(/=+$/, ""), expected.replace(/=+$/, ""))) return null;
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

/** X-Hub-Signature-256 check for webhook deliveries. */
export function verifyWebhookSignature(rawBody: string, header: string | null): boolean {
  if (!header?.startsWith("sha256=") || !env.threadsAppSecret) return false;
  const expected = createHmac("sha256", env.threadsAppSecret).update(rawBody).digest("hex");
  return safeEqual(header.slice(7), expected);
}
