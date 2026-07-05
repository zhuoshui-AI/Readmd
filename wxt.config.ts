import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'Readmd - Immersive Reader',
    description: 'Immersive reading experience for Markdown-style web documents.',
    permissions: ['storage', 'activeTab', 'scripting', 'downloads'],
    host_permissions: ['<all_urls>'],
    icons: {
      16: '/icons/icon16.png',
      48: '/icons/icon48.png',
      128: '/icons/icon128.png',
    },
    action: {
      default_title: 'Readmd Settings',
      default_icon: {
        16: '/icons/icon16.png',
        48: '/icons/icon48.png',
        128: '/icons/icon128.png',
      },
    },
  },
});
