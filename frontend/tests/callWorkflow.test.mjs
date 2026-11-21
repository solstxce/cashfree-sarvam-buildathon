import test from 'node:test'
import assert from 'node:assert/strict'
import { workflowPayload, createCallHandler } from '../server/callWorkflow.mjs'

const customer = { customer_id: 123, user_id: 'owner', name: 'Demo Borrower', phone_number: '+91 98765 43210', email: 'borrower@example.test', language: 'Kannada', lending_date: '2026-08-18', due_date: '2026-11-18', outstanding_amount: 1200, principal_amount: 5000, interest_rate: 2 }
const requestId = 'b4a46fd1-c4ac-4264-a389-c82b92508337'
const config = { SUPABASE_URL: 'https://supabase.example.test', SUPABASE_PUBLISHABLE_KEY: 'public-key', CALL_WORKFLOW_URL: 'https://workflow.example.test/webhook' }
function client(record = customer, user = { id: 'owner' }) {
  const query = { select() { return this }, eq() { return this }, async maybeSingle() { return { data: record } } }
  return { auth: { async getUser() { return { data: { user } } } }, from() { return query } }
}
async function invoke({ record = customer, user, options = config, fetch = async () => ({ ok: true }), method = 'POST', authorization = 'Bearer test-session', body = { customer_id: 123, request_id: requestId } } = {}) {
  const res = { statusCode: 0, setHeader() {}, end(text) { this.body = JSON.parse(text) } }
  const handler = createCallHandler(options, { createClient: () => client(record, user), fetch })
  await handler({ method, headers: { authorization }, body }, res)
  return res
}
test('matches the requested workflow shape with stored borrower values and IST overdue days', () => {
  assert.deepEqual(workflowPayload(customer, 'demo-call-001', new Date('2026-11-20T20:00:00Z')), { data: {
    event: 'start_collection_call', request_id: 'demo-call-001', customer_id: 123,
    name: 'Demo Borrower', borrower_name: 'Demo Borrower', phone_number: '9876543210', phone: '+919876543210', email: 'borrower@example.test', language: 'kn-IN', preferred_language: 'Kannada', lending_date: '2026-08-18', due_date: '2026-11-18', outstanding_amount: 1200, principal_amount: 5000, interest_rate: 2, amount_due: 1200, currency: 'INR', days_past_due: 3, installment_id: 'emi-123-2026-11-18', link_id: 'emi-123-2026-11-18',
  } })
})
test('supports locale input, rejects invalid records and clamps future overdue days', () => {
  assert.equal(workflowPayload({ ...customer, language: 'te-IN', due_date: '2026-12-01' }, requestId, new Date('2026-11-21')).data.days_past_due, 0)
  for (const fields of [{ phone_number: '123' }, { language: 'Unknown' }, { due_date: '2026-02-30' }, { outstanding_amount: 0 }]) assert.throws(() => workflowPayload({ ...customer, ...fields }, requestId))
})
test('rejects unauthenticated, missing and other-owner borrowers without dispatch', async () => {
  const fetch = () => { throw new Error('Must not dispatch') }
  assert.equal((await invoke({ authorization: '', fetch })).statusCode, 401)
  assert.equal((await invoke({ user: null, fetch })).statusCode, 401)
  assert.equal((await invoke({ record: null, fetch })).statusCode, 404)
  assert.equal((await invoke({ record: { ...customer, user_id: 'other' }, fetch })).statusCode, 404)
})
test('rejects missing configuration, invalid methods and malformed requests', async () => {
  const missing = await invoke({ options: { ...config, CALL_WORKFLOW_URL: '' } })
  assert.equal(missing.statusCode, 503)
  assert.match(missing.body.error, /Missing server settings: CALL_WORKFLOW_URL/)
  assert.equal((await invoke({ method: 'GET' })).statusCode, 405)
  assert.equal((await invoke({ body: 'not JSON' })).statusCode, 400)
  assert.equal((await invoke({ body: { customer_id: 123, request_id: 'bad' } })).statusCode, 400)
})
test('posts the envelope server-side with optional bearer token and ignores injected borrower fields', async () => {
  let sent
  const response = await invoke({ options: { ...config, CALL_WORKFLOW_TOKEN: 'private-test-token' }, body: { customer_id: 123, request_id: requestId, phone_number: '9999999999', outstanding_amount: 1 }, fetch: async (url, init) => { sent = { url, init }; return { ok: true } } })
  assert.equal(response.statusCode, 202)
  assert.equal(JSON.parse(sent.init.body).data.amount_due, 1200)
  assert.equal(JSON.parse(sent.init.body).data.phone_number, '9876543210')
  assert.equal(sent.init.headers.Authorization, 'Bearer private-test-token')
  assert.equal(sent.init.redirect, 'error')
  assert.equal(JSON.stringify(response.body).includes('private-test-token'), false)
})
test('surfaces provider failures and uncertain timeout without claiming call pickup', async () => {
  assert.equal((await invoke({ fetch: async () => ({ ok: false, status: 500 }) })).statusCode, 502)
  const result = await invoke({ fetch: async () => { throw new Error('timeout') } })
  assert.equal(result.statusCode, 504)
  assert.match(result.body.error, /may have started/)
})
