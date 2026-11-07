import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIES = ["__Host-gst_session", "gst_session"];
// /api/cron è protetto dal proprio segreto (Authorization: Bearer CRON_SECRET), non dal cookie.
const PUBLIC_PATHS = ["/login", "/offline", "/api/cron"];

/**
 * Controllo ottimistico: senza cookie di sessione si viene rimandati al login.
 * La validazione vera (DB) avviene nel Data Access Layer su ogni pagina/azione/API.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const hasCookie = SESSION_COOKIES.some((name) => request.cookies.has(name));
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (!hasCookie && !isPublic) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    if (pathname !== "/") url.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    // Esclude asset statici, manifest PWA, service worker e icone.
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|icons/|icon.png|apple-icon|robots.txt).*)",
  ],
};
