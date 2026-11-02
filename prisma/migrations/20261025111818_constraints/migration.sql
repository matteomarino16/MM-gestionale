-- Vincoli e indici non esprimibili direttamente nello schema Prisma.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ───────────── Utenti ─────────────
ALTER TABLE "User" ADD CONSTRAINT "User_email_lowercase_chk" CHECK ("email" = lower("email"));
ALTER TABLE "UserPreference" ADD CONSTRAINT "UserPreference_reminderTime_chk"
  CHECK ("reminderTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');

-- ───────────── Clienti ─────────────
ALTER TABLE "Client" ADD CONSTRAINT "Client_name_present_chk" CHECK (
  coalesce(nullif(btrim("companyName"), ''), nullif(btrim("firstName"), ''), nullif(btrim("lastName"), '')) IS NOT NULL
);
ALTER TABLE "Client" ADD CONSTRAINT "Client_archived_chk" CHECK (
  ("status" = 'ARCHIVED') = ("archivedAt" IS NOT NULL)
);
CREATE INDEX "Client_displayName_trgm_idx" ON "Client" USING gin ("displayName" gin_trgm_ops);
CREATE INDEX "Client_email_trgm_idx" ON "Client" USING gin ("email" gin_trgm_ops);

-- ───────────── Servizi ─────────────
ALTER TABLE "Service" ADD CONSTRAINT "Service_amounts_chk" CHECK ("providerCost" >= 0 AND "clientPrice" >= 0);
ALTER TABLE "Service" ADD CONSTRAINT "Service_vatRate_chk" CHECK ("vatRate" >= 0 AND "vatRate" <= 100);
ALTER TABLE "Service" ADD CONSTRAINT "Service_custom_interval_chk" CHECK (
  ("frequency" = 'CUSTOM') = ("customIntervalValue" IS NOT NULL AND "customIntervalUnit" IS NOT NULL)
);
ALTER TABLE "Service" ADD CONSTRAINT "Service_custom_interval_positive_chk" CHECK (
  "customIntervalValue" IS NULL OR "customIntervalValue" > 0
);
ALTER TABLE "Service" ADD CONSTRAINT "Service_dates_chk" CHECK (
  "startDate" IS NULL OR "expiryDate" IS NULL OR "expiryDate" >= "startDate"
);
CREATE INDEX "Service_name_trgm_idx" ON "Service" USING gin ("name" gin_trgm_ops);
CREATE INDEX "Service_domain_trgm_idx" ON "Service" USING gin ("domain" gin_trgm_ops);
CREATE INDEX "Service_description_trgm_idx" ON "Service" USING gin ("description" gin_trgm_ops);

-- ───────────── Rinnovi ─────────────
ALTER TABLE "ServiceRenewal" ADD CONSTRAINT "ServiceRenewal_amounts_chk" CHECK (
  "expectedProviderCost" >= 0 AND "clientPrice" >= 0 AND ("actualProviderCost" IS NULL OR "actualProviderCost" >= 0)
);
-- Un rinnovo completato deve avere data di rinnovo effettivo e nuova scadenza esplicite.
ALTER TABLE "ServiceRenewal" ADD CONSTRAINT "ServiceRenewal_completed_chk" CHECK (
  "status" <> 'COMPLETED' OR ("renewedAt" IS NOT NULL AND "newExpiryDate" IS NOT NULL AND "newExpiryDate" > "expiryDate")
);
ALTER TABLE "ServiceRenewal" ADD CONSTRAINT "ServiceRenewal_cancelled_chk" CHECK (
  ("status" = 'CANCELLED') = ("cancelledAt" IS NOT NULL)
);
ALTER TABLE "ServiceRenewal" ADD CONSTRAINT "ServiceRenewal_cycle_chk" CHECK ("cycleNumber" >= 1 AND "deadlineRevision" >= 1);
-- Al massimo un ciclo aperto per servizio.
CREATE UNIQUE INDEX "ServiceRenewal_one_open_per_service_idx" ON "ServiceRenewal" ("serviceId")
  WHERE "status" NOT IN ('COMPLETED', 'CANCELLED');

-- ───────────── Commesse / preventivi ─────────────
ALTER TABLE "Project" ADD CONSTRAINT "Project_amount_chk" CHECK ("agreedAmount" IS NULL OR "agreedAmount" >= 0);
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_amount_chk" CHECK ("netAmount" >= 0 AND "vatRate" >= 0 AND "vatRate" <= 100);

-- ───────────── Crediti ─────────────
ALTER TABLE "Receivable" ADD CONSTRAINT "Receivable_amounts_chk" CHECK (
  "netAmount" >= 0 AND "vatAmount" >= 0 AND "withholdingAmount" >= 0 AND "amountDue" >= 0 AND "paidAmount" >= 0
);
ALTER TABLE "Receivable" ADD CONSTRAINT "Receivable_rates_chk" CHECK (
  "vatRate" BETWEEN 0 AND 100 AND "withholdingRate" BETWEEN 0 AND 100
);
ALTER TABLE "Receivable" ADD CONSTRAINT "Receivable_total_chk" CHECK (
  "amountDue" = "netAmount" + "vatAmount" - "withholdingAmount"
);
ALTER TABLE "Receivable" ADD CONSTRAINT "Receivable_not_overpaid_chk" CHECK ("paidAmount" <= "amountDue");
ALTER TABLE "Receivable" ADD CONSTRAINT "Receivable_status_chk" CHECK (
  ("status" = 'CANCELLED') = ("cancelledAt" IS NOT NULL)
  AND ("status" <> 'PAID' OR "paidAmount" = "amountDue")
  AND ("status" <> 'OPEN' OR "paidAmount" = 0)
  AND ("status" <> 'PARTIAL' OR ("paidAmount" > 0 AND "paidAmount" < "amountDue"))
);
CREATE INDEX "Receivable_description_trgm_idx" ON "Receivable" USING gin ("description" gin_trgm_ops);

-- ───────────── Debiti ─────────────
ALTER TABLE "Payable" ADD CONSTRAINT "Payable_amounts_chk" CHECK (
  "expectedAmount" >= 0 AND ("actualAmount" IS NULL OR "actualAmount" >= 0)
  AND "vatAmount" >= 0 AND "amountDue" >= 0 AND "paidAmount" >= 0
);
ALTER TABLE "Payable" ADD CONSTRAINT "Payable_rates_chk" CHECK ("vatRate" BETWEEN 0 AND 100);
ALTER TABLE "Payable" ADD CONSTRAINT "Payable_total_chk" CHECK (
  "amountDue" = coalesce("actualAmount", "expectedAmount") + "vatAmount"
);
ALTER TABLE "Payable" ADD CONSTRAINT "Payable_not_overpaid_chk" CHECK ("paidAmount" <= "amountDue");
ALTER TABLE "Payable" ADD CONSTRAINT "Payable_status_chk" CHECK (
  ("status" = 'CANCELLED') = ("cancelledAt" IS NOT NULL)
  AND ("status" <> 'PAID' OR "paidAmount" = "amountDue")
  AND ("status" <> 'OPEN' OR "paidAmount" = 0)
  AND ("status" <> 'PARTIAL' OR ("paidAmount" > 0 AND "paidAmount" < "amountDue"))
);
CREATE INDEX "Payable_description_trgm_idx" ON "Payable" USING gin ("description" gin_trgm_ops);

-- ───────────── Pagamenti ─────────────
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_amount_chk" CHECK ("amount" > 0);
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_target_chk" CHECK (
  ("direction" = 'IN' AND "receivableId" IS NOT NULL AND "payableId" IS NULL)
  OR ("direction" = 'OUT' AND "payableId" IS NOT NULL AND "receivableId" IS NULL)
);
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_void_chk" CHECK (("voidedAt" IS NULL) = ("voidReason" IS NULL));

-- ───────────── Promemoria / notifiche ─────────────
ALTER TABLE "ReminderRule" ADD CONSTRAINT "ReminderRule_key_chk" CHECK ("key" ~ '^[a-z0-9-]+$');
ALTER TABLE "ReminderRule" ADD CONSTRAINT "ReminderRule_repeat_chk" CHECK (
  ("repeatEveryDays" IS NULL OR "repeatEveryDays" > 0) AND ("maxRepeats" IS NULL OR "maxRepeats" > 0)
);
ALTER TABLE "ReminderRule" ADD CONSTRAINT "ReminderRule_channels_chk" CHECK (cardinality("channels") > 0);
ALTER TABLE "ReminderEvent" ADD CONSTRAINT "ReminderEvent_attempts_chk" CHECK ("attempts" >= 0 AND "occurrence" >= 0);
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_attempts_chk" CHECK ("attempts" >= 0);

-- ───────────── Documenti ─────────────
ALTER TABLE "Document" ADD CONSTRAINT "Document_size_chk" CHECK ("sizeBytes" > 0);
ALTER TABLE "Document" ADD CONSTRAINT "Document_storageKey_chk" CHECK ("storageKey" ~ '^[A-Za-z0-9/_.-]+$' AND "storageKey" !~ '\.\.');
ALTER TABLE "Document" ADD CONSTRAINT "Document_sha256_chk" CHECK ("sha256" ~ '^[0-9a-f]{64}$');
