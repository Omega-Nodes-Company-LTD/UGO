import type { NextConfig } from "next";

/**
 * La reception (ADR-051): l'unica superficie pubblica. `standalone` produce
 * il server minimo per il container; lint e typecheck girano dal workspace
 * (turbo), non dentro `next build`, per usare le stesse regole di tutto il
 * monorepo.
 */
const nextConfig: NextConfig = {
  output: "standalone",
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  poweredByHeader: false,
};

export default nextConfig;
