/** @type {import('next').NextConfig} */
module.exports = {
  basePath: '/career',
  output: 'standalone',
  trailingSlash: false,
  // Приложение за прокси в подпапке не должно само решать вопрос со слэшем —
  // иначе /career и /career/ отправляют друг на друга по кругу.
  skipTrailingSlashRedirect: true,
  experimental: { serverActions: { bodySizeLimit: '15mb' } },
};
