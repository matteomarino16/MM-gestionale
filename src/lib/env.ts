import { z } from "zod";

const booleanish = z
  .enum(["true", "false", "auto"])
  .default("auto");

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url(),
  APP_URL: z.string().url().default("http://localhost:3000"),
  APP_TIMEZONE: z.string().default("Europe/Rome"),
  /** Durata di inattività dopo la quale la sessione scade (ore). */
  SESSION_IDLE_HOURS: z.coerce.number().int().positive().default(168),
  /** Durata massima assoluta di una sessione (giorni). */
  SESSION_ABSOLUTE_DAYS: z.coerce.number().int().positive().default(30),
  /** "auto" = Secure se APP_URL è https. */
  COOKIE_SECURE: booleanish,
  /** Se "true", l'IP client viene letto da X-Forwarded-For (solo dietro un reverse proxy fidato). */
  TRUST_PROXY: z.enum(["true", "false"]).default("false"),
  UPLOAD_DIR: z.string().default("./storage/documents"),
  BACKUP_DIR: z.string().default("./backups"),
  /** Segreto condiviso con il cron di Vercel (Authorization: Bearer …). Almeno 32 caratteri. */
  CRON_SECRET: z.string().min(32).optional(),
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

export function getEnv(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    // Riporta solo i nomi delle variabili non valide, mai i valori.
    const fields = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Configurazione non valida: controlla le variabili d'ambiente ${fields}`);
  }
  cached = parsed.data;
  return cached;
}

export function isSecureCookie(env: Env = getEnv()): boolean {
  if (env.COOKIE_SECURE === "auto") return env.APP_URL.startsWith("https://");
  return env.COOKIE_SECURE === "true";
}
