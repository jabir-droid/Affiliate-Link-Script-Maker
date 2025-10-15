// /middleware.js
import { NextResponse } from "next/server";

// NOTE: Middleware Vercel bersifat framework-agnostic; file ini akan dijalankan di edge.
// Di sini kita TIDAK memanggil Redis (hemat latency).
// Validasi mendalam tetap di API (generate.js) yang cek sesi di Redis.

export function middleware(req) {
  const url = new URL(req.url);
  const { pathname } = url;

  // Allowlist paths yang boleh diakses tanpa login
  const allow = [
    "/login.html",
    "/api/login",
    "/api/logout",
    "/favicon.ico",
    "/robots.txt",
    "/sitemap.xml"
  ];

  // izinkan file statis (css/js/img/font) & /api/* selain generate? → kita tetap allow /api/*,
  // tapi generate.js akan verifikasi sesi server-side.
  if (
    allow.includes(pathname) ||
    pathname.startsWith("/api/") ||
    pathname.match(/\.(css|js|png|jpg|jpeg|svg|ico|webp|gif|ttf|woff2?)$/i)
  ) {
    return NextResponse.next();
  }

  // Perlu sesi?
  const hasSessionCookie = req.cookies.get("session");
  if (!hasSessionCookie) {
    const loginUrl = new URL("/login.html", req.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

// Terapkan ke semua route
export const config = {
  matcher: "/:path*"
};
