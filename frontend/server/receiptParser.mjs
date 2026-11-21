import { createClient } from '@supabase/supabase-js'
import { createHmac, timingSafeEqual } from 'node:crypto'

const MAX_BYTES = 3 * 1024 * 1024
const API = 'https://api.sarvam.ai/doc-ai/v1/job'
const descriptions = {
  name: 'Borrower full name, not the lender or shop name. Omit if unreadable.',
  phone_number: 'Borrower Indian mobile phone number. Omit if unreadable.',
  email: 'Borrower email address, if written.', language: 'Borrower language as an English name, only if explicitly written.',
  lending_date: 'Loan origination date in YYYY-MM-DD, only if written.', due_date: 'Loan repayment due date in YYYY-MM-DD, only if written.',
  principal_amount: 'Original loan principal in INR, numeric with no currency symbols.',
  outstanding_amount: 'Remaining unpaid balance in INR. Do not infer from principal or receipt payment amount.',
  interest_rate: 'Interest rate percentage, only if explicitly written.',
}
export const receiptSchema = { type: 'object', properties: Object.fromEntries(Object.entries(descriptions).map(([name, description]) => [name, { type: ['principal_amount', 'outstanding_amount', 'interest_rate'].includes(name) ? 'number' : 'string', description }])) }

export function receiptFields(result) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error('Unreadable extraction result.')
  const fields = {}
  for (const name of Object.keys(descriptions)) {
    const value = result[name]
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) fields[name] = value
    else if (typeof value === 'string' && value.trim()) fields[name] = value.trim().slice(0, 200)
  }
  if (!Object.keys(fields).length) throw new Error('No borrower details could be read. Try a clearer receipt or enter details manually.')
  return fields
}
function signature(payload, key) { return createHmac('sha256', key).update(payload).digest('base64url') }
function ticketFor(jobId, userId, key, now) {
  const payload = Buffer.from(JSON.stringify({ jobId, userId, expires: now + 600_000 })).toString('base64url')
  return `${payload}.${signature(payload, key)}`
}
function readTicket(ticket, userId, key, now) {
  if (typeof ticket !== 'string' || ticket.length > 1500) throw new Error('Invalid job ticket.')
  const [payload, mac, extra] = ticket.split('.')
  const expected = signature(payload || '', key)
  if (extra || !mac || mac.length !== expected.length || !timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) throw new Error('Invalid job ticket.')
  const data = JSON.parse(Buffer.from(payload, 'base64url').toString())
  if (data.userId !== userId || data.expires < now || !/^[A-Za-z0-9_-]{1,128}$/.test(data.jobId)) throw new Error('Receipt job expired or belongs to another account.')
  return data.jobId
}
function receiptFile(body) {
  if (!['image/jpeg', 'image/png', 'application/pdf'].includes(body.mime) || typeof body.base64 !== 'string' || !body.base64.length || body.base64.length > Math.ceil(MAX_BYTES / 3) * 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(body.base64)) throw new Error('Choose a JPG, PNG or PDF up to 3 MB.')
  const bytes = Buffer.from(body.base64, 'base64')
  if (!bytes.length || bytes.length > MAX_BYTES || bytes.toString('base64') !== body.base64) throw new Error('Invalid receipt upload.')
  const valid = body.mime === 'application/pdf' ? bytes.subarray(0, 5).toString() === '%PDF-' : body.mime === 'image/png' ? bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
  if (!valid) throw new Error('The receipt content does not match its file type.')
  return new Blob([bytes], { type: body.mime })
}
export function createReceiptHandler(config, dependencies = {}) {
  const send = dependencies.fetch || fetch
  const factory = dependencies.createClient || createClient
  const now = dependencies.now || Date.now
  return async (req, res) => {
    const reply = (status, data) => { res.statusCode = status; res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store'); res.end(JSON.stringify(data)) }
    if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return reply(405, { error: 'Use POST.' }) }
    const authorization = req.headers.authorization || ''
    if (!/^Bearer \S+$/.test(authorization)) return reply(401, { error: 'Sign in to parse receipts.' })
    const key = config.CALL_WORKFLOW_TOKEN || config.SARVAM_API_KEY
    const url = config.SUPABASE_URL || config.VITE_SUPABASE_URL
    const publicKey = config.SUPABASE_PUBLISHABLE_KEY || config.VITE_SUPABASE_ANON_KEY
    if (!key || !url || !publicKey) return reply(503, { error: 'Receipt parsing needs CALL_WORKFLOW_TOKEN (your Sarvam API key) and Supabase settings in the server .env.' })
    let body = req.body
    try {
      if (body === undefined) {
        let text = ''
        for await (const chunk of req) { text += chunk; if (Buffer.byteLength(text) > 4_300_000) return reply(413, { error: 'Receipt request too large. Use a file up to 3 MB.' }) }
        body = text
      }
      if (typeof body === 'string') body = JSON.parse(body)
      if (!body || typeof body !== 'object' || !['submit', 'status'].includes(body.action)) return reply(400, { error: 'Invalid receipt request.' })
    } catch { return reply(400, { error: 'Invalid receipt request.' }) }
    let user
    try {
      const client = factory(url, publicKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false } })
      const { data, error } = await client.auth.getUser(authorization.slice(7))
      if (error || !data?.user) return reply(401, { error: 'Your session expired. Sign in again.' })
      user = data.user
    } catch { return reply(502, { error: 'Could not verify your session.' }) }
    async function provider(path, options = {}) {
      const response = await send(`${API}/${path}`, { ...options, headers: { 'api-subscription-key': key }, redirect: 'error', signal: AbortSignal.timeout(20_000) })
      if (!response.ok) {
        const error = new Error([401,402,403].includes(response.status) ? 'Sarvam rejected the key or credits. Check CALL_WORKFLOW_TOKEN and your Sarvam account.' : response.status === 429 ? 'Sarvam is busy. Try again shortly.' : 'Sarvam could not process this receipt. Try a clearer or smaller document.')
        error.status = [401,402,403,429].includes(response.status) ? 503 : 502
        throw error
      }
      return response.json()
    }
    try {
      if (body.action === 'submit') {
        let file
        try { file = receiptFile(body) } catch (error) { return reply(422, { error: error.message }) }
        const form = new FormData()
        form.append('file', file, body.mime === 'application/pdf' ? 'receipt.pdf' : body.mime === 'image/png' ? 'receipt.png' : 'receipt.jpg')
        form.append('schema', JSON.stringify(receiptSchema)); form.append('output_format', 'json')
        const job = await provider('extract', { method: 'POST', body: form })
        if (!/^[A-Za-z0-9_-]{1,128}$/.test(job.job_id || '')) throw new Error('Sarvam did not return a valid receipt job.')
        return reply(202, { ticket: ticketFor(job.job_id, user.id, key, now()), status: 'pending' })
      }
      let jobId
      try { jobId = readTicket(body.ticket, user.id, key, now()) } catch { return reply(403, { error: 'Receipt job expired or belongs to another account. Upload the receipt again.' }) }
      const job = await provider(`${jobId}/status`)
      if (['pending', 'running'].includes(job.status)) return reply(200, { status: job.status })
      if (job.status !== 'completed') return reply(422, { error: 'Sarvam could not read every page. Try a clearer receipt or enter details manually.' })
      const output = await provider(`${jobId}/results`)
      return reply(200, { status: 'completed', fields: receiptFields(output.result) })
    } catch (error) { return reply(error.status || 502, { error: error.name === 'TimeoutError' ? 'Sarvam timed out. Try again shortly.' : error.status ? error.message : 'Receipt extraction failed. Try a clearer receipt or enter details manually.' }) }
  }
}
