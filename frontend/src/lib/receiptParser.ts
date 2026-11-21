import { getSupabaseClient } from './supabaseClient'

export type ReceiptFields = Partial<Record<'name' | 'phone_number' | 'email' | 'language' | 'lending_date' | 'due_date' | 'principal_amount' | 'outstanding_amount' | 'interest_rate', string | number>>
export async function parseReceipt(file: File, signal: AbortSignal): Promise<ReceiptFields> {
  const client = getSupabaseClient()
  const session = client && await client.auth.getSession()
  if (!session || session.error || !session.data.session) throw new Error('Sign in before parsing a receipt.')
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1])
    reader.onerror = () => reject(new Error('Could not read this receipt.'))
    reader.readAsDataURL(file)
  })
  const request = async (body: object) => {
    const response = await fetch('/api/parse-receipt', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.data.session!.access_token}` }, body: JSON.stringify(body), signal })
    const result = await response.json().catch(() => null)
    if (!response.ok) throw new Error(result?.error || 'Receipt parsing is unavailable. Please try again.')
    return result
  }
  const submitted = await request({ action: 'submit', mime: file.type, base64 })
  if (!submitted?.ticket) throw new Error('Receipt parser did not return a job reference.')
  const deadline = Date.now() + 180_000
  while (Date.now() < deadline) {
    await new Promise<void>((resolve, reject) => {
      if (signal.aborted) { reject(new DOMException('Cancelled', 'AbortError')); return }
      const cancel = () => { clearTimeout(timer); reject(new DOMException('Cancelled', 'AbortError')) }
      const timer = setTimeout(() => { signal.removeEventListener('abort', cancel); resolve() }, 2000)
      signal.addEventListener('abort', cancel, { once: true })
    })
    const result = await request({ action: 'status', ticket: submitted.ticket })
    if (result.status === 'completed') return result.fields
    if (!['pending', 'running'].includes(result.status)) throw new Error('Unexpected receipt parsing status.')
  }
  throw new Error('Receipt parsing is taking too long. Try a smaller receipt or enter details manually.')
}
