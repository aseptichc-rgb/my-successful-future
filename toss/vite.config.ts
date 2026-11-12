import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

const path = (name: string) => fileURLToPath(new URL(name, import.meta.url));
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, path('..'), 'NEXT_PUBLIC_');
  if (command === 'build') {
    const required = ['API_KEY', 'AUTH_DOMAIN', 'PROJECT_ID', 'STORAGE_BUCKET', 'MESSAGING_SENDER_ID', 'APP_ID'];
    const missing = required.map((key) => `NEXT_PUBLIC_FIREBASE_${key}`).filter((key) => !env[key]?.trim());
    if (missing.length) throw new Error(`Missing public Firebase configuration: ${missing.join(', ')}`);
  }
  const define = Object.fromEntries(Object.entries(env).map(([key, value]) => [`process.env.${key}`, JSON.stringify(value)]));
  return {
    plugins: [react(), tailwindcss()],
    // Only explicitly public Firebase configuration is compiled into this bundle.
    define: { ...define,
      'process.env.NEXT_PUBLIC_APP_STORE_URL': 'undefined',
      'process.env.NEXT_PUBLIC_PLAY_STORE_URL': 'undefined',
      'process.env.NEXT_PUBLIC_APP_VERSION': JSON.stringify('1.0.0'),
      'process.env.ENTITLEMENT_REQUIRED': JSON.stringify('true'),
      'process.env.NEXT_PUBLIC_PRIVACY_CONTACT_EMAIL': JSON.stringify(env.NEXT_PUBLIC_PRIVACY_CONTACT_EMAIL || 'aseptichc@gmail.com'),
    },
    publicDir: path('../public'),
    resolve: {
      dedupe: ['react', 'react-dom', 'firebase', '@emotion/react'],
      alias: [
        { find: /^@\/lib\/i18n$/, replacement: path('./i18n.ts') },
        { find: '@/lib/auth-context', replacement: path('./auth-context.tsx') },
        { find: '@/lib/authedFetch', replacement: path('./authedFetch.ts') },
        { find: '@/components/nav/BackButton', replacement: path('./components/Hidden.tsx') },
        { find: '@/components/home/CoachHomeButton', replacement: path('./components/Hidden.tsx') },
        { find: '@/components/home/GuestLinkCard', replacement: path('./components/Hidden.tsx') },
        { find: '@/components/home/StoreReviewCard', replacement: path('./components/Hidden.tsx') },
        { find: '@/components/home/TrialBanner', replacement: path('./components/TrialNotice.tsx') },
        { find: '@/components/progress/ShareStreakButton', replacement: path('./components/ShareButton.tsx') },
        { find: 'next/navigation', replacement: path('./navigation.tsx') },
        { find: 'next/link', replacement: path('./Link.tsx') },
        { find: 'next/image', replacement: path('./Image.tsx') },
        { find: '@', replacement: path('..') },
      ],
    },
    build: { target: 'es2020', sourcemap: false },
    server: { fs: { allow: [path('..')] } },
  };
});
