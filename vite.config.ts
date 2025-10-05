import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { NodeGlobalsPolyfillPlugin } from '@esbuild-plugins/node-globals-polyfill';
import { NodeModulesPolyfillPlugin } from '@esbuild-plugins/node-modules-polyfill';
import nodePolyfills from 'rollup-plugin-polyfill-node';
import inject from '@rollup/plugin-inject';

// https://vite.dev/config/
export default defineConfig({
  define: {
    'process.env': {},
    'process.browser': true,
    global: 'globalThis',
    'process.env.NODE_DEBUG': 'undefined',
    'process.version': '"v18.0.0"',
    'process.nextTick': 'setImmediate',
    'process.platform': '"browser"',
    'process.stdout.isTTY': 'false',
    // Polyfill setImmediate globally
    'global.setImmediate': 'window.setImmediate',
    'global.clearImmediate': 'window.clearImmediate',
  },
  plugins: [
    // Ensure polyfills are injected first
    {
      name: 'polyfills',
      config() {
        return {
          build: {
            rollupOptions: {
              plugins: [
                nodePolyfills({
                  include: ['buffer', 'process', 'setimmediate']
                }),
                inject({
                  Buffer: ['buffer', 'Buffer'],
                  process: 'process/browser',
                  setImmediate: ['setimmediate', 'setImmediate'],
                  clearImmediate: ['setimmediate', 'clearImmediate']
                })
              ]
            }
          }
        };
      }
    },
    react(),
    {
      name: 'node-polyfills',
      config() {
        return {
          resolve: {
            alias: [
              { find: 'crypto', replacement: 'crypto-browserify' },
              { find: 'stream', replacement: 'stream-browserify' },
              { find: 'util', replacement: 'util' },
              { find: 'buffer', replacement: 'buffer' },
              { find: 'process', replacement: 'process/browser' },
              { find: 'path', replacement: 'path-browserify' },
              { find: 'os', replacement: 'os-browserify' },
              { find: 'zlib', replacement: 'browserify-zlib' },
              { find: 'http', replacement: 'stream-http' },
              { find: 'https', replacement: 'https-browserify' },
              { find: 'assert', replacement: 'assert' },
            ],
          },
        };
      },
    },
  ],
  optimizeDeps: {
    esbuildOptions: {
      // Node.js global to browser globalThis
      define: {
        global: 'globalThis',
      },
      // Enable esbuild polyfill plugins
      plugins: [
        NodeGlobalsPolyfillPlugin({
          process: true,
          buffer: true,
        }),
        NodeModulesPolyfillPlugin(),
      ],
    },
  },
  build: {
    target: 'es2020',
    rollupOptions: {
      plugins: [
        // Enable node.js polyfills
        nodePolyfills({
          include: ['buffer', 'process']
        }),
        // Inject the Buffer polyfill
        inject({
          Buffer: ['buffer', 'Buffer'],
          process: 'process/browser',
        }),
      ],
    },
    commonjsOptions: {
      transformMixedEsModules: true,
    },
  },
  resolve: {
    alias: [
      { find: 'buffer', replacement: 'buffer' },
      { find: 'process', replacement: 'process/browser' },
      { find: 'util', replacement: 'util' },
    ],
  },
});
