import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  site: 'https://mandantor.de',
  output: 'hybrid',
  adapter: cloudflare({
    platformProxy: { enabled: true },
  }),
  integrations: [react()],
  build: {
    inlineStylesheets: 'auto',
  },
  vite: {
    // pdf-lib uses Node-style Buffer indirectly. With nodejs_compat enabled
    // on the Cloudflare Pages project, this just needs to not be tree-shaken
    // into a broken state. ssr.noExternal forces bundling so the polyfill
    // resolution works.
    ssr: {
      noExternal: ['pdf-lib'],
    },
  },
});
