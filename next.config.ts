import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Tree-shake imports per chunk en vez de meter el módulo entero. Reduce
    // bundle de páginas que importan { LineChart, BarChart } de recharts
    // (~300KB por chunk antes, ~30-50KB después).
    optimizePackageImports: [
      "recharts",
      "@supabase/supabase-js",
      "@supabase/ssr",
    ],
  },
};

export default nextConfig;
