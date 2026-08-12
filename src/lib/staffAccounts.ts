import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { getAdminSupabase } from '@/lib/supabase'

export const ADMIN_ROLES = ['owner', 'manager', 'staff', 'viewer'] as const
export type AdminRole = (typeof ADMIN_ROLES)[number]

export type StaffAccount = {
  id: string
  username: string
  displayName: string
  email: string
  role: AdminRole
  active: boolean
  lastLoginAt: string | null
  createdAt: string
  updatedAt: string
}

type StaffAccountRow = StaffAccount & {
  display_name: string
  password_hash: string
  last_login_at: string | null
  created_at: string
  updated_at: string
}

function toStaffAccount(row: StaffAccountRow): StaffAccount {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    email: row.email ?? '',
    role: row.role,
    active: row.active,
    lastLoginAt: row.last_login_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function normalizeStaffUsername(value: unknown) {
  return typeof value === 'string'
    ? value.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 80)
    : ''
}

export function normalizeStaffRole(value: unknown): AdminRole | null {
  return typeof value === 'string' && ADMIN_ROLES.includes(value as AdminRole)
    ? value as AdminRole
    : null
}

export function hashStaffPassword(password: string) {
  const salt = randomBytes(16).toString('hex')
  const derivedKey = scryptSync(password, salt, 64).toString('hex')
  return `scrypt$${salt}$${derivedKey}`
}

export function verifyStaffPassword(password: string, storedHash: string) {
  const [algorithm, salt, key] = storedHash.split('$')
  if (algorithm !== 'scrypt' || !salt || !key) return false

  try {
    const expected = Buffer.from(key, 'hex')
    const candidate = scryptSync(password, salt, expected.length)
    return expected.length === candidate.length && timingSafeEqual(expected, candidate)
  } catch {
    return false
  }
}

export async function countStaffAccounts() {
  const db = getAdminSupabase()
  const { count, error } = await db
    .from('admin_staff_accounts')
    .select('id', { count: 'exact', head: true })

  if (error) throw error
  return count ?? 0
}

export async function listStaffAccounts() {
  const db = getAdminSupabase()
  const { data, error } = await db
    .from('admin_staff_accounts')
    .select('id, username, display_name, email, role, active, password_hash, last_login_at, created_at, updated_at')
    .order('display_name', { ascending: true })

  if (error) throw error
  return ((data ?? []) as StaffAccountRow[]).map(toStaffAccount)
}

export async function getStaffAccountForLogin(username: string) {
  const db = getAdminSupabase()
  const { data, error } = await db
    .from('admin_staff_accounts')
    .select('id, username, display_name, email, role, active, password_hash, last_login_at, created_at, updated_at')
    .eq('username', username)
    .maybeSingle()

  if (error) throw error
  return data as StaffAccountRow | null
}

export async function createStaffAccount(input: {
  username: string
  displayName: string
  email?: string
  role: AdminRole
  password: string
}) {
  const db = getAdminSupabase()
  const { data, error } = await db
    .from('admin_staff_accounts')
    .insert({
      username: input.username,
      display_name: input.displayName,
      email: input.email || null,
      role: input.role,
      password_hash: hashStaffPassword(input.password),
      active: true,
    })
    .select('id, username, display_name, email, role, active, password_hash, last_login_at, created_at, updated_at')
    .single()

  if (error) throw error
  return toStaffAccount(data as StaffAccountRow)
}

export async function updateStaffAccount(input: {
  id: string
  displayName?: string
  email?: string
  role?: AdminRole
  active?: boolean
  password?: string
}) {
  const db = getAdminSupabase()
  const update: Record<string, unknown> = {}
  if (typeof input.displayName === 'string') update.display_name = input.displayName
  if (typeof input.email === 'string') update.email = input.email || null
  if (input.role) update.role = input.role
  if (typeof input.active === 'boolean') update.active = input.active
  if (input.password) update.password_hash = hashStaffPassword(input.password)

  const { data, error } = await db
    .from('admin_staff_accounts')
    .update(update)
    .eq('id', input.id)
    .select('id, username, display_name, email, role, active, password_hash, last_login_at, created_at, updated_at')
    .single()

  if (error) throw error
  return toStaffAccount(data as StaffAccountRow)
}

export async function recordStaffLogin(id: string) {
  const db = getAdminSupabase()
  await db.from('admin_staff_accounts').update({ last_login_at: new Date().toISOString() }).eq('id', id)
}
