// Supabase Edge Function: Wompi Webhook
// Despliega con: supabase functions deploy wompi-webhook
// URL del webhook en Wompi: https://<tu-proyecto>.supabase.co/functions/v1/wompi-webhook

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const WOMPI_EVENTS_SECRET = Deno.env.get('WOMPI_EVENTS_SECRET') ?? ''
const SUPABASE_URL        = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const PLAN_PRICES: Record<number, string> = {
  4990000:  'basic',  // $49.900 COP en centavos
  8990000:  'pro',    // $89.900 COP en centavos
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  try {
    const body = await req.json()

    // Verificar firma del evento de Wompi
    // Wompi envía: X-Wompi-Signature header con SHA256(checksum_key + event_type + transaction_id + status + amount_in_cents)
    const signature  = req.headers.get('X-Wompi-Signature') ?? ''
    const eventData  = body?.data?.transaction
    const properties = body?.signature?.properties ?? []
    const checksum   = body?.signature?.checksum ?? ''

    // Validación de firma (producción)
    if (WOMPI_EVENTS_SECRET) {
      const encoder = new TextEncoder()
      const dataToSign = properties
        .map((p: string) => p.split('.').reduce((o: Record<string, unknown>, k: string) => (o as Record<string, unknown>)[k] as Record<string, unknown>, body))
        .join('') + WOMPI_EVENTS_SECRET

      const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(dataToSign))
      const hashHex = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('')

      if (hashHex !== checksum && hashHex !== signature) {
        return new Response('Invalid signature', { status: 401 })
      }
    }

    // Solo procesar transacciones aprobadas
    if (body?.event !== 'transaction.updated') {
      return new Response('Event ignored', { status: 200 })
    }

    const tx = eventData
    if (!tx || tx.status !== 'APPROVED') {
      return new Response('Transaction not approved', { status: 200 })
    }

    const reference: string = tx.reference ?? ''
    const amountCents: number = tx.amount_in_cents ?? 0

    // Detectar plan por el monto o por la referencia
    let plan: string | undefined = PLAN_PRICES[amountCents]
    if (!plan) {
      if (reference.includes('BASIC')) plan = 'basic'
      else if (reference.includes('PRO')) plan = 'pro'
    }

    if (!plan) {
      return new Response('Plan not identified', { status: 200 })
    }

    // Inicializar cliente Supabase con rol de servicio
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    // Buscar el log de suscripción por referencia
    const { data: log } = await supabase
      .from('subscriptions_log')
      .select('user_id, plan')
      .eq('wompi_reference', reference)
      .single()

    if (!log?.user_id) {
      return new Response('User not found for reference', { status: 200 })
    }

    // Calcular fecha de expiración: +30 días
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 30)

    // Actualizar plan del usuario
    await supabase
      .from('profiles')
      .update({
        plan,
        plan_expires_at: expiresAt.toISOString(),
        wompi_reference: reference,
        updated_at: new Date().toISOString(),
      })
      .eq('id', log.user_id)

    // Actualizar estado del log
    await supabase
      .from('subscriptions_log')
      .update({ status: 'approved', wompi_tx_id: tx.id })
      .eq('wompi_reference', reference)

    console.log(`Plan ${plan} activado para usuario ${log.user_id}`)
    return new Response(JSON.stringify({ ok: true, plan, user_id: log.user_id }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (err) {
    console.error('Webhook error:', err)
    return new Response('Internal error', { status: 500 })
  }
})
