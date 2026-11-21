# Borrower Call workflow

The Call action in the borrower table and cards posts to `/api/start-call`. The server verifies the signed-in Supabase user, loads only that user's saved borrower, and forwards the requested `data` envelope to Cashfree Relay. Browser input cannot override the phone, amount, language, or borrower details. Demo-only records cannot initiate calls.

## Configuration

In local `.env`, fill in:

```dotenv
CALL_WORKFLOW_URL=https://your-relay-webhook-url
CALL_WORKFLOW_TOKEN=
```

`CALL_WORKFLOW_TOKEN` is optional and sent as a Bearer token if set. Keep both values server-only, without a `VITE_` prefix. Supabase settings must point to the same project as the browser: `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` (the VITE public equivalents are also accepted).

Restart `npm run dev` after configuring the URL. Local Vite development serves the same handler used by the Vercel function. For production, add these settings in Vercel Environment Variables and redeploy. Vite static preview does not run this function; use Vercel preview deployments to check production behavior.

## Payload and outcome

- `request_id` is a new UUID for each deliberate call action, rather than the fixed demo ID.
- `customer_id`, names, dates, email and amounts come from the saved borrower.
- `phone_number` is the ten-digit Indian mobile number and `phone` includes `+91`.
- Language names map to locale codes, for example Kannada to `kn-IN`.
- `days_past_due` uses today's date in IST, clamped to zero for future due dates.
- Both `installment_id` and `link_id` are `emi-<customer_id>-<due_date>`.
- The UI disables borrower Call buttons during dispatch and shows server errors. An accepted webhook is reported as accepted, not as proof that the borrower picked up.
- A timeout can occur after the workflow starts. Check workflow logs before retrying. Configure the workflow to deduplicate `request_id` before dialing and enforce its calling hours, contact preferences, and daily call policy.

This is a direct Relay dispatch, separate from the Python queue's dry-run registration. The Python queue currently uses hashed installment IDs; do not assume its existing payment links match the readable IDs required by this workflow. Configure downstream payment actions to use the IDs in this payload consistently.

Log interaction remains available separately from the actual Call action. Dispatch alone does not create a completed call record; persist call outcomes from your workflow/callback integration.

## Offline checks

```powershell
node --test tests/callWorkflow.test.mjs
npm run build
```

These checks mock external providers and never dial a phone.
