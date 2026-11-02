/**
 * Crea l'account amministratore (unico utente del gestionale).
 *
 *   npm run admin:create -- --email tu@esempio.it --name "Nome Cognome"
 *   npm run admin:create -- --email tu@esempio.it --reset-password
 *
 * La password viene chiesta in modo interattivo senza eco a terminale, oppure
 * letta da stdin con --password-stdin (utile in script; mai come argomento CLI,
 * che finirebbe nella history della shell).
 */
import "dotenv/config";
import { parseArgs } from "node:util";
import { createInterface } from "node:readline";
import { Writable } from "node:stream";
import { z } from "zod";
import { createPrismaClient } from "@/lib/db/client";
import { hashPassword, validatePasswordStrength } from "@/lib/auth/password";
import { invalidateUserSessions } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { normalizeEmail } from "@/modules/auth/service";

const { values } = parseArgs({
  options: {
    email: { type: "string" },
    name: { type: "string" },
    "reset-password": { type: "boolean", default: false },
    "password-stdin": { type: "boolean", default: false },
  },
});

async function readHidden(prompt: string): Promise<string> {
  let muted = false;
  const output = new Writable({
    write(chunk, _enc, cb) {
      if (!muted) process.stdout.write(chunk);
      cb();
    },
  });
  const rl = createInterface({ input: process.stdin, output, terminal: true });
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
    muted = true;
  });
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8").replace(/\r?\n$/, "");
}

async function askPassword(): Promise<string> {
  if (values["password-stdin"]) return readStdin();
  if (!process.stdin.isTTY) throw new Error("Terminale non interattivo: usa --password-stdin.");
  const first = await readHidden("Password: ");
  const second = await readHidden("Conferma password: ");
  if (first !== second) throw new Error("Le password non coincidono.");
  return first;
}

async function main() {
  const email = z.email().safeParse(normalizeEmail(values.email ?? ""));
  if (!email.success) throw new Error("Specifica un'email valida con --email.");

  const db = createPrismaClient();
  try {
    const existing = await db.user.findUnique({ where: { email: email.data } });

    if (values["reset-password"]) {
      if (!existing) throw new Error("Nessun utente con questa email.");
    } else {
      // Registrazione pubblica disabilitata: lo script crea solo il primo account.
      const count = await db.user.count();
      if (count > 0) {
        throw new Error("Esiste già un amministratore. Usa --reset-password per reimpostarne la password.");
      }
    }

    const password = await askPassword();
    const weakness = validatePasswordStrength(password);
    if (weakness) throw new Error(weakness);
    const passwordHash = await hashPassword(password);

    if (existing) {
      await db.user.update({ where: { id: existing.id }, data: { passwordHash } });
      const closed = await invalidateUserSessions(db, existing.id);
      await audit(db, { userId: existing.id, action: "auth.password_reset_cli", entityType: "User", entityId: existing.id });
      console.log(`Password reimpostata per ${email.data}. Sessioni chiuse: ${closed}.`);
    } else {
      const name = values.name?.trim() || email.data.split("@")[0];
      const user = await db.user.create({
        data: { email: email.data, name, passwordHash, preference: { create: {} } },
      });
      await audit(db, { userId: user.id, action: "auth.admin_created", entityType: "User", entityId: user.id });
      console.log(`Amministratore creato: ${email.data}`);
    }
  } finally {
    await db.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error(`Errore: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
