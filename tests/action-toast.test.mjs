import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('action feedback uses one visible accessible floating toast', () => {
  const toast = source('src/components/ActionToast.tsx')
  assert.match(toast, /fixed right-4 top-24/)
  assert.match(toast, /role=\{tone === 'error' \? 'alert' : 'status'\}/)
  assert.match(toast, /aria-live=\{tone === 'error' \? 'assertive' : 'polite'\}/)
  assert.match(toast, /aria-label="Dismiss notification"/)
  assert.match(toast, /tone !== 'success'/)
  assert.match(toast, /successDurationMs = 6500/)
})

test('primary owner and agent workspaces no longer place action messages at page top', () => {
  for (const path of [
    'src/components/admin/AdminDashboard.tsx',
    'src/components/admin/ClientCrmWorkspace.tsx',
    'src/components/admin/CleanersAdmin.tsx',
    'src/components/admin/ContractProductsWorkspace.tsx',
    'src/components/admin/ContractSalesWorkspace.tsx',
    'src/components/admin/ContractSaleInspectionPanel.tsx',
    'src/components/admin/CommissionsWorkspace.tsx',
    'src/components/admin/ConsumablesAdmin.tsx',
    'src/components/admin/ContentAdmin.tsx',
    'src/components/admin/PricingAdmin.tsx',
    'src/components/admin/RoomTypeConfigAdmin.tsx',
    'src/components/admin/SitesManager.tsx',
    'src/components/admin/StaffAccessAdmin.tsx',
    'src/components/admin/MenuConfigurationEditor.tsx',
    'src/components/admin/BookingEditor.tsx',
    'src/components/admin/CrmFollowUpPanel.tsx',
    'src/components/admin/AvailabilityAdmin.tsx',
    'src/components/admin/DispatchPanel.tsx',
    'src/components/availability/AgentCleaners.tsx',
    'src/components/availability/AssigneeAvailabilityEditor.tsx',
  ]) {
    assert.match(source(path), /<ActionToast/, path)
  }
})
