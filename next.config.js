/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    MAGENTO_BASE_URL: 'https://api.routestoroots.in/rest/V1',
  },
}

module.exports = nextConfig