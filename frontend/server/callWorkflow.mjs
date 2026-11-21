import { createClient } from '@supabase/supabase-js'

const localeNames = { Telugu: 'te-IN', English: 'en-IN', Tamil: 'ta-IN', Hindi: 'hi-IN', Kannada: 'kn-IN', Malayalam: 'ml-IN', Marathi: 'mr-IN', Bengali: 'bn-IN', Gujarati: 'gu-IN', Punjabi: 'pa-IN', Odia: 'od-IN', Assamese: 'as-IN' }

export function workflowPayload(customer, requestId, now = new Date()) {
  const phone = String(customer.phone_number || '').replace(/[\s()-]/g, '').replace(/^(\+91|91)(?=\d{10}$)/, '')
  if (!/^[6-9]\d{9}$/.test(phone)) throw new Error('This borrower needs a valid Indian mobile number before calling.')
  const language = Object.entries(localeNames).find(([name, code]) => name.toLowerCase() === String(customer.language).toLowerCase() || code.toLowerCase() === String(customer.language).toLowerCase())
  if (!language) throw new Error('Select a supported calling language for this borrower.')
  const due = customer.due_date
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due || '') || !Number.isFinite(Date.parse(due)) || new Date(due).toISOString().slice(0, 10) !== due) throw new Error('This borrower needs a valid due date before calling.')
  const outstanding = Number(customer.outstanding_amount)
  if (!Number.isFinite(outstanding) || outstanding <= 0) throw new Error('This borrower has no valid outstanding balance to collect.')
  const today = new Date(now.getTime() + 330 * 60_000).toISOString().slice(0, 10)
  const installment = `emi-${customer.customer_id}-${due}`
  return { data: {
    event: 'start_collection_call', request_id: requestId, customer_id: customer.customer_id,
    name: customer.name, borrower_name: customer.name, phone_number: phone, phone: `+91${phone}`,
    email: customer.email || '', language: language[1], preferred_language: language[0],
    lending_date: customer.lending_date, due_date: due,
    outstanding_amount: outstanding, principal_amount: Number(customer.principal_amount), interest_rate: Number(customer.interest_rate),
    amount_due: outstanding, currency: 'INR', days_past_due: Math.max(0, Math.round((Date.parse(today) - Date.parse(due)) / 86_400_000)),
    installment_id: installment, link_id: installment,
  } }
}

export function createCallHandler(config, dependencies = {}) {
  const clientFactory = dependencies.createClient || createClient
  const send = dependencies.fetch || fetch
  return async (req, res) => {
    const reply = (status, body) => { res.statusCode = status; res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store'); res.end(JSON.stringify(body)) }
    if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return reply(405, { error: 'Use POST.' }) }
    const authorization = req.headers.authorization || ''
    if (!/^Bearer \S+$/.test(authorization)) return reply(401, { error: 'Sign in to start a call.' })
    const missing = []
    if (!config.CALL_WORKFLOW_URL?.trim()) missing.push('CALL_WORKFLOW_URL')
    if (!(config.SUPABASE_URL || config.VITE_SUPABASE_URL)?.trim()) missing.push('SUPABASE_URL')
    if (!(config.SUPABASE_PUBLISHABLE_KEY || config.VITE_SUPABASE_ANON_KEY)?.trim()) missing.push('SUPABASE_PUBLISHABLE_KEY')
    if (missing.length) return reply(503, { error: `Calling is not configured. Missing server settings: ${missing.join(', ')}. Update the .env file in the app folder you are running.` })
    try {
      const url = new URL(config.CALL_WORKFLOW_URL)
      if (url.protocol !== 'https:' || url.username || url.password) return reply(503, { error: 'CALL_WORKFLOW_URL must be a valid HTTPS webhook URL.' })
    } catch { return reply(503, { error: 'CALL_WORKFLOW_URL must be a valid HTTPS webhook URL.' }) }
    let body = req.body
    if (body === undefined) {
      let text = ''
      for await (const chunk of req) { text += chunk; if (Buffer.byteLength(text) > 4096) return reply(413, { error: 'Request too large.' }) }
      body = text
    }
    try { if (typeof body === 'string') body = JSON.parse(body) } catch { return reply(400, { error: 'Invalid JSON request.' }) }
    if (!body || !Number.isSafeInteger(body.customer_id) || body.customer_id <= 0 || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.request_id || '')) return reply(400, { error: 'A borrower ID and valid request ID are required.' })
    let payload
    try {
      const client = clientFactory(config.SUPABASE_URL || config.VITE_SUPABASE_URL, config.SUPABASE_PUBLISHABLE_KEY || config.VITE_SUPABASE_ANON_KEY, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false } })
      const { data: auth, error: authError } = await client.auth.getUser(authorization.slice(7))
      if (authError || !auth?.user) return reply(401, { error: 'Your session expired. Sign in again.' })
      const { data: customer, error } = await client.from('customers').select('*').eq('customer_id', body.customer_id).eq('user_id', auth.user.id).maybeSingle()
      if (error) return reply(502, { error: 'Could not load the borrower. Retry after checking your database connection.' })
      if (!customer || customer.user_id !== auth.user.id) return reply(404, { error: 'Borrower not found in your account.' })
      try { payload = workflowPayload(customer, body.request_id) } catch (error) { return reply(422, { error: error.message }) }
    } catch { return reply(502, { error: 'Could not verify your session or borrower details.' }) }
    try {
      const headers = { 'Content-Type': 'application/json' }
      if (config.CALL_WORKFLOW_TOKEN) headers.Authorization = `Bearer ${config.CALL_WORKFLOW_TOKEN}`
      const response = await send(config.CALL_WORKFLOW_URL, { method: 'POST', headers, body: JSON.stringify(payload), redirect: 'error', signal: AbortSignal.timeout(15_000) })
      if (!response.ok) return reply(502, { error: `Workflow returned HTTP ${response.status}. Check the workflow logs before retrying.`, request_id: body.request_id })
      return reply(202, { status: 'accepted', request_id: body.request_id, message: 'Call workflow accepted. Check call logs for connection status.' })
    } catch { return reply(504, { error: 'Workflow response unavailable. The call may have started; check workflow logs before retrying.', request_id: body.request_id }) }
  }
}
