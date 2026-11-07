import type { RenewalFrequency, ServiceType } from "@/generated/prisma/enums";

export type ServicePreset = {
  id: string;
  group: "Progetti" | "Servizi ricorrenti";
  name: string;
  type: ServiceType;
  frequency: RenewalFrequency;
  description: string;
};

/**
 * Catalogo dei servizi offerti (da matteomarino.eu) più i servizi ricorrenti che li
 * accompagnano. I prezzi sono su preventivo: si inseriscono nel singolo servizio.
 */
export const SERVICE_CATALOG: ServicePreset[] = [
  {
    id: "sito-vetrina",
    group: "Progetti",
    name: "Sito web vetrina",
    type: "WEBSITE",
    frequency: "NONE",
    description: "Sito professionale che presenta l'attività e la fa trovare su Google: design su misura, responsive, SEO di base.",
  },
  {
    id: "landing-page",
    group: "Progetti",
    name: "Landing page",
    type: "LANDING_PAGE",
    frequency: "NONE",
    description: "Pagina singola pensata per convertire: lancio di un prodotto o campagne marketing, caricamento veloce.",
  },
  {
    id: "ecommerce",
    group: "Progetti",
    name: "E-commerce",
    type: "ECOMMERCE",
    frequency: "NONE",
    description: "Negozio online completo: catalogo prodotti, pagamenti sicuri, gestione semplice.",
  },
  {
    id: "app-mobile",
    group: "Progetti",
    name: "App mobile iOS e Android",
    type: "MOBILE_APP",
    frequency: "NONE",
    description: "App per iPhone e Android, dal design allo sviluppo.",
  },
  {
    id: "seo",
    group: "Servizi ricorrenti",
    name: "SEO e visibilità su Google e AI",
    type: "SEO_DIGITAL",
    frequency: "MONTHLY",
    description: "Ottimizzazione per Google e per le risposte dei motori AI, dati strutturati.",
  },
  {
    id: "dominio",
    group: "Servizi ricorrenti",
    name: "Dominio",
    type: "DOMAIN_RENEWAL",
    frequency: "ANNUAL",
    description: "Registrazione e rinnovo annuale del dominio.",
  },
  {
    id: "hosting",
    group: "Servizi ricorrenti",
    name: "Hosting sito",
    type: "HOSTING",
    frequency: "ANNUAL",
    description: "Hosting del sito con certificato SSL.",
  },
  {
    id: "manutenzione",
    group: "Servizi ricorrenti",
    name: "Manutenzione e aggiornamenti",
    type: "MAINTENANCE",
    frequency: "ANNUAL",
    description: "Aggiornamenti, backup e piccoli interventi sul sito.",
  },
  {
    id: "email",
    group: "Servizi ricorrenti",
    name: "Caselle email",
    type: "EMAIL",
    frequency: "ANNUAL",
    description: "Caselle email sul dominio del cliente.",
  },
  {
    id: "assistenza",
    group: "Servizi ricorrenti",
    name: "Assistenza tecnica",
    type: "SUPPORT",
    frequency: "NONE",
    description: "Interventi di assistenza su richiesta.",
  },
];
