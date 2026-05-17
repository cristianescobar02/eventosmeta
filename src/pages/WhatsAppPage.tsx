import { useEffect, useState, useRef, useCallback } from 'react'
import {
  MessageCircle, RefreshCw, UserCheck, UserX, CheckCircle, XCircle,
  Send, Mail, Phone, Clock, Image, User, AlertCircle,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { WaConversation, WaMessage, WaState } from '../types/whatsapp'
import { STATE_LABELS, STATE_COLORS } from '../types/whatsapp'

// ── helpers ──────────────────────────────────────────────────────────────────

function formatTime(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  if (diff < 60_000) return 'ahora'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`
  return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })
}

function displayName(conv: WaConversation) {
  return conv.wa_name ?? conv.phone
}

function StateBadge({ state }: { state: WaState }) {
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATE_COLORS[state]}`}>
      {STATE_LABELS[state]}
    </span>
  )
}

// ── API call to edge function ─────────────────────────────────────────────────

async function edgeAction(conversationId: number, action: string, text?: string) {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token

  const res = await fetch(`${supabaseUrl}/functions/v1/whatsapp-webhook/send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ conversation_id: conversationId, action, text }),
  })

  if (!res.ok) throw new Error(`Error ${res.status}`)
  return res.json()
}

// ── ConversationItem ──────────────────────────────────────────────────────────

function ConversationItem({
  conv, selected, onClick,
}: {
  conv: WaConversation
  selected: boolean
  onClick: () => void
}) {
  const isUrgent = conv.state === 'proof_received'
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors border-b border-gray-100
        ${selected ? 'bg-blue-50' : 'hover:bg-gray-50'}
        ${isUrgent ? 'border-l-4 border-l-orange-400' : ''}`}
    >
      <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-white text-sm font-bold
        ${conv.is_human_takeover ? 'bg-red-500' : isUrgent ? 'bg-orange-500' : 'bg-green-600'}`}>
        {displayName(conv).slice(0, 1).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-0.5">
          <span className="text-sm font-semibold text-gray-800 truncate">{displayName(conv)}</span>
          <span className="text-xs text-gray-400 shrink-0 ml-2">{formatTime(conv.updated_at)}</span>
        </div>
        <div className="flex items-center justify-between">
          <StateBadge state={conv.state} />
          {conv.is_human_takeover && (
            <span className="text-xs text-red-600 font-medium">Admin</span>
          )}
        </div>
        {conv.state === 'proof_received' && (
          <p className="text-xs text-orange-600 font-medium mt-0.5 flex items-center gap-1">
            <AlertCircle size={10} />Requiere validación
          </p>
        )}
      </div>
    </button>
  )
}

// ── MessageBubble ─────────────────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: WaMessage }) {
  const isOut = msg.direction === 'outbound'
  return (
    <div className={`flex ${isOut ? 'justify-end' : 'justify-start'} mb-2`}>
      <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm
        ${isOut
          ? 'bg-green-500 text-white rounded-br-sm'
          : 'bg-white text-gray-800 shadow-sm rounded-bl-sm border border-gray-100'}`}>
        {msg.msg_type === 'image' ? (
          <div className="flex items-center gap-2 text-xs opacity-80">
            <Image size={14} />
            <span>Imagen</span>
            {msg.media_url && (
              <a
                href={msg.media_url}
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                Ver
              </a>
            )}
          </div>
        ) : msg.msg_type === 'audio' ? (
          <div className="flex items-center gap-2 text-xs opacity-80">
            <span>🎵 Audio</span>
          </div>
        ) : (
          <p className="whitespace-pre-wrap">{msg.content}</p>
        )}
        <p className={`text-xs mt-1 ${isOut ? 'text-green-100' : 'text-gray-400'}`}>
          {formatTime(msg.created_at)}
        </p>
      </div>
    </div>
  )
}

// ── AdminActions ──────────────────────────────────────────────────────────────

function AdminActions({
  conv, onAction,
}: {
  conv: WaConversation
  onAction: (action: string, text?: string) => Promise<void>
}) {
  const [loading, setLoading] = useState<string | null>(null)
  const [rejectText, setRejectText] = useState('')
  const [showReject, setShowReject] = useState(false)

  async function handle(action: string, text?: string) {
    setLoading(action)
    try {
      await onAction(action, text)
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="bg-gray-50 border-t border-gray-200 p-3 space-y-2">
      <div className="flex flex-wrap gap-2">
        {/* Toggle takeover */}
        <button
          onClick={() => handle('toggle_takeover')}
          disabled={loading !== null}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50
            ${conv.is_human_takeover
              ? 'bg-green-100 text-green-700 hover:bg-green-200'
              : 'bg-red-100 text-red-700 hover:bg-red-200'}`}
        >
          {conv.is_human_takeover ? <UserCheck size={13} /> : <UserX size={13} />}
          {conv.is_human_takeover ? 'Liberar IA' : 'Tomar control'}
        </button>

        {/* Validate payment */}
        {conv.state === 'proof_received' && (
          <button
            onClick={() => handle('validate_payment')}
            disabled={loading !== null}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-green-600 text-white hover:bg-green-700 transition-colors disabled:opacity-50"
          >
            <CheckCircle size={13} />
            {loading === 'validate_payment' ? 'Validando...' : 'Validar pago'}
          </button>
        )}

        {/* Reject payment */}
        {(conv.state === 'proof_received') && (
          <button
            onClick={() => setShowReject(v => !v)}
            disabled={loading !== null}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-100 text-red-700 hover:bg-red-200 transition-colors disabled:opacity-50"
          >
            <XCircle size={13} />Rechazar pago
          </button>
        )}

        {/* Mark completed */}
        {conv.state === 'email_received' && (
          <button
            onClick={() => handle('mark_completed')}
            disabled={loading !== null}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition-colors disabled:opacity-50"
          >
            <CheckCircle size={13} />
            {loading === 'mark_completed' ? 'Marcando...' : 'Marcar enviada'}
          </button>
        )}
      </div>

      {/* Customer info pills */}
      <div className="flex flex-wrap gap-2">
        {conv.customer_email && (
          <div className="flex items-center gap-1 text-xs text-gray-500 bg-white border border-gray-200 rounded-full px-2.5 py-1">
            <Mail size={11} />
            <span className="font-medium">{conv.customer_email}</span>
          </div>
        )}
        {conv.payment_method && (
          <div className="flex items-center gap-1 text-xs text-gray-500 bg-white border border-gray-200 rounded-full px-2.5 py-1">
            <span className="font-medium capitalize">{conv.payment_method}</span>
          </div>
        )}
        <div className="flex items-center gap-1 text-xs text-gray-500 bg-white border border-gray-200 rounded-full px-2.5 py-1">
          <Phone size={11} />
          <span>{conv.phone}</span>
        </div>
      </div>

      {/* Reject text input */}
      {showReject && (
        <div className="flex gap-2">
          <input
            type="text"
            value={rejectText}
            onChange={e => setRejectText(e.target.value)}
            placeholder="Motivo del rechazo (opcional)"
            className="flex-1 text-xs border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-red-300"
          />
          <button
            onClick={() => {
              handle('reject_payment', rejectText || undefined)
              setShowReject(false)
              setRejectText('')
            }}
            className="px-3 py-1.5 bg-red-600 text-white text-xs rounded-lg hover:bg-red-700 transition-colors"
          >
            Enviar
          </button>
        </div>
      )}
    </div>
  )
}

// ── SendMessage ───────────────────────────────────────────────────────────────

function SendMessage({
  conv, onSend,
}: {
  conv: WaConversation
  onSend: (text: string) => Promise<void>
}) {
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)

  async function handleSend() {
    if (!text.trim() || sending) return
    setSending(true)
    try {
      await onSend(text.trim())
      setText('')
    } finally {
      setSending(false)
    }
  }

  if (!conv.is_human_takeover) {
    return (
      <div className="bg-yellow-50 border-t border-yellow-200 p-3 text-center text-xs text-yellow-700">
        Activa "Tomar control" para enviar mensajes manualmente
      </div>
    )
  }

  return (
    <div className="bg-white border-t border-gray-200 p-3 flex gap-2">
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
        placeholder="Escribe un mensaje..."
        rows={1}
        className="flex-1 text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-300 resize-none"
      />
      <button
        onClick={handleSend}
        disabled={!text.trim() || sending}
        className="p-2.5 bg-green-600 text-white rounded-xl hover:bg-green-700 transition-colors disabled:opacity-40"
      >
        <Send size={16} />
      </button>
    </div>
  )
}

// ── ConversationDetail ────────────────────────────────────────────────────────

function ConversationDetail({
  conv, messages, onAction, onSend,
}: {
  conv: WaConversation
  messages: WaMessage[]
  onAction: (action: string, text?: string) => Promise<void>
  onSend: (text: string) => Promise<void>
}) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3 shrink-0">
        <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0
          ${conv.is_human_takeover ? 'bg-red-500' : 'bg-green-600'}`}>
          {displayName(conv).slice(0, 1).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-gray-800 text-sm truncate">{displayName(conv)}</p>
            <StateBadge state={conv.state} />
          </div>
          <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-400">
            <span className="flex items-center gap-1"><Phone size={10} />{conv.phone}</span>
            <span className="flex items-center gap-1"><Clock size={10} />{formatTime(conv.updated_at)}</span>
            {conv.customer_email && (
              <span className="flex items-center gap-1"><Mail size={10} />{conv.customer_email}</span>
            )}
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 bg-[#efeae2]">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <MessageCircle size={32} className="mb-2 opacity-40" />
            <p className="text-sm">Sin mensajes aún</p>
          </div>
        ) : (
          <>
            {messages.map(m => <MessageBubble key={m.id} msg={m} />)}
            <div ref={bottomRef} />
          </>
        )}
      </div>

      {/* Admin actions */}
      <AdminActions conv={conv} onAction={onAction} />

      {/* Send message */}
      <SendMessage conv={conv} onSend={onSend} />
    </div>
  )
}

// ── WhatsAppPage ──────────────────────────────────────────────────────────────

export default function WhatsAppPage() {
  const [conversations, setConversations] = useState<WaConversation[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [messages, setMessages] = useState<WaMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<string | null>(null)

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }, [])

  const selected = conversations.find(c => c.id === selectedId) ?? null

  // ── Load conversations ──────────────────────────────────────────────────────
  async function loadConversations() {
    const { data } = await supabase
      .from('wa_conversations')
      .select('*')
      .order('updated_at', { ascending: false })
    setConversations((data ?? []) as WaConversation[])
    setLoading(false)
  }

  // ── Load messages for selected conversation ─────────────────────────────────
  async function loadMessages(convId: number) {
    const { data } = await supabase
      .from('wa_messages')
      .select('*')
      .eq('conversation_id', convId)
      .order('created_at', { ascending: true })
    setMessages((data ?? []) as WaMessage[])
  }

  useEffect(() => {
    loadConversations()

    // Realtime: conversations list
    const convChannel = supabase
      .channel('wa_conversations_all')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wa_conversations' }, () => {
        loadConversations()
      })
      .subscribe()

    return () => { supabase.removeChannel(convChannel) }
  }, [])

  // Subscribe to messages for selected conversation
  useEffect(() => {
    if (!selectedId) { setMessages([]); return }
    loadMessages(selectedId)

    const msgChannel = supabase
      .channel(`wa_messages_${selectedId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'wa_messages',
        filter: `conversation_id=eq.${selectedId}`,
      }, (payload) => {
        setMessages(prev => [...prev, payload.new as WaMessage])
      })
      .subscribe()

    return () => { supabase.removeChannel(msgChannel) }
  }, [selectedId])

  // ── Admin action ────────────────────────────────────────────────────────────
  async function handleAction(action: string, text?: string) {
    if (!selectedId) return
    try {
      await edgeAction(selectedId, action, text)
      showToast('Acción ejecutada correctamente')
    } catch (e) {
      showToast('Error ejecutando la acción')
      console.error(e)
    }
  }

  async function handleSend(text: string) {
    if (!selectedId) return
    try {
      await edgeAction(selectedId, 'send_message', text)
    } catch (e) {
      showToast('Error enviando el mensaje')
      console.error(e)
    }
  }

  // ── Stats ───────────────────────────────────────────────────────────────────
  const stats = {
    total:       conversations.length,
    needsReview: conversations.filter(c => c.state === 'proof_received').length,
    takeover:    conversations.filter(c => c.is_human_takeover).length,
    completed:   conversations.filter(c => c.state === 'completed').length,
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-6 h-6 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="flex h-full relative">
      {/* Toast */}
      {toast && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white text-xs px-4 py-2 rounded-full shadow-lg">
          {toast}
        </div>
      )}

      {/* Left panel: conversation list */}
      <div className="w-80 shrink-0 border-r border-gray-200 bg-white flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageCircle size={18} className="text-green-600" />
            <h2 className="font-semibold text-gray-800 text-sm">WhatsApp</h2>
          </div>
          <button
            onClick={loadConversations}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <RefreshCw size={14} />
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-0 border-b border-gray-100">
          {[
            { label: 'Total', value: stats.total, color: 'text-gray-700' },
            { label: 'Pago', value: stats.needsReview, color: 'text-orange-600' },
            { label: 'Admin', value: stats.takeover, color: 'text-red-600' },
            { label: 'Listos', value: stats.completed, color: 'text-green-600' },
          ].map(s => (
            <div key={s.label} className="flex flex-col items-center py-2 border-r last:border-r-0 border-gray-100">
              <span className={`text-lg font-bold ${s.color}`}>{s.value}</span>
              <span className="text-xs text-gray-400">{s.label}</span>
            </div>
          ))}
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400 p-6 text-center">
              <User size={32} className="mb-2 opacity-40" />
              <p className="text-sm font-medium">Sin conversaciones</p>
              <p className="text-xs mt-1">Los clientes aparecerán aquí cuando escriban por WhatsApp</p>
            </div>
          ) : (
            conversations.map(conv => (
              <ConversationItem
                key={conv.id}
                conv={conv}
                selected={selectedId === conv.id}
                onClick={() => setSelectedId(conv.id)}
              />
            ))
          )}
        </div>
      </div>

      {/* Right panel: conversation detail */}
      <div className="flex-1 overflow-hidden">
        {selected ? (
          <ConversationDetail
            conv={selected}
            messages={messages}
            onAction={handleAction}
            onSend={handleSend}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-3">
            <MessageCircle size={48} className="opacity-30" />
            <p className="text-sm font-medium">Selecciona una conversación</p>
            <p className="text-xs">para ver los mensajes e intervenir</p>
          </div>
        )}
      </div>
    </div>
  )
}
