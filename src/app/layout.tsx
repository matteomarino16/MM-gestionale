import type { Metadata, Viewport } from "next";
import { Providers } from "@/components/providers";
import { ThemeInit } from "@/components/theme/theme-init";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Gestionale MM", template: "%s · Gestionale MM" },
  description: "Gestionale privato per clienti, servizi, rinnovi e pagamenti",
  robots: { index: false, follow: false },
  applicationName: "Gestionale MM",
  // Aggiunta alla schermata Home di iPhone: si apre a schermo intero come un'app.
  appleWebApp: { capable: true, title: "Gestionale", statusBarStyle: "default" },
  formatDetection: { telephone: false, email: false, address: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Necessario per le aree sicure (env(safe-area-inset-*)) dell'iPhone.
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="it" suppressHydrationWarning className="h-full antialiased">
      <head>
        <ThemeInit />
      </head>
      <body className="min-h-full bg-background text-foreground">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
