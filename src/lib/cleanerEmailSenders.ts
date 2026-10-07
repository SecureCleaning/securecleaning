import 'server-only'
import { getStaffAccountProfileById, listStaffAccounts, type StaffAccount } from '@/lib/staffAccounts'
import { getAvailabilityAssignee, getAvailabilityConfig } from '@/lib/availability'
import { getStateForAvailabilityCity } from '@/lib/cleanerAgentPolicy'
import { getMissingCrmSignatureFields } from '@/lib/clientCrmPolicy'
import { buildCrmSignature } from '@/lib/clientCrmEmail'

export type CleanerSenderActor = { id: string; role: string }
const roles = ['owner', 'manager', 'staff', 'agent']
const fromEmail = 'info@securecleaning.com.au'
function option(account: StaffAccount) {
  const name = account.displayName.replace(/[\r\n<>]/g, ' ').replace(/\s+/g, ' ').trim()
  return { id: account.id, displayName: account.displayName, jobTitle: account.jobTitle, phone: account.phone, email: account.email,
    from: `${name} - Secure Cleaning <${fromEmail}>`, replyTo: account.email, cc: account.email,
    signature: buildCrmSignature(account), missing: getMissingCrmSignatureFields(account) }
}
export async function getCleanerEmailSenders(actor: CleanerSenderActor, state?: string) {
  let self: StaffAccount | null
  if (actor.role === 'availability_agent') {
    const assignee = getAvailabilityAssignee(await getAvailabilityConfig(), actor.id)
    if (!assignee?.active || getStateForAvailabilityCity(assignee.city) !== state) throw new Error('The regional agent is unavailable for this state.')
    const matches = (await listStaffAccounts()).filter(account => account.active && roles.includes(account.role) && account.availabilityAssigneeId === actor.id)
    if (matches.length !== 1) throw new Error('Link this regional agent to one active Team Access account with an email signature.')
    self = matches[0]
  } else {
    self = await getStaffAccountProfileById(actor.id)
    if (!self?.active || self.role !== actor.role || !roles.includes(self.role)) throw new Error('An active team account is required to send cleaner emails.')
  }
  const accounts = actor.role === 'owner' ? (await listStaffAccounts()).filter(account => account.active && roles.includes(account.role)) : [self]
  return { defaultSenderId: self.id, canChooseSender: actor.role === 'owner', senders: accounts.map(option) }
}
export async function resolveCleanerEmailSender(actor: CleanerSenderActor, requested: unknown, state?: string) {
  if (requested != null && typeof requested !== 'string') throw new Error('Select a valid email sender.')
  const context = await getCleanerEmailSenders(actor, state)
  const id = (typeof requested === 'string' ? requested.trim() : '') || context.defaultSenderId
  const sender = context.senders.find(item => item.id === id)
  if (!sender) throw new Error('You cannot send cleaner email as that team member.')
  if (sender.missing.length) throw new Error(`Complete the selected sender's Team Access signature: ${sender.missing.join(', ')}.`)
  return sender
}
