import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { DomainError } from "@/lib/action-result";
import { parseListParams } from "@/lib/list-params";
import { providerInputSchema } from "@/modules/providers/schema";
import { createProvider, deleteProvider, listProviders, PROVIDER_SORTS, setProviderActive, updateProvider } from "@/modules/providers/service";
import { createTestDb, createTestUser, resetDb } from "./helpers/db";
import { makeClient, makeService } from "./helpers/factories";

const db = createTestDb();
let userId: string;
const input = (over: Record<string, unknown> = {}) => providerInputSchema.parse({ name: "Aruba", website: "https://www.aruba.it", ...over });

beforeEach(async () => {
  await resetDb(db);
  userId = (await createTestUser(db)).id;
});
afterAll(() => db.$disconnect());

describe("fornitori", () => {
  it("crea, modifica e impedisce nomi duplicati", async () => {
    const p = await createProvider(db, userId, input());
    await expect(createProvider(db, userId, input())).rejects.toBeInstanceOf(DomainError);
    const other = await createProvider(db, userId, input({ name: "Register.it" }));
    await expect(updateProvider(db, userId, other.id, input())).rejects.toThrow(/già un fornitore/);
    const u = await updateProvider(db, userId, p.id, input({ accountRef: "MM-123" }));
    expect(u.accountRef).toBe("MM-123");
  });

  it("valida l'indirizzo web", () => {
    expect(providerInputSchema.safeParse({ name: "X", website: "javascript:alert(1)" }).success).toBe(false);
  });

  it("disattiva invece di eliminare se il fornitore è in uso", async () => {
    const p = await createProvider(db, userId, input());
    const c = await makeClient(db, userId);
    await makeService(db, userId, c.id, { providerId: p.id });
    await expect(deleteProvider(db, userId, p.id)).rejects.toThrow(/solo disattivarlo/);

    await setProviderActive(db, userId, p.id, false);
    const params = parseListParams({}, PROVIDER_SORTS, "name");
    expect((await listProviders(db, params)).total).toBe(0);
    expect((await listProviders(db, params, { active: false })).items[0].activeServices).toBe(1);

    // Un fornitore disattivato non può essere scelto per nuovi servizi.
    await expect(makeService(db, userId, c.id, { providerId: p.id, name: "altro.it" })).rejects.toThrow(/disattivato/);
  });

  it("elimina un fornitore mai usato", async () => {
    const p = await createProvider(db, userId, input());
    await deleteProvider(db, userId, p.id);
    expect(await db.provider.count()).toBe(0);
  });
});
