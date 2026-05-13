import { useState } from 'react'
import { Check, Zap, Crown, Gift } from 'lucide-react'
import { PLANS, canExport, canUseMaterials } from '../lib/supabase'
import type { PlanType } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { buildReference, openWompiCheckout } from '../lib/wompi'
import { supabase } from '../lib/supabase'
import { formatCOP } from '../utils/format'

const PLAN_ICONS = {
  free:  Gift,
  basic: Zap,
  pro:   Crown,
}

const PLAN_COLORS = {
  free:  'border-gray-200 bg-white',
  basic: 'border-blue-500 bg-blue-50',
  pro:   'border-indigo-500 bg-indigo-50',
}

const PLAN_BTN = {
  free:  'bg-gray-600 hover:bg-gray-700',
  basic: 'bg-blue-600 hover:bg-blue-700',
  pro:   'bg-indigo-600 hover:bg-indigo-700',
}

export default function PricingPage() {
  const { user, profile, refreshProfile } = useAuth()
  const [loading, setLoading] = useState<PlanType | null>(null)

  async function handleSubscribe(planId: PlanType) {
    if (!user || !profile) return
    if (planId === 'free') return
    if (profile.plan === planId) return

    setLoading(planId)
    try {
      const plan = PLANS[planId]
      const reference = buildReference(user.id, planId)

      // Registrar intento de pago
      await supabase.from('subscriptions_log').insert({
        user_id: user.id,
        plan: planId,
        amount_cop: plan.price,
        wompi_reference: reference,
        status: 'pending',
      })

      // Abrir Wompi checkout
      await openWompiCheckout({
        amountCOP: plan.price,
        reference,
        customerEmail: profile.email,
        description: `Plan ${plan.name} · PresupuestosObra`,
        redirectUrl: `${window.location.origin}?payment=success&plan=${planId}`,
      })

      // Refrescar perfil (el webhook de Wompi actualizará el plan automáticamente)
      setTimeout(() => refreshProfile(), 3000)
    } catch (err) {
      console.error('Error al iniciar pago:', err)
    }
    setLoading(null)
  }

  const currentPlan = profile?.plan ?? 'free'

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-gray-800">Planes y precios</h2>
        <p className="text-gray-500 text-sm mt-2">
          Elige el plan que se adapte a tus proyectos · Precios en COP
        </p>
        {currentPlan !== 'free' && profile?.plan_expires_at && (
          <p className="text-xs text-blue-600 mt-2">
            Tu plan <strong>{PLANS[currentPlan].name}</strong> está activo hasta{' '}
            {new Date(profile.plan_expires_at).toLocaleDateString('es-CO')}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {(Object.values(PLANS) as typeof PLANS[PlanType][]).map((plan) => {
          const Icon = PLAN_ICONS[plan.id]
          const isCurrent = currentPlan === plan.id
          const isUpgrade = plan.price > PLANS[currentPlan].price
          const isPopular = plan.id === 'basic'

          return (
            <div
              key={plan.id}
              className={`relative rounded-2xl border-2 p-6 ${PLAN_COLORS[plan.id]} transition-shadow hover:shadow-lg`}
            >
              {isPopular && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-blue-600 text-white text-xs font-bold rounded-full">
                  MÁS POPULAR
                </span>
              )}

              <div className="flex items-center gap-3 mb-4">
                <div className={`p-2 rounded-xl ${plan.id === 'free' ? 'bg-gray-100' : plan.id === 'basic' ? 'bg-blue-100' : 'bg-indigo-100'}`}>
                  <Icon size={20} className={plan.id === 'free' ? 'text-gray-600' : plan.id === 'basic' ? 'text-blue-600' : 'text-indigo-600'} />
                </div>
                <div>
                  <p className="font-bold text-gray-800">{plan.name}</p>
                  <p className="text-xs text-gray-500">
                    {plan.price === 0 ? 'Para siempre gratis' : 'Por mes'}
                  </p>
                </div>
              </div>

              <div className="mb-6">
                {plan.price === 0 ? (
                  <p className="text-3xl font-black text-gray-800">$0</p>
                ) : (
                  <p className="text-3xl font-black text-gray-800">
                    {formatCOP(plan.price)}
                    <span className="text-sm font-normal text-gray-500">/mes</span>
                  </p>
                )}
              </div>

              <ul className="space-y-2 mb-6">
                {plan.features.map(f => (
                  <li key={f} className="flex items-start gap-2 text-sm text-gray-700">
                    <Check size={15} className="text-green-500 shrink-0 mt-0.5" />
                    {f}
                  </li>
                ))}
              </ul>

              {isCurrent ? (
                <button disabled className="w-full py-2.5 rounded-xl text-sm font-semibold bg-gray-200 text-gray-500 cursor-default">
                  Plan actual
                </button>
              ) : plan.id === 'free' ? (
                <button disabled className="w-full py-2.5 rounded-xl text-sm font-semibold bg-gray-100 text-gray-400 cursor-default">
                  Plan gratuito
                </button>
              ) : (
                <button
                  onClick={() => handleSubscribe(plan.id)}
                  disabled={loading === plan.id}
                  className={`w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-colors ${PLAN_BTN[plan.id]} disabled:opacity-60`}
                >
                  {loading === plan.id
                    ? 'Abriendo pago...'
                    : isUpgrade ? `Actualizar a ${plan.name}` : `Cambiar a ${plan.name}`}
                </button>
              )}
            </div>
          )
        })}
      </div>

      {/* Comparación de funciones */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-800">¿Qué incluye cada plan?</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50">
                <th className="text-left px-5 py-3 text-gray-500 font-medium">Función</th>
                <th className="text-center px-4 py-3 text-gray-600 font-semibold">Gratis</th>
                <th className="text-center px-4 py-3 text-blue-700 font-semibold">Básico</th>
                <th className="text-center px-4 py-3 text-indigo-700 font-semibold">Pro</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {[
                { label: 'Catálogo de actividades y APU', free: true, basic: true, pro: true },
                { label: 'Búsqueda y filtro avanzado', free: true, basic: true, pro: true },
                { label: 'Crear proyectos', free: '1', basic: '∞', pro: '∞' },
                { label: 'Presupuestos por proyecto', free: '1', basic: '∞', pro: '∞' },
                { label: 'Ajustar precios unitarios / AIU', free: false, basic: true, pro: true },
                { label: 'Exportar a PDF', free: false, basic: true, pro: true },
                { label: 'Exportar a Excel', free: false, basic: true, pro: true },
                { label: 'Base de datos de materiales', free: false, basic: false, pro: true },
                { label: 'APU Auxiliares', free: false, basic: false, pro: true },
                { label: 'Base de precios mano de obra', free: false, basic: false, pro: true },
                { label: 'Soporte por WhatsApp', free: false, basic: true, pro: true },
                { label: 'Soporte prioritario', free: false, basic: false, pro: true },
              ].map(row => (
                <tr key={row.label} className="hover:bg-gray-50">
                  <td className="px-5 py-3 text-gray-700">{row.label}</td>
                  <td className="px-4 py-3 text-center">{renderCell(row.free)}</td>
                  <td className="px-4 py-3 text-center">{renderCell(row.basic)}</td>
                  <td className="px-4 py-3 text-center">{renderCell(row.pro)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Medios de pago */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-center">
        <p className="text-sm font-semibold text-blue-800 mb-2">Medios de pago disponibles</p>
        <p className="text-xs text-blue-600">
          Tarjetas Visa · Mastercard · American Express · PSE · Nequi · Daviplata · Efecty
        </p>
        <p className="text-xs text-blue-400 mt-1">Procesado por <strong>Wompi (Bancolombia)</strong> · Transacciones 100% seguras</p>
      </div>

      <div className="text-center text-xs text-gray-400 space-y-1">
        <p>¿Tienes preguntas? Escríbenos por WhatsApp.</p>
        <p>Los planes se renuevan mensualmente. Puedes cancelar en cualquier momento.</p>
      </div>
    </div>
  )
}

function renderCell(value: boolean | string) {
  if (value === true)  return <Check size={16} className="text-green-500 mx-auto" />
  if (value === false) return <span className="text-gray-300 text-lg">—</span>
  return <span className="text-gray-700 font-semibold">{value}</span>
}

void canExport
void canUseMaterials
