// ─────────────────────────────────────────────────────────────────────────────
// WhatsApp AI Sales Agent – Supabase Edge Function
// Despliega con: supabase functions deploy whatsapp-webhook
//
// Variables de entorno requeridas (Supabase Dashboard → Settings → Edge Functions):
//   WHATSAPP_TOKEN         – Token de acceso de Meta (User Access Token)
//   WHATSAPP_PHONE_ID      – ID del número de teléfono en Meta Business
//   WHATSAPP_VERIFY_TOKEN  – Token personalizado para verificar el webhook
//   ANTHROPIC_API_KEY      – Clave API de Anthropic
//   SUPABASE_URL           – URL de Supabase (auto-disponible)
//   SUPABASE_SERVICE_ROLE_KEY – Clave de servicio (auto-disponible)
//
// Variables opcionales (datos del producto y pagos):
//   WA_PRODUCT_NAME    – Nombre del producto (ej: "Plantilla APU Colombia")
//   WA_PRODUCT_PRICE   – Precio (ej: "$89.000 COP")
//   WA_BUSINESS_NAME   – Nombre del negocio
//   WA_NEQUI_NUM       – Número Nequi
//   WA_NEQUI_NAME      – Titular Nequi
//   WA_DAVIPLATA_NUM   – Número Daviplata
//   WA_DAVIPLATA_NAME  – Titular Daviplata
//   WA_BANCOLOMBIA_ACC  – Cuenta Bancolombia
//   WA_BANCOLOMBIA_TYPE – Tipo (Ahorros/Corriente)
//   WA_BANCOLOMBIA_NAME – Titular Bancolombia
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ── Config ──────────────────────────────────────────────────────────────────
const WA_TOKEN        = Deno.env.get('WHATSAPP_TOKEN') ?? ''
const WA_PHONE_ID     = Deno.env.get('WHATSAPP_PHONE_ID') ?? ''
const WA_VERIFY_TOKEN = Deno.env.get('WHATSAPP_VERIFY_TOKEN') ?? ''
const ANTHROPIC_KEY   = Deno.env.get('ANTHROPIC_API_KEY') ?? ''
const SUPABASE_URL    = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SK     = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const PRODUCT_NAME    = Deno.env.get('WA_PRODUCT_NAME') ?? 'Plantilla APU Colombia'
const PRODUCT_PRICE   = Deno.env.get('WA_PRODUCT_PRICE') ?? '$89.000 COP'
const BUSINESS_NAME   = Deno.env.get('WA_BUSINESS_NAME') ?? 'PresupuestosObra'
const NEQUI_NUM       = Deno.env.get('WA_NEQUI_NUM') ?? ''
const NEQUI_NAME      = Deno.env.get('WA_NEQUI_NAME') ?? ''
const DAVIPLATA_NUM   = Deno.env.get('WA_DAVIPLATA_NUM') ?? ''
const DAVIPLATA_NAME  = Deno.env.get('WA_DAVIPLATA_NAME') ?? ''
const BANCO_ACC       = Deno.env.get('WA_BANCOLOMBIA_ACC') ?? ''
const BANCO_TYPE      = Deno.env.get('WA_BANCOLOMBIA_TYPE') ?? 'Ahorros'
const BANCO_NAME      = Deno.env.get('WA_BANCOLOMBIA_NAME') ?? ''

// ── CORS ────────────────────────────────────────────────────────────────────
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ── Types ────────────────────────────────────────────────────────────────────
interface WaConversation {
  id: number
  phone: string
  wa_name: string | null
  state: string
  payment_method: string | null
  proof_url: string | null
  customer_email: string | null
  is_human_takeover: boolean
}

interface WaMessage {
  id: number
  conversation_id: number
  direction: string
  msg_type: string
  content: string | null
  media_url: string | null
  created_at: string
}

interface ClaudeAction {
  messages: string[]
  new_state?: string
  data?: { payment_method?: string; email?: string }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function paymentMethodBlock(method: string): string {
  const m = method.toLowerCase()
  if (m.includes('nequi') && NEQUI_NUM) {
    return `📱 *Nequi*\nNúmero: ${NEQUI_NUM}\nNombre: ${NEQUI_NAME}\nValor: ${PRODUCT_PRICE}`
  }
  if (m.includes('daviplata') && DAVIPLATA_NUM) {
    return `📱 *Daviplata*\nNúmero: ${DAVIPLATA_NUM}\nNombre: ${DAVIPLATA_NAME}\nValor: ${PRODUCT_PRICE}`
  }
  if ((m.includes('bancolombia') || m.includes('transferencia')) && BANCO_ACC) {
    return `🏦 *Bancolombia*\nCuenta ${BANCO_TYPE}: ${BANCO_ACC}\nTitular: ${BANCO_NAME}\nValor: ${PRODUCT_PRICE}`
  }
  return ''
}

function detectPaymentMethod(text: string): string | null {
  const t = text.toLowerCase()
  if (t.includes('nequi')) return 'nequi'
  if (t.includes('daviplata')) return 'daviplata'
  if (t.includes('bancolombia') || t.includes('transferencia')) return 'bancolombia'
  return null
}

function extractEmail(text: string): string | null {
  const match = text.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/)
  return match ? match[0] : null
}

// ── WhatsApp API ─────────────────────────────────────────────────────────────

async function sendWAText(phone: string, text: string): Promise<string | null> {
  if (!WA_TOKEN || !WA_PHONE_ID) {
    console.warn('WhatsApp credentials not configured')
    return null
  }
  try {
    const res = await fetch(`https://graph.facebook.com/v20.0/${WA_PHONE_ID}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${WA_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: phone,
        type: 'text',
        text: { body: text, preview_url: false },
      }),
    })
    const data = await res.json() as { messages?: [{ id: string }] }
    return data?.messages?.[0]?.id ?? null
  } catch (e) {
    console.error('sendWAText error:', e)
    return null
  }
}

async function getMediaUrl(mediaId: string): Promise<string | null> {
  if (!WA_TOKEN) return null
  try {
    const res = await fetch(`https://graph.facebook.com/v20.0/${mediaId}`, {
      headers: { Authorization: `Bearer ${WA_TOKEN}` },
    })
    const data = await res.json() as { url?: string }
    return data?.url ?? null
  } catch {
    return null
  }
}

// ── Claude API ───────────────────────────────────────────────────────────────

function buildSystemPrompt(conv: WaConversation): string {
  const methods: string[] = []
  if (NEQUI_NUM) methods.push('Nequi')
  if (DAVIPLATA_NUM) methods.push('Daviplata')
  if (BANCO_ACC) methods.push('Bancolombia')
  const methodsList = methods.map((m, i) => `${i + 1}️⃣ ${m}`).join('\n')

  return `Eres el agente de ventas de WhatsApp de *${BUSINESS_NAME}*.

═══ PRODUCTO ═══
${PRODUCT_NAME}: Plantilla Excel para construcción en Colombia.
• Más de 2.300 actividades organizadas por capítulos
• Análisis de Precios Unitarios (APU) por actividad
• Precios actualizados de mano de obra colombiana
• Capítulos: preliminares, excavaciones, cimentación, estructura, mampostería, cubiertas, pisos, acabados, instalaciones eléctricas, hidráulicas, y más
• Para ingenieros, maestros de obra, contratistas, estudiantes
• Precio: *${PRODUCT_PRICE}*

Métodos de pago:
${methodsList}

═══ CLIENTE ═══
Estado: ${conv.state}
${conv.payment_method ? `Método escogido: ${conv.payment_method}` : ''}
${conv.customer_email ? `Correo: ${conv.customer_email}` : ''}
${conv.wa_name ? `Nombre WA: ${conv.wa_name}` : ''}

═══ INSTRUCCIONES POR ESTADO ═══
• new/info_sent → Saluda, presenta el producto con entusiasmo, muestra el precio y métodos de pago. Si ya enviaste la info, responde preguntas y anima a comprar.
• payment_pending → Recuerda amablemente que esperas el comprobante de pago como imagen.
• proof_validated → Pide el correo electrónico para enviar la plantilla.

═══ REGLAS CRÍTICAS ═══
1. NUNCA reveles precios de actividades específicas dentro de la plantilla. Si preguntan "¿cuánto cuesta X actividad?", di que ese dato está dentro de la plantilla.
2. Puedes decir cuántas actividades hay (2.300+), qué capítulos incluye y sus beneficios.
3. Si preguntan si pueden ver antes de comprar: "No tenemos demo disponible, pero garantizamos todo lo prometido o devolvemos el dinero."
4. Sé amable, conciso y cercano. Habla en español colombiano natural. No uses lenguaje excesivamente formal.
5. Máximo 3 mensajes por respuesta, cada uno conciso.

═══ FORMATO DE RESPUESTA ═══
Responde ÚNICAMENTE con este JSON (sin texto antes ni después):
{
  "messages": ["mensaje1", "mensaje2"],
  "new_state": "info_sent",
  "data": { "payment_method": "nequi", "email": "correo@gmail.com" }
}
• "messages": array de strings, máximo 3. Cada uno es un mensaje separado de WhatsApp.
• "new_state": solo si el estado cambia, omite si no.
• "data": solo si detectaste método de pago o correo, omite si no.`
}

async function callClaude(
  conv: WaConversation,
  history: WaMessage[],
  incomingText: string,
): Promise<ClaudeAction> {
  // Build conversation history
  const msgs: { role: 'user' | 'assistant'; content: string }[] = []
  let pendingAssistant = ''

  for (const m of history.slice(-20)) {
    if (m.direction === 'inbound') {
      if (pendingAssistant) {
        msgs.push({ role: 'assistant', content: pendingAssistant.trim() })
        pendingAssistant = ''
      }
      msgs.push({ role: 'user', content: m.content ?? '[media]' })
    } else {
      pendingAssistant += (pendingAssistant ? '\n\n' : '') + (m.content ?? '')
    }
  }
  if (pendingAssistant) msgs.push({ role: 'assistant', content: pendingAssistant.trim() })
  msgs.push({ role: 'user', content: incomingText })

  const systemPrompt = buildSystemPrompt(conv)

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-7',
      max_tokens: 1024,
      system: [
        {
          type: 'text',
          text: systemPrompt,
          cache_control: { type: 'ephemeral' }, // cache the stable system prompt
        },
      ],
      messages: msgs,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Claude API ${res.status}: ${err}`)
  }

  const data = await res.json() as { content: [{ type: string; text: string }] }
  const raw = data.content?.[0]?.text ?? ''

  try {
    return JSON.parse(raw) as ClaudeAction
  } catch {
    return { messages: [raw] }
  }
}

// ── DB Helpers ────────────────────────────────────────────────────────────────

async function saveOutbound(
  supabase: ReturnType<typeof createClient>,
  conversationId: number,
  text: string,
  msgId: string | null,
) {
  await supabase.from('wa_messages').insert({
    conversation_id: conversationId,
    direction: 'outbound',
    msg_type: 'text',
    content: text,
    wa_msg_id: msgId,
  })
}

async function sendAndSave(
  supabase: ReturnType<typeof createClient>,
  conv: WaConversation,
  text: string,
) {
  const msgId = await sendWAText(conv.phone, text)
  await saveOutbound(supabase, conv.id, text, msgId)
}

// ── Main Handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS })
  }

  const url = new URL(req.url)
  const supabase = createClient(SUPABASE_URL, SUPABASE_SK)

  // ── GET: webhook verification ───────────────────────────────────────────────
  if (req.method === 'GET') {
    const mode      = url.searchParams.get('hub.mode')
    const token     = url.searchParams.get('hub.verify_token')
    const challenge = url.searchParams.get('hub.challenge')

    if (mode === 'subscribe' && token === WA_VERIFY_TOKEN) {
      return new Response(challenge ?? '', { status: 200 })
    }
    return new Response('Forbidden', { status: 403 })
  }

  // ── POST /send: admin actions ───────────────────────────────────────────────
  if (req.method === 'POST' && url.pathname.includes('/send')) {
    // Verify admin JWT
    const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
    const { data: { user }, error: authErr } = await supabase.auth.getUser(jwt)
    if (authErr || !user) {
      return new Response('Unauthorized', { status: 401, headers: CORS })
    }
    const { data: profile } = await supabase
      .from('profiles').select('role').eq('id', user.id).single()
    if (profile?.role !== 'admin') {
      return new Response('Forbidden', { status: 403, headers: CORS })
    }

    const { conversation_id, action, text } = await req.json() as {
      conversation_id: number
      action: string
      text?: string
    }

    const { data: conv } = await supabase
      .from('wa_conversations').select('*').eq('id', conversation_id).single()
    if (!conv) {
      return new Response('Not found', { status: 404, headers: CORS })
    }

    const c = conv as WaConversation

    if (action === 'validate_payment') {
      await supabase.from('wa_conversations')
        .update({ state: 'proof_validated' }).eq('id', conversation_id)
      const msg = '¡Tu pago fue verificado exitosamente! ✅🎉\n\nPara enviarte la plantilla, por favor compártenos tu correo electrónico:'
      await sendAndSave(supabase, c, msg)
      return new Response(JSON.stringify({ ok: true }), { headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    if (action === 'reject_payment') {
      await supabase.from('wa_conversations')
        .update({ state: 'payment_pending', proof_url: null }).eq('id', conversation_id)
      const msg = text ?? 'Hola, hubo un inconveniente verificando tu pago. Por favor envíanos nuevamente el comprobante de forma clara y legible. 🙏'
      await sendAndSave(supabase, c, msg)
      return new Response(JSON.stringify({ ok: true }), { headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    if (action === 'toggle_takeover') {
      const newVal = !c.is_human_takeover
      await supabase.from('wa_conversations')
        .update({ is_human_takeover: newVal }).eq('id', conversation_id)
      return new Response(
        JSON.stringify({ ok: true, is_human_takeover: newVal }),
        { headers: { ...CORS, 'Content-Type': 'application/json' } },
      )
    }

    if (action === 'send_message' && text) {
      await sendAndSave(supabase, c, text)
      return new Response(JSON.stringify({ ok: true }), { headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    if (action === 'mark_completed') {
      await supabase.from('wa_conversations')
        .update({ state: 'completed' }).eq('id', conversation_id)
      return new Response(JSON.stringify({ ok: true }), { headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    return new Response('Unknown action', { status: 400, headers: CORS })
  }

  // ── POST: incoming WhatsApp message ─────────────────────────────────────────
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return new Response('OK', { status: 200 })
  }

  // Navigate WhatsApp payload
  const entry    = (body?.entry as unknown[])?.[0] as Record<string, unknown>
  const changes  = (entry?.changes as unknown[])?.[0] as Record<string, unknown>
  const value    = changes?.value as Record<string, unknown>
  const messages = value?.messages as unknown[]

  if (!messages?.length) return new Response('OK', { status: 200 })

  const rawMsg  = messages[0] as Record<string, unknown>
  const phone   = rawMsg?.from as string
  const msgType = rawMsg?.type as string
  const waId    = rawMsg?.id as string

  if (!phone || !msgType) return new Response('OK', { status: 200 })

  // Extract customer name
  const contacts = value?.contacts as unknown[]
  const contactProfile = (contacts?.[0] as Record<string, unknown>)?.profile as Record<string, unknown>
  const waName = (contactProfile?.name as string) ?? null

  // Get or create conversation
  let { data: conv } = await supabase
    .from('wa_conversations').select('*').eq('phone', phone).single()

  if (!conv) {
    const { data: newConv } = await supabase
      .from('wa_conversations').insert({ phone, wa_name: waName }).select().single()
    conv = newConv
  } else if (waName && !conv.wa_name) {
    await supabase.from('wa_conversations').update({ wa_name: waName }).eq('id', conv.id)
    conv.wa_name = waName
  }

  if (!conv) {
    console.error('Failed to get/create conversation')
    return new Response('OK', { status: 200 })
  }

  const c = conv as WaConversation

  // Extract message content
  let incomingText = ''
  let mediaUrl: string | null = null
  let isImage = false

  if (msgType === 'text') {
    incomingText = ((rawMsg?.text as Record<string, unknown>)?.body as string) ?? ''
  } else if (msgType === 'image' || msgType === 'document') {
    isImage = true
    const mediaData = rawMsg?.[msgType] as Record<string, unknown>
    const mediaId = mediaData?.id as string
    if (mediaId) mediaUrl = await getMediaUrl(mediaId)
    incomingText = '[imagen adjunta]'
  } else if (msgType === 'audio') {
    incomingText = '[audio enviado]'
  } else {
    incomingText = `[${msgType}]`
  }

  // Save incoming message
  await supabase.from('wa_messages').insert({
    conversation_id: c.id,
    direction: 'inbound',
    msg_type: msgType,
    content: incomingText,
    media_url: mediaUrl,
    wa_msg_id: waId,
  })

  // Human takeover → skip AI
  if (c.is_human_takeover) return new Response('OK', { status: 200 })

  // ── State machine ────────────────────────────────────────────────────────────

  // Image received in payment_pending → mark as proof_received
  if (isImage && c.state === 'payment_pending') {
    await supabase.from('wa_conversations')
      .update({ state: 'proof_received', proof_url: mediaUrl }).eq('id', c.id)
    c.state = 'proof_received'
    const msg = '¡Recibí tu comprobante de pago! ✅\n\nNuestro equipo lo está verificando. Te confirmamos en breve y te enviamos la plantilla.\n\n¡Gracias por tu paciencia! 🙏'
    await sendAndSave(supabase, c, msg)
    return new Response('OK', { status: 200 })
  }

  // Proof received → waiting for admin validation
  if (c.state === 'proof_received') {
    const msg = 'Tu comprobante ya fue recibido y está siendo verificado. Te avisamos pronto. 😊'
    await sendAndSave(supabase, c, msg)
    return new Response('OK', { status: 200 })
  }

  // Proof validated → capture email
  if (c.state === 'proof_validated') {
    const email = extractEmail(incomingText)
    if (email) {
      await supabase.from('wa_conversations')
        .update({ state: 'email_received', customer_email: email }).eq('id', c.id)
      const msg = `¡Perfecto! 🎉\n\nVamos a enviarte la plantilla al correo:\n📧 ${email}\n\nRevisa también tu carpeta de spam. Si en 10 minutos no la ves, escríbenos.\n\n¡Gracias por tu compra y bienvenido a *${BUSINESS_NAME}*! 🏗️`
      await sendAndSave(supabase, c, msg)
    } else {
      const msg = 'Por favor compártenos tu correo electrónico para enviarte la plantilla. Ejemplo: tucorreo@gmail.com 📧'
      await sendAndSave(supabase, c, msg)
    }
    return new Response('OK', { status: 200 })
  }

  // Completed → support
  if (c.state === 'completed') {
    const msg = '¡Hola! Si tienes alguna duda sobre la plantilla o necesitas ayuda, estamos aquí. 😊'
    await sendAndSave(supabase, c, msg)
    return new Response('OK', { status: 200 })
  }

  // Detect payment method (info_sent or new state)
  if (c.state === 'info_sent' || c.state === 'new') {
    const method = detectPaymentMethod(incomingText)
    if (method) {
      const details = paymentMethodBlock(method)
      if (details) {
        await supabase.from('wa_conversations')
          .update({ state: 'payment_pending', payment_method: method }).eq('id', c.id)
        await sendAndSave(supabase, c, `Perfecto, vas a pagar por *${method.charAt(0).toUpperCase() + method.slice(1)}* 👍`)
        await sendAndSave(supabase, c, details)
        await sendAndSave(supabase, c, 'Una vez realices la transferencia, envíame el comprobante de pago (pantallazo) como imagen. 📸')
        return new Response('OK', { status: 200 })
      }
    }
  }

  // ── Claude for everything else ───────────────────────────────────────────────
  if (!ANTHROPIC_KEY) {
    await sendAndSave(supabase, c, 'Gracias por escribirnos. En este momento estamos revisando tu mensaje. 😊')
    return new Response('OK', { status: 200 })
  }

  try {
    const { data: history } = await supabase
      .from('wa_messages')
      .select('*')
      .eq('conversation_id', c.id)
      .order('created_at', { ascending: true })
      .limit(30)

    const action = await callClaude(c, (history ?? []) as WaMessage[], incomingText)

    // Apply state change and data
    if (action.new_state && action.new_state !== c.state) {
      const updates: Record<string, string> = { state: action.new_state }
      if (action.data?.payment_method) updates.payment_method = action.data.payment_method
      if (action.data?.email) updates.customer_email = action.data.email
      await supabase.from('wa_conversations').update(updates).eq('id', c.id)
      c.state = action.new_state

      // If Claude detected a payment method, send payment details
      if (action.data?.payment_method && action.new_state === 'payment_pending') {
        const details = paymentMethodBlock(action.data.payment_method)
        if (details) {
          for (const msg of [...(action.messages ?? []), details]) {
            await sendAndSave(supabase, c, msg)
          }
          await sendAndSave(supabase, c, 'Una vez realices la transferencia, envíame el comprobante de pago (pantallazo) como imagen. 📸')
          return new Response('OK', { status: 200 })
        }
      }
    }

    for (const msg of action.messages ?? []) {
      await sendAndSave(supabase, c, msg)
    }
  } catch (err) {
    console.error('Claude error:', err)
    await sendAndSave(supabase, c, '¡Hola! Estamos teniendo un problema técnico momentáneo. Intenta de nuevo en un momento. 😊')
  }

  return new Response('OK', { status: 200 })
})
