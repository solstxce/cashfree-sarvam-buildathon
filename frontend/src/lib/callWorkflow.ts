import { getSupabaseClient } from './supabaseClient'

export async function startCollectionCall(customerId: number, requestId: string) {
  const client = getSupabaseClient()
  if (!client) throw new Error('Connect your Supabase account before starting a call.')
  const { data, error } = await client.auth.getSession()
  if (error || !data.session) throw new Error('Sign in again before starting a call.')
  const response = await fetch('/api/start-call', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session.access_token}` },
    body: JSON.stringify({ customer_id: customerId, request_id: requestId }),
  })
  const result = await response.json().catch(() => null)
  if (!response.ok) throw new Error(result?.error || 'Could not start the call. Check the workflow logs before retrying.')
  return result as { status: string; request_id: string; message: string }
}
