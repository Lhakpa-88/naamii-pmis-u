import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies, headers } from "next/headers";
import { env } from "../env";

/** Session cookie for the password and demo sign-in modes (Entra uses the platform's own session). */
export const SESSION_COOKIE = "pmis_session";
export const SESSION_HOURS = 8;

/** An authenticated identity before it is mapped to a PMIS user. */
export interface Identity {
  email: string | null;
  /** Microsoft Entra object id (SSO) or the PMIS user id (password / demo sign-in). */
  subject: string | null;
  source: "password" | "dev" | "demo" | "entra";
}

function sign(value: string): string {
  return createHmac("sha256", env.sessionSecret).update(value).digest("base64url");
}

/**
 * Cookie value "<userId>.<expiresAtMs>.<hmac>": signed, so it cannot be forged or
 * extended, and it carries nothing but the user id — role and access are read
 * from the database on every request, so a deactivated user is out at once.
 */
export function createSessionValue(userId: string, now = Date.now()): string {
  const body = `${userId}.${now + SESSION_HOURS * 3600_000}`;
  return `${body}.${sign(body)}`;
}

export function verifySessionValue(raw: string | undefined, now = Date.now()): string | null {
  if (!raw) return null;
  const dot = raw.lastIndexOf(".");
  if (dot === -1) return null;
  const body = raw.slice(0, dot), mac = raw.slice(dot + 1);
  const expected = sign(body);
  if (mac.length !== expected.length || !timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
  const [userId, expires] = body.split(".");
  if (!userId || !expires || !(Number(expires) > now)) return null;
  return userId;
}

export const sessionCookieOptions = () => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: env.isProduction,
  path: "/",
  maxAge: SESSION_HOURS * 3600,
});

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
  if (env.authMode === "entra") {
    const h = await headers();
    return parseEasyAuthPrincipal(h.get("x-ms-client-principal"));
  }
  const userId = verifySessionValue((await cookies()).get(SESSION_COOKIE)?.value);
  return userId ? { email: null, subject: userId, source: env.authMode } : null;
}
