import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { getAdminSupabase } from '@/lib/supabase'

export const ADMIN_ROLES = ['owner', 'manager', 'staff', 'agent', 'viewer'] as const
export type AdminRole = (typeof ADMIN_ROLES)[number]

export type StaffAccount = {
  id: string
  username: string
  displayName: string
  email: string
  jobTitle: string
  phone: string
  role: AdminRole
  availabilityAssigneeId: string | null
  active: boolean
  lastLoginAt: string | null
  createdAt: string
  updatedAt: string
}

type StaffAccountRow = StaffAccount & {
  display_name: string
  job_title: string | null
  password_hash: string
  last_login_at: string | null
  created_at: string
  updated_at: string
  availability_assignee_id: string | null
  legacy_password_hash: string | null
}

function toStaffAccount(row: StaffAccountRow): StaffAccount {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    email: row.email ?? '',
    jobTitle: row.job_title ?? '',
    phone: row.phone ?? '',
    role: row.role,
    availabilityAssigneeId: row.availability_assignee_id ?? null,
    active: row.active,
    lastLoginAt: row.last_login_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

const STAFF_ACCOUNT_SELECT = 'id, username, display_name, email, job_title, phone, role, active, availability_assignee_id, password_hash, legacy_password_hash, last_login_at, created_at, updated_at'

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

export function createMigrationPassword() {
  return randomBytes(32).toString('base64url')
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
    .select(STAFF_ACCOUNT_SELECT)
    .order('display_name', { ascending: true })

  if (error) throw error
  return ((data ?? []) as StaffAccountRow[]).map(toStaffAccount)
}

export async function getStaffAccountForLogin(username: string) {
  const db = getAdminSupabase()
  const { data, error } = await db
    .from('admin_staff_accounts')
    .select(STAFF_ACCOUNT_SELECT)
    .eq('username', username)
    .maybeSingle()

  if (error) throw error
  return data as StaffAccountRow | null
}

export async function getStaffAccountById(id: string) {
  const db = getAdminSupabase()
  const { data, error } = await db
    .from('admin_staff_accounts')
    .select(STAFF_ACCOUNT_SELECT)
    .eq('id', id)
    .maybeSingle()

  if (error) throw error
  return data as StaffAccountRow | null
}

export async function getStaffAccountProfileById(id: string) {
  const row = await getStaffAccountById(id)
  return row ? toStaffAccount(row) : null
}

export async function createStaffAccount(input: {
  username: string
  displayName: string
  email?: string
  jobTitle?: string
  phone?: string
  role: AdminRole
  password: string
  availabilityAssigneeId?: string | null
  legacyPasswordHash?: string | null
  active?: boolean
}) {
  const db = getAdminSupabase()
  const { data, error } = await db
    .from('admin_staff_accounts')
    .insert({
      username: input.username,
      display_name: input.displayName,
      email: input.email || null,
      job_title: input.jobTitle || null,
      phone: input.phone || null,
      role: input.role,
      password_hash: hashStaffPassword(input.password),
      availability_assignee_id: input.availabilityAssigneeId ?? null,
      legacy_password_hash: input.legacyPasswordHash ?? null,
      active: input.active ?? true,
    })
    .select(STAFF_ACCOUNT_SELECT)
    .single()

  if (error) throw error
  return toStaffAccount(data as StaffAccountRow)
}

export async function updateStaffAccount(input: {
  id: string
  displayName?: string
  email?: string
  jobTitle?: string
  phone?: string
  role?: AdminRole
  active?: boolean
  password?: string
  availabilityAssigneeId?: string | null
  clearLegacyPassword?: boolean
}) {
  const db = getAdminSupabase()
  const update: Record<string, unknown> = {}
  if (typeof input.displayName === 'string') update.display_name = input.displayName
  if (typeof input.email === 'string') update.email = input.email || null
  if (typeof input.jobTitle === 'string') update.job_title = input.jobTitle || null
  if (typeof input.phone === 'string') update.phone = input.phone || null
  if (input.role) update.role = input.role
  if (typeof input.active === 'boolean') update.active = input.active
  if (input.password) update.password_hash = hashStaffPassword(input.password)
  if (input.availabilityAssigneeId !== undefined) update.availability_assignee_id = input.availabilityAssigneeId
  if (input.clearLegacyPassword) update.legacy_password_hash = null

  const { data, error } = await db
    .from('admin_staff_accounts')
    .update(update)
    .eq('id', input.id)
    .select(STAFF_ACCOUNT_SELECT)
    .single()

  if (error) throw error
  return toStaffAccount(data as StaffAccountRow)
}

export async function recordStaffLogin(id: string) {
  const db = getAdminSupabase()
  await db.from('admin_staff_accounts').update({ last_login_at: new Date().toISOString() }).eq('id', id)
}
