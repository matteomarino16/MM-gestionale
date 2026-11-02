"use client";

import { themeInitScript } from "./theme-script";

/**
 * Script inline eseguito durante il parsing dell'HTML (prima del primo paint).
 * Sul client il tipo diventa text/plain, così React non lo considera uno script
 * da eseguire e non emette avvisi (pattern della guida "Preventing flash" di Next.js).
 */
export function ThemeInit() {
  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: themeInitScript }}
    />
  );
}
