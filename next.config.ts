import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Inlines the stylesheet into each HTML page, so first paint does not wait
    // for a separate CSS request. On a throttled phone (Slow 4G, 4x CPU) first
    // paint went from 0.82 s to 0.35 s for about 9 KB more brotli per full
    // page load. Client-side navigations still use the cached stylesheet.
    inlineCss: true,
  },
  poweredByHeader: false,
  reactStrictMode: true,
};

export default nextConfig;
