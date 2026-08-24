import { NextRequest, NextResponse } from 'next/server'
import { isAuthorizedAdminRequest } from '@/lib/adminAuth'
import {
  ADMIN_ROLES,
  createStaffAccount,
  listStaffAccounts,
  normalizeStaffRole,
  normalizeStaffUsername,
  updateStaffAccount,
} from '@/lib/staffAccounts'
import { rejectCrossOriginMutation, rejectLargePayload } from '@/lib/abuseProtection'
import { getAvailabilityConfig } from '@/lib/availability'
import { canAccessClientCrm, getMissingCrmSignatureFields } from '@/lib/clientCrmPolicy'

export async function GET(request: NextRequest) {
  if (!isAuthorizedAdminRequest(request, 'owner')) {
    return NextResponse.json({ success: false, error: 'Owner access required.' }, { status: 403 })
  }

  return NextResponse.json({ success: true, accounts: await listStaffAccounts(), roles: ADMIN_ROLES })
}

export async function POST(request: NextRequest) {
  const blocked = rejectCrossOriginMutation(request) ?? rejectLargePayload(request, 12 * 1024)
  if (blocked) return blocked
  if (!isAuthorizedAdminRequest(request, 'owner')) {
    return NextResponse.json({ success: false, error: 'Owner access required.' }, { status: 403 })
  }

  try {
    const body = await request.json()
    const username = normalizeStaffUsername(body?.username)
    const displayName = typeof body?.displayName === 'string' ? body.displayName.trim() : ''
    const password = typeof body?.password === 'string' ? body.password : ''
    const role = normalizeStaffRole(body?.role)
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
    const jobTitle = typeof body?.jobTitle === 'string' ? body.jobTitle.trim().slice(0, 120) : ''
    const phone = typeof body?.phone === 'string' ? body.phone.trim().slice(0, 40) : ''
    const availabilityAssigneeId = typeof body?.availabilityAssigneeId === 'string' ? body.availabilityAssigneeId.trim() : ''

    if (!username || !displayName || !role || password.length < 12 || (role === 'agent' && !availabilityAssigneeId)) {
      return NextResponse.json({ success: false, error: 'Provide a username, name, role, and password of at least 12 characters.' }, { status: 400 })
    }

    if (canAccessClientCrm(role)) {
      const missing = getMissingCrmSignatureFields({ displayName, email, jobTitle, phone })
      if (missing.length > 0) {
        return NextResponse.json({ success: false, error: `Complete the email signature profile: ${missing.join(', ')}.` }, { status: 400 })
      }
    }

    if (role === 'agent') {
      const config = await getAvailabilityConfig()
      if (!config.assignees.some((assignee) => assignee.id === availabilityAssigneeId)) {
        return NextResponse.json({ success: false, error: 'Select a valid availability profile for this agent.' }, { status: 400 })
      }
    }

    const account = await createStaffAccount({ username, displayName, email, jobTitle, phone, role, password, availabilityAssigneeId: role === 'agent' ? availabilityAssigneeId : null })
    return NextResponse.json({ success: true, account }, { status: 201 })
  } catch (error) {
    console.error('[api/admin/staff] Failed to create staff account:', error)
    return NextResponse.json({ success: false, error: 'Unable to create staff account.' }, { status: 400 })
  }
}

export async function PATCH(request: NextRequest) {
  const blocked = rejectCrossOriginMutation(request) ?? rejectLargePayload(request, 12 * 1024)
  if (blocked) return blocked
  if (!isAuthorizedAdminRequest(request, 'owner')) {
    return NextResponse.json({ success: false, error: 'Owner access required.' }, { status: 403 })
  }

  try {
    const body = await request.json()
    const id = typeof body?.id === 'string' ? body.id : ''
    const role = body?.role === undefined ? undefined : normalizeStaffRole(body.role)
    const password = typeof body?.password === 'string' && body.password ? body.password : undefined
    if (!id || (body?.role !== undefined && !role) || (password && password.length < 12)) {
      return NextResponse.json({ success: false, error: 'Invalid staff account update.' }, { status: 400 })
    }

    const accounts = await listStaffAccounts()
    const current = accounts.find((account) => account.id === id)
    if (!current) return NextResponse.json({ success: false, error: 'Staff account not found.' }, { status: 404 })
    const nextRole = role ?? current.role
    const availabilityAssigneeId = body?.availabilityAssigneeId === undefined
      ? current.availabilityAssigneeId
      : (typeof body.availabilityAssigneeId === 'string' ? body.availabilityAssigneeId.trim() : null)
    const nextActive = typeof body?.active === 'boolean' ? body.active : current.active
    const nextDisplayName = typeof body?.displayName === 'string' ? body.displayName.trim() : current.displayName
    const nextEmail = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : current.email
    const nextJobTitle = typeof body?.jobTitle === 'string' ? body.jobTitle.trim().slice(0, 120) : current.jobTitle
    const nextPhone = typeof body?.phone === 'string' ? body.phone.trim().slice(0, 40) : current.phone
    if (current.role === 'owner' && current.active && (nextRole !== 'owner' || !nextActive) && accounts.filter((account) => account.role === 'owner' && account.active).length <= 1) {
      return NextResponse.json({ success: false, error: 'Keep at least one active owner account.' }, { status: 409 })
    }

    if (nextRole === 'agent') {
      if (!availabilityAssigneeId) return NextResponse.json({ success: false, error: 'Select a valid availability profile for this agent.' }, { status: 400 })
      const config = await getAvailabilityConfig()
      if (!config.assignees.some((assignee) => assignee.id === availabilityAssigneeId)) {
        return NextResponse.json({ success: false, error: 'Select a valid availability profile for this agent.' }, { status: 400 })
      }
    }


    if (nextActive && canAccessClientCrm(nextRole)) {
      const missing = getMissingCrmSignatureFields({ displayName: nextDisplayName, email: nextEmail, jobTitle: nextJobTitle, phone: nextPhone })
      if (missing.length > 0) {
        return NextResponse.json({ success: false, error: `Complete the email signature profile: ${missing.join(', ')}.` }, { status: 400 })
      }
    }

    const account = await updateStaffAccount({
      id,
      displayName: nextDisplayName,
      email: nextEmail,
      jobTitle: nextJobTitle,
      phone: nextPhone,
      role: nextRole,
      active: nextActive,
      password,
      availabilityAssigneeId: nextRole === 'agent' ? availabilityAssigneeId : null,
    })
    return NextResponse.json({ success: true, account })
  } catch (error) {
    console.error('[api/admin/staff] Failed to update staff account:', error)
    return NextResponse.json({ success: false, error: 'Unable to update staff account.' }, { status: 400 })
  }
}
