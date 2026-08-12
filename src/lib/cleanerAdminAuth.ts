import type { NextRequest } from 'next/server'
import {
  getAdminSessionIdentityFromRequest,
  hasAdminRole,
  type AdminSessionIdentity,
} from '@/lib/adminAuth'
import type { AdminRole } from '@/lib/staffAccounts'

export type CleanerAdminAction =
  | 'list'
  | 'detail'
  | 'mutate'
  | 'comment'
  | 'documentUpload'
  | 'email'
  | 'import'
  | 'export'
  | 'documentDownload'
  | 'documentDelete'
  | 'sampleDelete'

const minimumRoleByAction: Record<CleanerAdminAction, AdminRole> = {
  list: 'viewer',
  detail: 'viewer',
  mutate: 'staff',
  comment: 'staff',
  documentUpload: 'staff',
  email: 'staff',
  import: 'staff',
  export: 'manager',
  documentDownload: 'manager',
  documentDelete: 'manager',
  sampleDelete: 'manager',
}

export function canAccessCleanerAdminAction(role: AdminRole, action: CleanerAdminAction) {
  return hasAdminRole(role, minimumRoleByAction[action])
}

export function authorizeCleanerAdminRequest(
  request: NextRequest,
  action: CleanerAdminAction,
):
  | { identity: AdminSessionIdentity; error: null; status: null }
  | { identity: null; error: 'Unauthorized' | 'Forbidden'; status: 401 | 403 } {
  const identity = getAdminSessionIdentityFromRequest(request)
  if (!identity) {
    return { identity: null, error: 'Unauthorized', status: 401 }
  }

  if (!canAccessCleanerAdminAction(identity.role, action)) {
    return { identity: null, error: 'Forbidden', status: 403 }
  }

  return { identity, error: null, status: null }
}
