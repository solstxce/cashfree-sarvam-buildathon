import test from 'node:test'
import assert from 'node:assert/strict'
import { createReceiptHandler, receiptFields } from '../server/receiptParser.mjs'
const config = { CALL_WORKFLOW_TOKEN: 'test-sarvam-key', SUPABASE_URL: 'https://supabase.example.test', SUPABASE_PUBLISHABLE_KEY: 'public-key' }
const png = Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]).toString('base64')
function setup({ user = 'owner', options = config, responses = [] } = {}) {
  let clock = 1000
  const sent = []
  const handler = createReceiptHandler(options, { now: () => clock, createClient: () => ({ auth: { getUser: async () => ({ data: { user: user ? { id: user } : null } }) } }), fetch: async (url, init) => {
    sent.push({ url, init })
    const result = responses.shift()
    if (!result) throw new Error('Unexpected provider request')
    return { ok: result.http ? result.http < 400 : true, status: result.http || 200, json: async () => result }
  } })
  return { sent, expire: () => { clock += 601_000 }, invoke: async (body, authorization = 'Bearer session', method = 'POST') => {
    const res = { setHeader() {}, end(text) { this.body = JSON.parse(text) } }
    await handler({ method, headers: { authorization }, body }, res)
    return res
  } }
}
const upload = { action: 'submit', mime: 'image/png', base64: png }
test('submits a schema extraction with server-only Sarvam key and reads completed fields', async () => {
  const s = setup({ responses: [{ job_id: 'job-1' }, { status: 'completed' }, { result: { name: 'Demo', principal_amount: 1200, ignored: 'no' } }] })
  const submitted = await s.invoke(upload)
  assert.equal(submitted.statusCode, 202)
  assert.ok(submitted.body.ticket)
  assert.equal(s.sent[0].init.headers['api-subscription-key'], 'test-sarvam-key')
  assert.ok(s.sent[0].init.body.get('file') instanceof Blob)
  assert.ok(JSON.parse(s.sent[0].init.body.get('schema')).properties.phone_number)
  assert.equal(JSON.stringify(submitted.body).includes('test-sarvam-key'), false)
  const result = await s.invoke({ action: 'status', ticket: submitted.body.ticket })
  assert.deepEqual(result.body, { status: 'completed', fields: { name: 'Demo', principal_amount: 1200 } })
  assert.equal(s.sent.length, 3)
})
test('rejects unauthenticated users, invalid JSON and unsupported methods', async () => {
  const s = setup()
  assert.equal((await s.invoke(upload, '')).statusCode, 401)
  assert.equal((await s.invoke(upload, 'Bearer session', 'GET')).statusCode, 405)
  assert.equal((await s.invoke('bad JSON')).statusCode, 400)
  assert.equal((await setup({ user: null }).invoke(upload)).statusCode, 401)
  assert.equal(s.sent.length, 0)
})
test('rejects mismatched files and oversized uploads before sending to Sarvam', async () => {
  const s = setup()
  assert.equal((await s.invoke({ ...upload, mime: 'application/pdf' })).statusCode, 422)
  assert.equal((await s.invoke({ ...upload, base64: 'A'.repeat(4_194_308) })).statusCode, 422)
  assert.equal(s.sent.length, 0)
})
test('protects job ownership, rejects tampered and expired tickets', async () => {
  const s = setup({ responses: [{ job_id: 'job-1' }] })
  const { body } = await s.invoke(upload)
  assert.equal((await s.invoke({ action: 'status', ticket: body.ticket + 'x' })).statusCode, 403)
  const other = setup({ user: 'other' })
  assert.equal((await other.invoke({ action: 'status', ticket: body.ticket })).statusCode, 403)
  s.expire()
  assert.equal((await s.invoke({ action: 'status', ticket: body.ticket })).statusCode, 403)
  assert.equal(s.sent.length, 1)
})
test('handles pending jobs, partial extraction and rejected API keys', async () => {
  const s = setup({ responses: [{ job_id: 'job-1' }, { status: 'running' }, { status: 'partially_completed' }] })
  const { body } = await s.invoke(upload)
  assert.equal((await s.invoke({ action: 'status', ticket: body.ticket })).body.status, 'running')
  assert.equal((await s.invoke({ action: 'status', ticket: body.ticket })).statusCode, 422)
  const rejected = await setup({ responses: [{ http: 403 }] }).invoke(upload)
  assert.equal(rejected.statusCode, 503)
  assert.match(rejected.body.error, /Sarvam rejected/)
})
test('does not invent missing borrower fields or return unrelated extracted data', () => {
  assert.deepEqual(receiptFields({ name: '  Demo  ', outstanding_amount: null, principal_amount: -1, admin: true }), { name: 'Demo' })
  assert.throws(() => receiptFields({}))
  assert.throws(() => receiptFields([]))
})
