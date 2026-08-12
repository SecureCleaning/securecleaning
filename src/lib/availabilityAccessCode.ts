import { createHash } from 'node:crypto'

export function hashAvailabilityAccessCode(value: string) {
  return createHash('sha256').update(value.trim()).digest('hex')
}

export function verifyAvailabilityAccessCode(candidate: string, accessCodeHash?: string) {
  if (!candidate.trim() || !accessCodeHash) return false
  return hashAvailabilityAccessCode(candidate) === accessCodeHash
}
