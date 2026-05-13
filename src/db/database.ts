import Dexie, { type Table } from 'dexie'
import type { Activity, APU, AuxAPU, Project, Budget } from '../types'

class PresupuestosDB extends Dexie {
  activities!: Table<Activity>
  apus!: Table<APU>
  auxApus!: Table<AuxAPU>
  projects!: Table<Project>
  budgets!: Table<Budget>

  constructor() {
    super('PresupuestosObra')
    this.version(1).stores({
      activities: '++id, code, chapter, description',
      apus: '++id, activityCode',
      auxApus: '++id, code, description',
      projects: '++id, name, client, createdAt',
      budgets: '++id, projectId, createdAt',
    })
  }
}

export const db = new PresupuestosDB()

export async function clearActivities() {
  await db.activities.clear()
  await db.apus.clear()
}

export async function importActivities(activities: Activity[]) {
  await db.activities.bulkAdd(activities)
}

export async function importAPUs(apus: APU[]) {
  await db.apus.bulkAdd(apus)
}

export async function importAuxAPUs(auxApus: AuxAPU[]) {
  await db.auxApus.clear()
  await db.auxApus.bulkAdd(auxApus)
}

export async function getActivityStats() {
  const total = await db.activities.count()
  const chapters = await db.activities.orderBy('chapter').uniqueKeys()
  return { total, chapters: chapters.length }
}
