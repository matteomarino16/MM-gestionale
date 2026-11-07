import type {
  ClientStatus,
  ClientType,
  DocumentKind,
  IntervalUnit,
  ProjectStatus,
  QuoteStatus,
  RenewalFrequency,
  RenewalStatus,
  ServiceStatus,
  ServiceType,
  SettlementStatus,
} from "@/generated/prisma/enums";
import type { Tone } from "@/components/common/status-badge";

export const CLIENT_TYPE_LABELS: Record<ClientType, string> = {
  PERSON: "Persona fisica",
  COMPANY: "Azienda",
  OTHER: "Altro soggetto",
};

export const CLIENT_STATUS_LABELS: Record<ClientStatus, string> = { ACTIVE: "Attivo", ARCHIVED: "Archiviato" };

export const SERVICE_TYPE_LABELS: Record<ServiceType, string> = {
  DOMAIN_REGISTRATION: "Registrazione dominio",
  DOMAIN_RENEWAL: "Rinnovo dominio",
  HOSTING: "Hosting",
  VPS_SERVER: "VPS / server",
  PEC: "PEC",
  EMAIL: "Caselle email",
  SSL_CERTIFICATE: "Certificato SSL",
  SOFTWARE_LICENSE: "Licenza software",
  PLUGIN_THEME: "Plugin / tema",
  WEBSITE: "Sito web vetrina",
  LANDING_PAGE: "Landing page",
  ECOMMERCE: "E-commerce",
  MOBILE_APP: "App mobile",
  MAINTENANCE: "Manutenzione",
  SUPPORT: "Assistenza tecnica",
  SEO_DIGITAL: "SEO e servizi digitali",
  CONSULTING: "Consulenza",
  OTHER: "Altro servizio",
};

export const SERVICE_STATUS_LABELS: Record<ServiceStatus, string> = {
  ACTIVE: "Attivo",
  SUSPENDED: "Sospeso",
  EXPIRED: "Scaduto",
  CANCELLED: "Annullato",
};

export const SERVICE_STATUS_TONES: Record<ServiceStatus, Tone> = {
  ACTIVE: "success",
  SUSPENDED: "warning",
  EXPIRED: "danger",
  CANCELLED: "muted",
};

export const FREQUENCY_LABELS: Record<RenewalFrequency, string> = {
  NONE: "Una tantum",
  MONTHLY: "Mensile",
  QUARTERLY: "Trimestrale",
  SEMIANNUAL: "Semestrale",
  ANNUAL: "Annuale",
  BIENNIAL: "Biennale",
  CUSTOM: "Personalizzata",
};

export const INTERVAL_UNIT_LABELS: Record<IntervalUnit, string> = { DAY: "giorni", MONTH: "mesi" };

export const RENEWAL_STATUS_LABELS: Record<RenewalStatus, string> = {
  PLANNED: "Previsto",
  PROVIDER_PAYMENT_DUE: "Da pagare al fornitore",
  CLIENT_REQUESTED: "Richiesto al cliente",
  CLIENT_PAID: "Pagato dal cliente",
  PROVIDER_PAID: "Pagato al fornitore",
  COMPLETED: "Completato",
  CANCELLED: "Annullato",
};

export const RENEWAL_STATUS_TONES: Record<RenewalStatus, Tone> = {
  PLANNED: "info",
  PROVIDER_PAYMENT_DUE: "warning",
  CLIENT_REQUESTED: "warning",
  CLIENT_PAID: "info",
  PROVIDER_PAID: "info",
  COMPLETED: "success",
  CANCELLED: "muted",
};

export const SETTLEMENT_STATUS_LABELS: Record<SettlementStatus | "OVERDUE", string> = {
  OPEN: "Da pagare",
  PARTIAL: "Parziale",
  PAID: "Pagato",
  CANCELLED: "Annullato",
  OVERDUE: "Scaduto",
};

export const SETTLEMENT_STATUS_TONES: Record<SettlementStatus | "OVERDUE", Tone> = {
  OPEN: "info",
  PARTIAL: "warning",
  PAID: "success",
  CANCELLED: "muted",
  OVERDUE: "danger",
};

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  OPEN: "Aperta",
  IN_PROGRESS: "In corso",
  ON_HOLD: "Sospesa",
  COMPLETED: "Completata",
  CANCELLED: "Annullata",
};

export const QUOTE_STATUS_LABELS: Record<QuoteStatus, string> = {
  DRAFT: "Bozza",
  SENT: "Inviato",
  ACCEPTED: "Accettato",
  REJECTED: "Rifiutato",
  EXPIRED: "Scaduto",
};

export const DOCUMENT_KIND_LABELS: Record<DocumentKind, string> = {
  RECEIPT: "Ricevuta",
  INVOICE: "Fattura",
  CONTRACT: "Contratto",
  TECH_REPORT: "Rapporto tecnico",
  QUOTE: "Preventivo",
  OTHER: "Altro",
};

export function options<K extends string>(labels: Record<K, string>): { value: K; label: string }[] {
  return (Object.keys(labels) as K[]).map((value) => ({ value, label: labels[value] }));
}

export const PAYMENT_METHOD_LABELS: Record<import("@/generated/prisma/enums").PaymentMethod, string> = {
  BANK_TRANSFER: "Bonifico",
  CASH: "Contanti",
  CARD: "Carta",
  PAYPAL: "PayPal",
  STRIPE: "Stripe",
  CHECK: "Assegno",
  DIRECT_DEBIT: "Addebito diretto",
  OTHER: "Altro",
};

export const CLIENT_PAYMENT_SIDE_LABELS = { NONE: "Non richiesto", OPEN: "Richiesto", PARTIAL: "Parziale", PAID: "Pagato", CANCELLED: "Annullato" } as const;
export const PROVIDER_PAYMENT_SIDE_LABELS = { NONE: "Non registrato", OPEN: "Da pagare", PARTIAL: "Parziale", PAID: "Pagato", CANCELLED: "Annullato" } as const;
export const PAYMENT_SIDE_TONES = { NONE: "muted", OPEN: "warning", PARTIAL: "warning", PAID: "success", CANCELLED: "muted" } as const;

export const REMINDER_EVENT_STATUS_LABELS: Record<import("@/generated/prisma/enums").ReminderEventStatus, string> = {
  PENDING: "In programma",
  PROCESSING: "In invio",
  DONE: "Inviato",
  CANCELLED: "Annullato",
  FAILED: "Non riuscito",
};
