import type { AvailabilityConfig, WeeklyAvailabilitySlot } from '@/lib/availability'
import { APPROVED_SERVICE_ZONES, APPROVED_ZONE_IDS } from '@/lib/availabilityZoneCatalog'

const LEGACY_ZONE_REPLACEMENTS: Record<string, string[]> = {
  melb_south_east_east: ['melb_v2_north_northeast'],
  melb_south_east: ['melb_v2_south_southeast'],
  melb_inner_city: ['melb_v2_inner_bayside'],
  melb_north_west: ['melb_v2_west_werribee', 'melb_v2_melton_sunbury_gisborne'],
  melb_geelong: ['melb_v2_geelong_torquay'],
}

const MELBOURNE_SLOT_ROUTES: Record<string, { zoneIds: string[]; notes: string }> = {
  melb_mon_12_3: {
    zoneIds: ['melb_v2_north_northeast'],
    notes: 'North, north-east and Lilydale route.',
  },
  melb_tue_10_3: {
    zoneIds: ['melb_v2_west_werribee', 'melb_v2_melton_sunbury_gisborne'],
    notes: 'West, Werribee, Melton, Sunbury and Gisborne route.',
  },
  melb_wed_10_2: {
    zoneIds: ['melb_v2_inner_bayside', 'melb_v2_south_southeast'],
    notes: 'Inner City, Bayside and south-east route.',
  },
  melb_thu_10_3: {
    zoneIds: ['melb_v2_west_werribee', 'melb_v2_geelong_torquay'],
    notes: 'Werribee, Geelong and Torquay route.',
  },
  melb_fri_10_12: {
    zoneIds: ['melb_v2_south_southeast'],
    notes: 'Frankston, south-east and Mornington Peninsula route.',
  },
}

function uniqueApprovedZoneIds(zoneIds: string[]) {
  return [...new Set(zoneIds.flatMap((zoneId) => {
    if (APPROVED_ZONE_IDS.has(zoneId)) return [zoneId]
    return LEGACY_ZONE_REPLACEMENTS[zoneId] ?? []
  }))]
}

function migrateMelbourneSlot(slot: WeeklyAvailabilitySlot): WeeklyAvailabilitySlot {
  const approvedRoute = MELBOURNE_SLOT_ROUTES[slot.id]
  return {
    ...slot,
    city: 'melbourne',
    zoneIds: approvedRoute?.zoneIds ?? uniqueApprovedZoneIds(slot.zoneIds),
    notes: approvedRoute?.notes ?? slot.notes,
  }
}

function buildSydneySlots(assigneeId: string): WeeklyAvailabilitySlot[] {
  return [
    ['syd_tue_10_11', 'Tuesday 10:00am-11:00am', 'tuesday', '10:00', '11:00', 'syd_v2_southwest_macarthur', 'South West and Macarthur route starting near Bardia.'],
    ['syd_tue_12_1', 'Tuesday 12:00pm-1:00pm', 'tuesday', '12:00', '13:00', 'syd_v2_central_inner_west', 'Central and Inner West route.'],
    ['syd_tue_2_3', 'Tuesday 2:00pm-3:00pm', 'tuesday', '14:00', '15:00', 'syd_v2_northwest_west', 'North West and West route.'],
    ['syd_thu_10_11', 'Thursday 10:00am-11:00am', 'thursday', '10:00', '11:00', 'syd_v2_north_northeast', 'North and North East route.'],
    ['syd_thu_12_1', 'Thursday 12:00pm-1:00pm', 'thursday', '12:00', '13:00', 'syd_v2_cbd_east', 'CBD and East route.'],
    ['syd_thu_2_3', 'Thursday 2:00pm-3:00pm', 'thursday', '14:00', '15:00', 'syd_v2_south_sutherland', 'South, St George and Sutherland route returning toward Bardia.'],
  ].map(([id, label, day, startTime, endTime, zoneId, notes]) => ({
    id,
    city: 'sydney',
    assigneeId,
    label,
    day: day as WeeklyAvailabilitySlot['day'],
    startTime,
    endTime,
    zoneIds: [zoneId],
    active: true,
    notes,
  }))
}

export function applyApprovedAvailabilityZoneDesign(config: AvailabilityConfig): AvailabilityConfig {
  const sydneyAssignee = config.assignees.find((assignee) => assignee.active && assignee.city === 'sydney')
  const activeMelbourneAgentCount = config.assignees.filter((assignee) => assignee.active && assignee.city === 'melbourne').length

  const sydneyAssigneeIds = new Set(
    config.assignees.filter((assignee) => assignee.city === 'sydney').map((assignee) => assignee.id),
  )

  const preservedAndMigratedSlots = config.weeklySlots
    .filter((slot) => !sydneyAssigneeIds.has(slot.assigneeId))
    .map((slot) => slot.city === 'melbourne' ? migrateMelbourneSlot(slot) : slot)

  return {
    ...config,
    settings: {
      ...config.settings,
      maxSlotsToShow: activeMelbourneAgentCount > 1
        ? Math.max(config.settings.maxSlotsToShow, 12)
        : config.settings.maxSlotsToShow,
    },
    zones: APPROVED_SERVICE_ZONES.map((zone) => ({
      ...zone,
      matchTerms: [...zone.matchTerms],
      postcodes: [...zone.postcodes],
      anchors: [],
    })),
    weeklySlots: [
      ...preservedAndMigratedSlots,
      ...(sydneyAssignee ? buildSydneySlots(sydneyAssignee.id) : []),
    ],
    oneOffBlocks: config.oneOffBlocks.map((block) => ({ ...block })),
  }
}
