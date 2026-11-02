import type { Db } from "@/lib/db/client";
import type { NotificationChannel, ReminderTarget } from "@/generated/prisma/client";

type DefaultRule = {
  target: ReminderTarget;
  key: string;
  label: string;
  offsetDays: number;
  repeatEveryDays?: number;
  maxRepeats?: number;
  channels?: NotificationChannel[];
};

export const DEFAULT_REMINDER_RULES: DefaultRule[] = [
  { target: "RENEWAL", key: "30d", label: "30 giorni prima della scadenza", offsetDays: -30 },
  { target: "RENEWAL", key: "14d", label: "14 giorni prima della scadenza", offsetDays: -14 },
  { target: "RENEWAL", key: "7d", label: "7 giorni prima della scadenza", offsetDays: -7 },
  { target: "RENEWAL", key: "due", label: "Giorno della scadenza", offsetDays: 0 },
  {
    target: "RENEWAL",
    key: "overdue",
    label: "Rinnovo non risolto dopo la scadenza (ogni 7 giorni)",
    offsetDays: 1,
    repeatEveryDays: 7,
    maxRepeats: 8,
  },
  { target: "RECEIVABLE", key: "7d", label: "7 giorni prima della scadenza del pagamento", offsetDays: -7 },
  { target: "RECEIVABLE", key: "due", label: "Giorno della scadenza del pagamento", offsetDays: 0 },
  { target: "RECEIVABLE", key: "overdue-1d", label: "Un giorno dopo la scadenza", offsetDays: 1 },
  {
    target: "RECEIVABLE",
    key: "overdue-weekly",
    label: "Ogni 7 giorni finché il credito resta aperto",
    offsetDays: 8,
    repeatEveryDays: 7,
  },
];

export const DEFAULT_EXPENSE_CATEGORIES = [
  "Domini",
  "Hosting e server",
  "Email e PEC",
  "Certificati SSL",
  "Licenze software",
  "Plugin e temi",
  "Servizi cloud",
  "Hardware",
  "Collaboratori",
  "Formazione",
  "Altro",
];

/** Inserisce solo ciò che manca: non sovrascrive le regole personalizzate. */
export async function seedDefaults(db: Db) {
  let rules = 0;
  for (const rule of DEFAULT_REMINDER_RULES) {
    const res = await db.reminderRule.createMany({
      data: [{ ...rule, channels: rule.channels ?? ["DASHBOARD", "PUSH"] }],
      skipDuplicates: true,
    });
    rules += res.count;
  }
  const categories = await db.expenseCategory.createMany({
    data: DEFAULT_EXPENSE_CATEGORIES.map((name) => ({ name })),
    skipDuplicates: true,
  });
  return { rules, categories: categories.count };
}
