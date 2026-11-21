import { defineConfig, loadEnv, type ProxyOptions } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, fileURLToPath(new URL('.', import.meta.url)), [
    'SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'VITE_SUPABASE_', 'CALL_WORKFLOW_URL', 'CALL_WORKFLOW_TOKEN', 'COLLECTIONS_API_URL', 'TRIGGER_API_KEY',
  ])
  // Same-origin /api for the collections API. The key stays on this server and calls are always dry runs.
  const isAllowed = (method = '', path = '') => (method === 'GET' && path === '/api/queue') || (method === 'POST' && path === '/api/trigger/call')
  const proxy: Record<string, ProxyOptions> = {
    '/api': {
      target: env.COLLECTIONS_API_URL || 'http://127.0.0.1:8000',
      headers: { 'X-API-Key': env.TRIGGER_API_KEY || '' },
      bypass: req => isAllowed(req.method, req.url?.split('?')[0]) ? undefined : false,
      rewrite: url => url.split('?')[0] === '/api/queue' ? '/queue' : '/trigger/call?dry_run=true',
    },
  }
  const callWorkflowPlugin = {
    name: 'call-workflow-api',
    async configureServer(server: import('vite').ViteDevServer) {
      const modulePath = new URL('./server/callWorkflow.mjs', import.meta.url).href
      const { createCallHandler } = await import(modulePath)
      const receiptModulePath = new URL('./server/receiptParser.mjs', import.meta.url).href
      const { createReceiptHandler } = await import(receiptModulePath)
      server.middlewares.use('/api/parse-receipt', (req, res, next) => {
        if (req.url?.split('?')[0] !== '/') { next(); return }
        const handler = createReceiptHandler(loadEnv(mode, server.config.envDir, ['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'VITE_SUPABASE_', 'CALL_WORKFLOW_TOKEN', 'SARVAM_API_KEY']))
        void handler(req, res).catch(() => { if (!res.writableEnded) { res.statusCode = 500; res.end('{"error":"Receipt parsing failed."}') } })
      })
      server.middlewares.use('/api/start-call', (req, res, next) => {
        if (req.url?.split('?')[0] !== '/') { next(); return }
        const handler = createCallHandler(loadEnv(mode, server.config.envDir, ['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'VITE_SUPABASE_', 'CALL_WORKFLOW_']))
        void handler(req, res).catch(() => { if (!res.writableEnded) { res.statusCode = 500; res.end('{"error":"Call request failed."}') } })
      })
    },
  }
  return {
    plugins: [react(), tailwindcss(), callWorkflowPlugin],
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(env.SUPABASE_URL || env.VITE_SUPABASE_URL || ''),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(env.SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY || ''),
    },
    server: { proxy },
    preview: { proxy },
    build: {
      rolldownOptions: { output: { manualChunks: (id) => id.includes('@supabase/') ? 'supabase' : undefined } },
    },
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
  }
})
