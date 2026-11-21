# Receipt parsing

In Add borrower, choose Upload receipt, select a JPG/PNG/PDF up to 3 MB, then click Parse receipt. The app uploads the document to Sarvam Document AI and polls its asynchronous extraction job. Completed fields prefill the manual form. Review and correct every field before Create borrower; missing values are left blank. Parsing does not save a borrower, attach a receipt to the record, or initiate a call.

The Parse action uses Sarvam's schema-based Extract endpoint (`/doc-ai/v1/job/extract`) because the form needs structured borrower fields rather than page text. The API key stays on the server. Set `CALL_WORKFLOW_TOKEN` to the Sarvam API key in the app folder's `.env` or Vercel Environment Variables. `SARVAM_API_KEY` is accepted as a fallback. The Supabase project settings must also be configured; requests require a verified signed-in account.

Local development serves `/api/parse-receipt` through the Vite middleware; Vercel serves the equivalent function from `api/parse-receipt.mjs`. Jobs use expiring signed tickets tied to the requesting account. The 3 MB document limit keeps base64 JSON uploads below Vercel's request-body limit. Incomplete or unreadable extraction is reported rather than silently creating records.

Checks:

```powershell
node --test tests/receiptParser.test.mjs tests/callWorkflow.test.mjs
npm run build
```

A live verification using the repository's synthetic sample image completed successfully and returned all nine requested field names. No borrower was saved and no call was placed.
