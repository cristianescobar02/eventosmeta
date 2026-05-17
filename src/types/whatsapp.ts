export type WaState =
  | 'new'
  | 'info_sent'
  | 'payment_pending'
  | 'proof_received'
  | 'proof_validated'
  | 'email_received'
  | 'completed'
  | 'human_takeover'

export interface WaConversation {
  id: number
  phone: string
  wa_name: string | null
  state: WaState
  payment_method: string | null
  proof_url: string | null
  customer_email: string | null
  is_human_takeover: boolean
  created_at: string
  updated_at: string
}

export interface WaMessage {
  id: number
  conversation_id: number
  direction: 'inbound' | 'outbound'
  msg_type: string
  content: string | null
  media_url: string | null
  wa_msg_id: string | null
  created_at: string
}

export const STATE_LABELS: Record<WaState, string> = {
  new:              'Nuevo',
  info_sent:        'Info enviada',
  payment_pending:  'Esperando pago',
  proof_received:   'Comprobante recibido',
  proof_validated:  'Pago validado',
  email_received:   'Email recibido',
  completed:        'Completado',
  human_takeover:   'Admin activo',
}

export const STATE_COLORS: Record<WaState, string> = {
  new:              'bg-gray-100 text-gray-700',
  info_sent:        'bg-blue-100 text-blue-700',
  payment_pending:  'bg-yellow-100 text-yellow-700',
  proof_received:   'bg-orange-100 text-orange-700',
  proof_validated:  'bg-purple-100 text-purple-700',
  email_received:   'bg-green-100 text-green-700',
  completed:        'bg-emerald-100 text-emerald-700',
  human_takeover:   'bg-red-100 text-red-700',
}
