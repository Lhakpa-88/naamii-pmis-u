import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies, headers } from "next/headers";
import { env } from "../env";

export const DEMO_COOKIE = "pmis_demo_session";

/** An authenticated identity before it is mapped to a PMIS user. */
export interface Identity {
  email: string | null;
  /** Microsoft Entra object id (SSO) or the demo user id (Demo Mode). */
  subject: string | null;
  source: "demo" | "entra";
}

function sign(value: string): string {
  return createHmac("sha256", env.sessionSecret).update(value).digest("base64url");
}

/** Demo Mode cookie: "<userId>.<hmac>". Tamper-evident even though it is only for fictional accounts. */
export function createDemoSessionValue(userId: string): string {
  return `${userId}.${sign(userId)}`;
}

export function verifyDemoSessionValue(raw: string | undefined): string | null {
  if (!raw) return null;
  const dot = raw.lastIndexOf(".");
  if (dot === -1) return null;
  const userId = raw.slice(0, dot);
  const mac = raw.slice(dot + 1);
  const expected = sign(userId);
  if (mac.length !== expected.length) return null;
  return timingSafeEqual(Buffer.from(mac), Buffer.from(expected)) ? userId : null;
}

interface EasyAuthClaim { typ: string; val: string }
interface EasyAuthPrincipal { auth_typ?: string; claims?: EasyAuthClaim[] }

/**
 * Azure App Service built-in authentication ("Easy Auth") validates the Entra
 * token at the platform edge and forwards the principal in this header.
 */
function parseEasyAuthPrincipal(b64: string | null): Identity | null {
  if (!b64) return null;
  try {
    const principal = JSON.parse(Buffer.from(b64, "base64").toString("utf8")) as EasyAuthPrincipal;
    const claim = (...types: string[]) => principal.claims?.find((c) => types.includes(c.typ))?.val ?? null;
    const email = claim("preferred_username", "email", "upn", "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress");
    const oid = claim("http://schemas.microsoft.com/identity/claims/objectidentifier", "oid");
    if (!email && !oid) return null;
    return { email, subject: oid, source: "entra" };
  } catch {
    return null;
  }
}

/** Resolve the request's identity according to PMIS_AUTH_MODE. */
export async function getIdentity(): Promise<Identity | null> {
  if (env.authMode === "demo") {
    const raw = (await cookies()).get(DEMO_COOKIE)?.value;
    const userId = verifyDemoSessionValue(raw);
    return userId ? { email: null, subject: userId, source: "demo" } : null;
  }
  const h = await headers();
  return parseEasyAuthPrincipal(h.get("x-ms-client-principal"));
}
