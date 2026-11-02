/**
 * Applica il tema prima del primo paint (evita il lampo di tema chiaro).
 * Inserito nel <head> dal layout server; la chiave è condivisa con useTheme.
 */
export const THEME_STORAGE_KEY = "gst-theme";

export const themeInitScript = `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}")||"system";var d=t==="dark"||(t==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);var e=document.documentElement;e.classList.toggle("dark",d);e.style.colorScheme=d?"dark":"light";}catch(_){}})();`;
