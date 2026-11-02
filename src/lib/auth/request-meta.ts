import "server-only";
import { headers } from "next/headers";
import { getEnv } from "@/lib/env";

export async function getRequestMeta(): Promise<{ ip: string; userAgent: string | null }> {
  const h = await headers();
  let ip = "local";
  if (getEnv().TRUST_PROXY === "true") {
    ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  }
  return { ip: ip.slice(0, 64), userAgent: h.get("user-agent") };
}
