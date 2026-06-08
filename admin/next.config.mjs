/** @type {import('next').NextConfig} */
const nextConfig = {
  basePath: '/admin',
  output: 'export',
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
