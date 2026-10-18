import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pacote de carga (docs/carga) chega por Server Action: 1 MB é pouco
  // para escolas grandes
  experimental: { serverActions: { bodySizeLimit: "5mb" } },
};

export default nextConfig;
