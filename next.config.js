/** @type {import('next').NextConfig} */
module.exports = {
  basePath: '/career',
  output: 'standalone',
  // basePath уже добавляет /career к ассетам и роутам — руками нигде не приписываем.
  experimental: { serverActions: { bodySizeLimit: '15mb' } },
};
