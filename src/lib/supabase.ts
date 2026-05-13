import { createClient } from '@supabase/supabase-js'

const supabaseUrl  = import.meta.env.VITE_SUPABASE_URL  as string
const supabaseKey  = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!supabaseUrl || !supabaseKey) {
  console.warn('Supabase env vars not set. Check .env.local')
}

export const supabase = createClient(supabaseUrl ?? '', supabaseKey ?? '')

// ── Tipos de la base de datos ─────────────────────────────────

export type PlanType = 'free' | 'basic' | 'pro'
export type UserRole = 'admin' | 'client'

export interface Profile {
  id: string
  email: string
  full_name: string | null
  role: UserRole
  plan: PlanType
  plan_expires_at: string | null
  created_at: string
}

export const PLANS = {
  free: {
    id: 'free'  as PlanType,
    name: 'Gratis',
    price: 0,
    color: 'gray',
    features: [
      'Consultar catálogo de actividades y APU',
      '1 proyecto y 1 presupuesto',
      'Sin exportar PDF/Excel',
    ],
    limits: { projects: 1, budgets: 1 },
  },
  basic: {
    id: 'basic' as PlanType,
    name: 'Básico',
    price: 49900,
    color: 'blue',
    features: [
      'Proyectos y presupuestos ilimitados',
      'Exportar a PDF y Excel',
      'Catálogo completo de actividades y APU',
      'Soporte por WhatsApp',
    ],
    limits: { projects: Infinity, budgets: Infinity },
  },
  pro: {
    id: 'pro'   as PlanType,
    name: 'Pro',
    price: 89900,
    color: 'indigo',
    features: [
      'Todo lo del plan Básico',
      'Base de datos de materiales',
      'APU Auxiliares',
      'Mano de obra y precios actualizados',
      'Soporte prioritario',
    ],
    limits: { projects: Infinity, budgets: Infinity },
  },
} as const

export function canExport(plan: PlanType)         { return plan === 'basic' || plan === 'pro' }
export function canUseMaterials(plan: PlanType)    { return plan === 'pro' }
export function canUseAuxAPU(plan: PlanType)       { return plan === 'pro' }
export function canCreateProject(plan: PlanType, projectCount: number) {
  return plan !== 'free' || projectCount < 1
}
export function canCreateBudget(plan: PlanType, budgetCount: number) {
  return plan !== 'free' || budgetCount < 1
}
