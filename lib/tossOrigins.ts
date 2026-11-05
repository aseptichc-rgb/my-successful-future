export const TOSS_APP_NAME = 'anima';

// SDK >=3.1 serves both production and QR bundles on the apps.* origins.
// The pinned SDK is 3.9.0; web.* origins belonged only to SDK 3.0.x.
// https://developers-apps-in-toss.toss.im/documentation/integration/sdk-3.x#cautions
export const TOSS_ORIGINS = [
  'https://anima.apps.tossmini.com',
  'https://anima.private-apps.tossmini.com',
] as const;
