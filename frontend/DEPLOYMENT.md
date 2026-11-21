# Deploy the frontend to Vercel

## GitHub deployment

1. Merge the frontend changes into the branch you want to deploy.
2. Import `solstxce/cashfree-sarvam-buildathon` in Vercel.
3. Set **Root Directory** to `frontend`, framework to **Vite**, and Node.js to a supported LTS (22.12+).
4. Set `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` for Production and Preview in Vercel Environment Variables. Use the public publishable/anon key, never a service-role key. The existing Vite configuration also accepts `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
5. Deploy. `vercel.json` installs with `npm ci`, builds with `npm run build`, and serves `dist`.
6. In Supabase Authentication > URL Configuration, set Site URL to the production HTTPS URL and allow the corresponding signup confirmation redirect. Add any preview URLs you will use. Redeploy after changing build environment variables.

## PowerShell deployment

From the repository root:

```powershell
npx --yes --package=vercel vercel login
.\frontend\scripts\deploy-vercel.ps1             # Preview
.\frontend\scripts\deploy-vercel.ps1 -Production # Production
```

The script checks the local build, then starts Vercel's deployment flow. On the first run, choose the appropriate account and project. Follow the CLI instructions if the project uses a configured `frontend` Root Directory. Vercel project environment settings supply the cloud build's variables; a local `.env` is not a substitute. Do not commit `.env` or `.vercel`.

## Backend boundary

This deployment hosts the React frontend, its direct Supabase integration, and the authenticated `/api/start-call` Vercel function. Configure `CALL_WORKFLOW_URL` (plus optional `CALL_WORKFLOW_TOKEN`) as server environment variables to enable borrower calls. See [Call workflow setup](CALL_WORKFLOW.md). The Vite `/api` proxy is a local development/preview feature, not a production server. Python queue and dry-run registration actions need a separately deployed collections API and an authenticated server-side proxy before they work on Vercel. The configuration deliberately excludes `/api` from the SPA fallback, so missing backend routes return 404 rather than HTML. Keep `TRIGGER_API_KEY` server-side. This script does not deploy the Python API or apply SQL migrations.

Receipt parsing uses the authenticated `/api/parse-receipt` function and Sarvam Document AI. Configure `CALL_WORKFLOW_TOKEN` with the Sarvam key; see [Receipt parsing](RECEIPT_PARSING.md). Parsing prefills the borrower form for review and does not persist the uploaded receipt.
