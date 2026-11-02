import "server-only";
import { cookies } from "next/headers";
import { isSecureCookie } from "@/lib/env";

// Con HTTPS si usa il prefisso __Host- (impone Secure, Path=/ e nessun Domain).
export const SESSION_COOKIE_SECURE = "__Host-gst_session";
export const SESSION_COOKIE_PLAIN = "gst_session";

export function sessionCookieName(): string {
  return isSecureCookie() ? SESSION_COOKIE_SECURE : SESSION_COOKIE_PLAIN;
}

export async function readSessionCookie(): Promise<string | undefined> {
  return (await cookies()).get(sessionCookieName())?.value;
}

/** Il cookie dura fino al limite assoluto; la scadenza per inattività è verificata sul DB. */
export async function setSessionCookie(token: string, expiresAt: Date): Promise<void> {
  (await cookies()).set(sessionCookieName(), token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureCookie(),
    path: "/",
    expires: expiresAt,
  });
}

export async function deleteSessionCookie(): Promise<void> {
  (await cookies()).delete(sessionCookieName());
}
