import type { NextConfig } from "next";

// CSP base — bloquea XSS, frame embedding y cualquier carga externa
// no whitelistada. Permite:
//  - script-src: 'self' + 'unsafe-inline' (Next.js inyecta inline scripts
//    para hydration; 'unsafe-eval' por si recharts u otra lib lo necesita).
//  - connect-src: Supabase (REST + Realtime websocket) + Vercel insights.
//  - img-src: self + data: + blob: (canvas exports, recharts).
//  - frame-ancestors 'none' bloquea clickjacking (equivale a X-Frame-Options: DENY).
const supabaseHost = "https://*.supabase.co wss://*.supabase.co";
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  `connect-src 'self' ${supabaseHost} https://vitals.vercel-insights.com`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

const nextConfig: NextConfig = {
  experimental: {
    // Tree-shake per chunk en vez de meter el módulo entero. Reduce
    // bundle de páginas que importan { LineChart, BarChart } de recharts.
    optimizePackageImports: [
      "recharts",
      "@supabase/supabase-js",
      "@supabase/ssr",
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
