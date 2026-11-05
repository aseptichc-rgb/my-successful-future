import { defineConfig } from '@apps-in-toss/web-framework/config';

export default defineConfig({
  appName: 'anima',
  brand: { primaryColor: '#1E1B4B' },
  navigationBar: { withBackButton: true, withHomeButton: false, withTitle: true, theme: 'light' },
  webView: { bounces: false, pullToRefreshEnabled: false, overScrollMode: 'never' },
  permissions: [],
  webBundleDir: 'dist',
});
