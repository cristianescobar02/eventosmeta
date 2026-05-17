export interface Activity {
  id?: number
  code: string
  chapter: string
  description: string
  unit: string
  unitPrice: number
}

export interface APUItem {
  description: string
  unit: string
  quantity: number
  unitCost: number
  total: number
}

export interface APU {
  id?: number
  activityCode: string
  materials: APUItem[]
  labor: APUItem[]
  equipment: APUItem[]
  totalMaterials: number
  totalLabor: number
  totalEquipment: number
  totalDirect: number
}

export interface AuxAPU {
  id?: number
  code: string
  description: string
  unit: string
  items: APUItem[]
  total: number
}

export interface Project {
  id?: number
  user_id?: string
  name: string
  client: string
  location: string
  department: string
  date: string
  description: string
  created_at?: string
}

export interface BudgetItem {
  id: string
  activityCode: string
  chapter: string
  description: string
  unit: string
  quantity: number
  unitPrice: number
  adjustedUnitPrice: number
  total: number
}

export interface AIU {
  admin: number
  unforeseen: number
  utility: number
}

export interface Budget {
  id?: number
  projectId: number
  user_id?: string
  name: string
  items: BudgetItem[]
  aiu: AIU
  subtotal: number
  aiuAmount: number
  total: number
  createdAt: string
  updatedAt: string
}

export type NavPage =
  | 'dashboard'
  | 'activities'
  | 'projects'
  | 'import'
  | 'pricing'
  | 'materials'
  | 'admin'
  | 'whatsapp'
