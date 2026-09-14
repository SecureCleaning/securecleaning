import { australianPostcodeRows } from '@/data/australianPostcodes20260527'
import type { ServiceZone } from '@/lib/availability'

type PostcodeRange = readonly [start: number, end: number]

type ZoneDefinition = Omit<ServiceZone, 'postcodes'> & {
  state: 'NSW' | 'VIC'
  postcodeRanges: readonly PostcodeRange[]
}

function postcodeInRanges(postcode: string, ranges: readonly PostcodeRange[]) {
  const value = Number(postcode)
  return ranges.some(([start, end]) => value >= start && value <= end)
}

function registeredPostcodes(state: 'NSW' | 'VIC', ranges: readonly PostcodeRange[]) {
  return [...new Set(
    australianPostcodeRows
      .filter(([postcode, , rowState]) => rowState === state && postcodeInRanges(postcode, ranges))
      .map(([postcode]) => postcode),
  )].sort()
}

function createZone({ state, postcodeRanges, ...zone }: ZoneDefinition): ServiceZone {
  return {
    ...zone,
    postcodes: registeredPostcodes(state, postcodeRanges),
    anchors: [],
  }
}

export const APPROVED_SERVICE_ZONES: ServiceZone[] = [
  createZone({
    id: 'syd_v2_northwest_west',
    name: 'Sydney North West and West',
    city: 'sydney',
    state: 'NSW',
    matchTerms: ['penrith', 'blacktown', 'rouse hill', 'castle hill', 'baulkham hills', 'richmond', 'hawkesbury'],
    postcodeRanges: [[2125, 2126], [2147, 2148], [2151, 2159], [2745, 2777], [2118, 2122], [2145, 2146], [2150, 2150], [2160, 2165]],
    notes: 'Core North West and West coverage with controlled Epping, Parramatta and M7 corridor overlap.',
  }),
  createZone({
    id: 'syd_v2_north_northeast',
    name: 'Sydney North and North East',
    city: 'sydney',
    state: 'NSW',
    matchTerms: ['north sydney', 'chatswood', 'hornsby', 'dee why', 'manly', 'ryde', 'epping', 'northern beaches'],
    postcodeRanges: [[2060, 2124], [2000, 2000], [2009, 2009], [2011, 2011], [2125, 2128], [2151, 2159]],
    notes: 'North Shore, Northern Beaches, Ryde, Epping and Hornsby with controlled harbour and Hills overlap.',
  }),
  createZone({
    id: 'syd_v2_southwest_macarthur',
    name: 'Sydney South West and Macarthur',
    city: 'sydney',
    state: 'NSW',
    matchTerms: ['wetherill park', 'smithfield', 'fairfield', 'liverpool', 'edmondson park', 'austral', 'bardia', 'campbelltown', 'camden'],
    postcodeRanges: [[2160, 2179], [2555, 2570], [2141, 2144], [2190, 2200], [2220, 2224]],
    notes: 'Bardia home-side route with controlled Auburn, Bankstown, Revesby and Hurstville overlap.',
  }),
  createZone({
    id: 'syd_v2_central_inner_west',
    name: 'Sydney Central and Inner West',
    city: 'sydney',
    state: 'NSW',
    matchTerms: ['newtown', 'ashfield', 'burwood', 'strathfield', 'olympic park', 'parramatta', 'auburn', 'granville', 'bankstown'],
    postcodeRanges: [[2037, 2050], [2127, 2146], [2150, 2150], [2190, 2200], [2007, 2008], [2010, 2010], [2015, 2018], [2112, 2117], [2147, 2148], [2166, 2168], [2203, 2204]],
    notes: 'Inner West, Parramatta and Canterbury-Bankstown with controlled inner-city and adjoining corridor overlap.',
  }),
  createZone({
    id: 'syd_v2_cbd_east',
    name: 'Sydney CBD and East',
    city: 'sydney',
    state: 'NSW',
    matchTerms: ['sydney cbd', 'barangaroo', 'pyrmont', 'surry hills', 'redfern', 'waterloo', 'alexandria', 'mascot', 'botany', 'randwick', 'coogee', 'maroubra'],
    postcodeRanges: [[2000, 2036], [2060, 2066], [2088, 2090], [2205, 2219]],
    notes: 'CBD, inner east, airport and Eastern Suburbs with controlled lower North Shore and St George overlap.',
  }),
  createZone({
    id: 'syd_v2_south_sutherland',
    name: 'Sydney South, St George and Sutherland',
    city: 'sydney',
    state: 'NSW',
    matchTerms: ['marrickville', 'rockdale', 'kogarah', 'hurstville', 'sutherland', 'miranda', 'caringbah', 'cronulla', 'engadine'],
    postcodeRanges: [[2203, 2234], [2019, 2020], [2031, 2036], [2174, 2179]],
    notes: 'St George and Sutherland route with controlled airport, Eastern Suburbs and Liverpool overlap.',
  }),
  createZone({
    id: 'melb_v2_inner_bayside',
    name: 'Melbourne Inner City and Bayside',
    city: 'melbourne',
    state: 'VIC',
    matchTerms: ['melbourne cbd', 'docklands', 'southbank', 'richmond', 'south yarra', 'prahran', 'st kilda', 'brighton', 'port melbourne'],
    postcodeRanges: [[3000, 3008], [3010, 3010], [3051, 3054], [3065, 3068], [3121, 3121], [3141, 3145], [3181, 3188], [3205, 3207], [3011, 3016], [3031, 3034], [3189, 3193]],
    notes: 'Inner Melbourne and Bayside with controlled Footscray, Essendon and Moorabbin overlap.',
  }),
  createZone({
    id: 'melb_v2_west_werribee',
    name: 'Melbourne West and Werribee',
    city: 'melbourne',
    state: 'VIC',
    matchTerms: ['footscray', 'yarraville', 'williamstown', 'sunshine', 'caroline springs', 'point cook', 'werribee', 'tarneit'],
    postcodeRanges: [[3011, 3030], [3003, 3003], [3211, 3213], [3335, 3338]],
    notes: 'West Melbourne and Wyndham with controlled inner, Lara and eastern Melton overlap.',
  }),
  createZone({
    id: 'melb_v2_melton_sunbury_gisborne',
    name: 'Melton, Sunbury and Gisborne',
    city: 'melbourne',
    state: 'VIC',
    matchTerms: ['melton', 'bacchus marsh', 'rockbank', 'diggers rest', 'sunbury', 'riddells creek', 'gisborne'],
    postcodeRanges: [[3335, 3341], [3427, 3438], [3020, 3023], [3025, 3026], [3036, 3049]],
    notes: 'North-west corridor ending at Gisborne, with controlled Sunshine, Deer Park, airport and Keilor overlap.',
  }),
  createZone({
    id: 'melb_v2_north_northeast',
    name: 'Melbourne North, North East and Lilydale',
    city: 'melbourne',
    state: 'VIC',
    matchTerms: ['brunswick', 'coburg', 'preston', 'reservoir', 'broadmeadows', 'craigieburn', 'epping', 'bundoora', 'greensborough', 'doncaster', 'box hill', 'ringwood', 'croydon', 'glen waverley', 'lilydale'],
    postcodeRanges: [[3031, 3049], [3055, 3064], [3070, 3120], [3122, 3140], [3146, 3160], [3051, 3054], [3065, 3068], [3121, 3121], [3161, 3170], [3427, 3438]],
    notes: 'North and east route ending at Craigieburn and Lilydale, with controlled inner, south-east and Sunbury overlap.',
  }),
  createZone({
    id: 'melb_v2_south_southeast',
    name: 'Melbourne South, South East and Mornington Peninsula',
    city: 'melbourne',
    state: 'VIC',
    matchTerms: ['caulfield', 'carnegie', 'oakleigh', 'clayton', 'dandenong', 'springvale', 'keysborough', 'frankston', 'narre warren', 'berwick', 'officer', 'cranbourne', 'mornington'],
    postcodeRanges: [[3161, 3180], [3189, 3204], [3802, 3809], [3910, 3920], [3926, 3944], [3975, 3978], [3141, 3160], [3181, 3188], [3205, 3207]],
    notes: 'Frankston home-side route through the south-east and Mornington Peninsula, excluding Pakenham and farther east.',
  }),
  createZone({
    id: 'melb_v2_geelong_torquay',
    name: 'Geelong and Torquay',
    city: 'melbourne',
    state: 'VIC',
    matchTerms: ['lara', 'geelong', 'north geelong', 'geelong west', 'belmont', 'highton', 'grovedale', 'waurn ponds', 'armstrong creek', 'torquay'],
    postcodeRanges: [[3211, 3228], [3024, 3024], [3027, 3030]],
    notes: 'Geelong corridor ending at Torquay, with controlled Wyndham and Little River overlap.',
  }),
]

export const APPROVED_ZONE_IDS = new Set(APPROVED_SERVICE_ZONES.map((zone) => zone.id))
