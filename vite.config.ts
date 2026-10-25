import os from 'node:os';
import tailwindcss from '@tailwindcss/vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

interface BridgeMemory {
  geminiApiKey: string;
  sharedStoreJson: string | null;
  updatedAt: number;
}

const bridgeMemory: BridgeMemory = {
  geminiApiKey: process.env.VITE_GEMINI_API_KEY ?? '',
  sharedStoreJson: null,
  updatedAt: 0,
};

function getLanIps(): string[] {
  const nets = os.networkInterfaces();
  const ips: string[] = [];
  for (const list of Object.values(nets)) {
    if (!list) continue;
    for (const iface of list) {
      if (iface.family === 'IPv4' && !iface.internal) {
        ips.push(iface.address);
      }
    }
  }
  return ips;
}

function mobileBridgePlugin(isHttps: boolean): Plugin {
  return {
    name: 'makro-mobile-bridge',
    configureServer(server) {
      server.middlewares.use('/api/bridge', (req, res) => {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        if (req.method === 'GET') {
          const ips = getLanIps();
          const port = server.config.server.port ?? 5173;
          const proto = isHttps ? 'https' : 'http';
          const urls = ips.map((ip) => `${proto}://${ip}:${port}`);
          res.end(
            JSON.stringify({
              ips,
              port,
              https: isHttps,
              urls,
              geminiApiKey: bridgeMemory.geminiApiKey,
              sharedStoreJson: bridgeMemory.sharedStoreJson,
              updatedAt: bridgeMemory.updatedAt,
            }),
          );
          return;
        }

        if (req.method === 'POST') {
          let body = '';
          req.on('data', (chunk: Buffer) => {
            body += chunk.toString();
          });
          req.on('end', () => {
            try {
              const parsed = JSON.parse(body) as {
                geminiApiKey?: string;
                sharedStoreJson?: string;
              };
              if (typeof parsed.geminiApiKey === 'string') {
                bridgeMemory.geminiApiKey = parsed.geminiApiKey.trim();
              }
              if (typeof parsed.sharedStoreJson === 'string') {
                bridgeMemory.sharedStoreJson = parsed.sharedStoreJson;
                bridgeMemory.updatedAt = Date.now();
              }
              res.end(JSON.stringify({ ok: true, updatedAt: bridgeMemory.updatedAt }));
            } catch {
              res.statusCode = 400;
              res.end(JSON.stringify({ ok: false }));
            }
          });
          return;
        }

        res.statusCode = 405;
        res.end(JSON.stringify({ error: 'Method not allowed' }));
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const isHttps = process.env.HTTPS === 'true' || mode === 'https';

  return {
    plugins: [
      react(),
      tailwindcss(),
      mobileBridgePlugin(isHttps),
      ...(isHttps ? [basicSsl()] : []),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.svg', 'icons.svg'],
        manifest: {
          name: 'Makro Takip - Akıllı Besin ve Kalori Takipçisi',
          short_name: 'MakroTakip',
          description: 'Çevrimdışı destekli, barkod okuyuculu günlük kalori ve makro besin takip uygulaması',
          theme_color: '#020617',
          background_color: '#020617',
          display: 'standalone',
          orientation: 'portrait',
          icons: [
            {
              src: '/favicon.svg',
              sizes: 'any',
              type: 'image/svg+xml',
              purpose: 'any maskable',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        },
      }),
    ],
    server: {
      host: true, // Yerel ağdan (telefon vb.) erişim için
      port: 5173,
      proxy: {
        // Open Food Facts arama ve barkod uç noktaları için CORS ve User-Agent sarmalayıcısı
        '/api/off-search': {
          target: 'https://search.openfoodfacts.org',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/off-search/, '/search'),
          headers: {
            'User-Agent': 'MakroTakip - WebApp - Version 1.0 - https://github.com/sporproje',
          },
        },
        '/api/off-product': {
          target: 'https://world.openfoodfacts.org',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/off-product/, '/api/v2/product'),
          headers: {
            'User-Agent': 'MakroTakip - WebApp - Version 1.0 - https://github.com/sporproje',
          },
        },
      },
    },
    test: {
      globals: true,
      environment: 'node',
    },
  };
});
