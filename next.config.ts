import BundleAnalyzerPlugin from '@next/bundle-analyzer';
import type { NextConfig } from 'next';

const withBundleAnalyzer = BundleAnalyzerPlugin({
  enabled: process.env.ANALYZE === 'true',
});

const nextConfig: NextConfig = {
  reactStrictMode: true,
};

export default withBundleAnalyzer(nextConfig);
