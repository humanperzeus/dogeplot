import path from "path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import { tempo } from "tempo-devtools/dist/vite";
import fs from 'fs';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  console.log('\n🔍 Vite Environment Loading');
  console.log('═══════════════════════════════');
  console.log('Mode:', mode);
  
  // Debug: List all env files
  console.log('\n📁 Checking env files:');
  ['.env', '.env.local', `.env.${mode}`, `.env.${mode}.local`].forEach(file => {
    console.log(`${file}: ${fs.existsSync(file) ? '✅ exists' : '❌ not found'}`);
  });
  
  // Load env file based on `mode` in the current directory.
  // Set the third parameter to '' to load all env regardless of the `VITE_` prefix.
  const env = loadEnv(mode, process.cwd(), '');
  
  console.log('\n🔍 Loaded Environment:');
  console.log('- VITE_MODE:', env.VITE_MODE);
  console.log('- NODE_ENV:', mode.includes('production') ? 'production' : 'development');
  console.log('- VITE_SUPABASE_URL:', env.VITE_SUPABASE_URL);
  console.log('- Loading from mode:', mode);
  console.log('- Env file should be:', `.env.${mode}`);
  
  // Debug: Show all VITE_ variables
  console.log('\n📋 All VITE_ variables:');
  Object.keys(env).filter(key => key.startsWith('VITE_')).forEach(key => {
    console.log(`- ${key}: ${env[key]}`);
  });
  console.log('═══════════════════════════════\n');

  const conditionalPlugins: [string, Record<string, any>][] = [];
  
  // @ts-ignore
  if (process.env.TEMPO === "true") {
    conditionalPlugins.push(["tempo-devtools/swc", {}]);
  }

  return {
    base: mode.includes('production') ? '/' : '/',
    define: {
      'process.env.NODE_ENV': mode.includes('production') ? '"production"' : '"development"',
      // Explicitly define Vite environment variables with logging
      'import.meta.env': JSON.stringify({
        ...env,
        MODE: mode,
        DEV: mode !== 'production',
        PROD: mode === 'production',
      })
    },
    optimizeDeps: {
      entries: ["src/main.tsx", "src/tempobook/**/*"],
    },
    plugins: [
      react({
        plugins: conditionalPlugins,
      }),
      tempo(),
    ],
    resolve: {
      preserveSymlinks: true,
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    server: {
      // @ts-ignore
      allowedHosts: true,
    },
    build: {
      chunkSizeWarningLimit: 1000,
      rollupOptions: {
        output: {
          manualChunks: {
            'react-vendor': ['react', 'react-dom', 'react-router-dom'],
            'ui-vendor': [
              '@radix-ui/react-accordion',
              '@radix-ui/react-alert-dialog',
              '@radix-ui/react-avatar',
              '@radix-ui/react-dialog',
              '@radix-ui/react-dropdown-menu',
              '@radix-ui/react-label',
              '@radix-ui/react-scroll-area',
              '@radix-ui/react-select',
              '@radix-ui/react-tabs',
            ],
          },
        },
      },
    }
  };
});
