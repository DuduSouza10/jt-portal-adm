import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Renderização dinâmica clássica (sem Cache Components / Partial Prefetching): no Netlify o
  // streaming das navegações parciais era cortado (erro React #412) e a página ficava carregando.
  // Todo o sistema é autenticado e dinâmico, então não perde nada.
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
