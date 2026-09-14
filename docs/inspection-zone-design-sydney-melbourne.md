# Sydney and Melbourne inspection-zone design

Status: approved and applied to the production availability configuration on 14 September 2026. The matching source-code defaults and calendar-assignment safeguard are prepared locally and await the next authorised deployment.

## Objective

Replace the current incomplete starter zones with complete, controlled-overlap postcode territories for:

- Greater Sydney, including Penrith, Hawkesbury, Liverpool, Campbelltown and Camden;
- Greater Melbourne within the agreed Lilydale, Craigieburn, Sunbury and Gisborne boundaries; and
- Geelong as a separate inspection corridor.

The CRM state assignment remains separate. An NSW agent may manage an NSW CRM opportunity even when its location is outside the public inspection-booking boundary.

## Design rules

1. Every delivery postcode has one core inspection zone.
2. Selected boundary and transit-corridor postcodes also belong to one neighbouring zone, giving the client an additional booking option. A postcode has no more than two zone memberships in either city.
3. The postcode is authoritative. Suburb terms are only narrow fallbacks for incomplete legacy addresses.
4. Broad catch-all zones and uncontrolled radius circles are removed from public scheduling.
5. Every weekly slot represents one travel corridor. A slot should normally use one primary zone and, only when useful, one adjacent zone.
6. The agent can add or remove slots and select the zones for each slot in the existing availability editor.
7. Regional locations outside the boundaries below remain manual bookings until a dedicated regional zone and travel day are approved.
8. Existing booked inspections are preserved by treating an explicit agent assignment as authoritative; later zone or address changes do not remove the appointment from that agent's calendar.

## Current coverage audit

| Region | Current zones | Unique explicit postcodes | Proposed zones | Proposed coverage |
|---|---:|---:|---:|---:|
| Greater Sydney | 5 | 47 | 6 | 235 unique / 343 zone memberships |
| Greater Melbourne and Geelong | 5 | 166 | 6 | 256 unique / 362 zone memberships |

Current zones overlap without a defined boundary policy. The revised Sydney design uses intentional overlap buffers that follow major travel corridors from the agent's Bardia base. Melbourne now uses the same controlled-overlap model, with travel corridors suited to a Frankston agent and a future Melton agent.

## Proposed Sydney zones

### Sydney overlap model

Sydney is divided into six core travel areas similar to the supplied map. Approximately 46% of the covered postcodes receive one adjacent-zone option; the remaining postcodes stay in one zone. This produces flexibility near zone boundaries without making a location available across unrelated parts of Sydney.

When a client enters an overlap postcode, the booking page combines the availability from both matching zones. For example, Wetherill Park can appear on the South West route and on a selected North West transit route because it is close to the M7 corridor.

### 1. Sydney North West and West (`syd_v2_northwest_west`)

Core coverage: Penrith, Blacktown, Rouse Hill, the Hills District, Hawkesbury and the eastern Blue Mountains fringe.

Core postcode groups: `2125-2126, 2147-2148, 2151-2159, 2745-2777` using only registered delivery postcodes.

Overlap buffer: `2118-2122, 2145-2146, 2150, 2160-2165`. This adds the Epping/Carlingford, Parramatta/Toongabbie and Merrylands/Fairfield/Wetherill Park transit corridors.

### 2. Sydney North and North East (`syd_v2_north_northeast`)

Core coverage: North Sydney, Lower and Upper North Shore, Northern Beaches, Ryde/Epping and Hornsby.

Core postcode group: `2060-2124` using only registered delivery postcodes.

Overlap buffer: `2000, 2009, 2011, 2125-2128, 2151-2159`. This adds the harbour/CBD edge, Olympic Park and Hills boundary.

### 3. Sydney South West and Macarthur (`syd_v2_southwest_macarthur`)

Core coverage: Wetherill Park/Fairfield, Liverpool, Edmondson Park, Austral, Bardia, Campbelltown and Camden.

Core postcode groups: `2160-2179, 2555-2570` using only registered delivery postcodes.

Bardia 2565 is the agent's home-side core area. Wetherill Park and Smithfield 2164 are also core locations.

Overlap buffer: `2141-2144, 2170-2173, 2190-2200, 2220-2224`. This follows the Auburn/Bankstown, Liverpool and Revesby/Hurstville corridors.

### 4. Sydney Central and Inner West (`syd_v2_central_inner_west`)

Core coverage: Inner West, Burwood/Strathfield, Olympic Park, Parramatta, Auburn/Granville and Canterbury-Bankstown.

Core postcode groups: `2037-2050, 2127-2146, 2150, 2190-2200` using only registered delivery postcodes.

Overlap buffer: `2007-2008, 2010, 2015-2018, 2112-2117, 2147-2148, 2166-2168, 2203-2204`. This follows the inner-city, Ryde, Blacktown, Fairfield/Liverpool and Marrickville boundaries.

### 5. Sydney CBD and East (`syd_v2_cbd_east`)

Coverage: all delivery postcodes from 2000-2036. This includes the CBD, Pyrmont/Ultimo, Surry Hills/Redfern, Alexandria/Waterloo, Mascot/Botany, the Eastern Suburbs, Randwick, Coogee and Maroubra.

Core postcodes (28):

`2000, 2007-2011, 2015-2036` using only delivery postcodes present in the bundled postcode register.

Overlap buffer: `2060-2066, 2088-2090, 2205-2219`. This adds the lower North Shore/Mosman and airport/St George boundaries.

### 6. Sydney South, St George and Sutherland (`syd_v2_south_sutherland`)

Core coverage: Marrickville south, the airport/St George corridor, Sutherland Shire, Cronulla and Engadine.

Core postcode group: `2203-2234` using only registered delivery postcodes.

Overlap buffer: `2019-2020, 2031-2036, 2174-2179`. This adds the Mascot/Botany/Randwick and Liverpool/Austral boundaries.

### Sydney boundary exclusions

Central Coast 2250+, Wollongong/Illawarra 2500-2534, Southern Highlands 2571+, Newcastle and regional NSW are excluded from automatic public booking. They can be added later as separate regional corridors rather than silently extending Renata's Sydney travel schedule.

## Proposed Sydney weekly calendar

This retains two inspection days and twelve hourly appointment starts per week. It starts close to Bardia on Tuesday and forms a north-to-south return route on Thursday.

| Day | Start-time window | Zone | Appointment starts |
|---|---|---|---:|
| Tuesday | 10:00am-11:00am | South West and Macarthur | 2 |
| Tuesday | 12:00pm-1:00pm | Central and Inner West | 2 |
| Tuesday | 2:00pm-3:00pm | North West and West | 2 |
| Thursday | 10:00am-11:00am | North and North East | 2 |
| Thursday | 12:00pm-1:00pm | CBD and East | 2 |
| Thursday | 2:00pm-3:00pm | South, St George and Sutherland | 2 |

The existing engine treats the window end as the final appointment start, so a 10:00am-11:00am window produces starts at 10:00am and 11:00am. The one-hour gaps between travel areas are produced by using separate windows rather than combining distant zones into one large window.

Renata can change these allocations from her availability page. The recommended rule is one primary zone per time window; she may also select one adjacent zone when her planned route makes that practical. Boundary postcodes already receive the controlled overlap automatically.

## Proposed Melbourne zones

### Melbourne overlap and multi-agent model

The six zones are shared coverage definitions rather than being owned by one agent. Each Melbourne agent selects the zones they will cover in each of their own availability windows.

- The current Frankston-based agent will normally favour Inner/Bayside and South/South East routes, with access to the North/East overlap when travelling toward Lilydale.
- A future Melton-based agent will normally favour Melton/Sunbury/Gisborne, West/Werribee, North/North East and Geelong routes.
- A client in a controlled overlap postcode can see appointment options from either agent when both agents have selected the relevant neighbouring zones.
- The global `maxSlotsToShow` setting should increase from 6 to 12 when the second Melbourne agent is activated so one agent's results do not hide the other's.

### 1. Melbourne Inner City and Bayside (`melb_v2_inner_bayside`)

Coverage: CBD, Docklands, Southbank, inner north, Richmond, South Yarra/Prahran, St Kilda, Brighton and Port Melbourne.

Explicit postcodes (32):

`3000-3008, 3010, 3051-3054, 3065-3068, 3121, 3141-3145, 3181-3188, 3205-3207` using only registered delivery postcodes.

Overlap buffer: `3011-3016, 3031-3034, 3189-3193`. This adds the Footscray/Williamstown, Essendon/Moonee Ponds and Bentleigh/Moorabbin boundaries.

### 2. Melbourne West and Werribee (`melb_v2_west_werribee`)

Core coverage: Footscray/Yarraville, Hobsons Bay, Sunshine, Caroline Springs, Point Cook, Werribee and Tarneit.

Core postcode group: `3011-3030` using only registered delivery postcodes.

Overlap buffer: `3003, 3211-3213, 3335-3338`. This adds West Melbourne, the Lara/Little River corridor and the eastern Melton growth corridor.

### 3. Melton, Sunbury and Gisborne (`melb_v2_melton_sunbury_gisborne`)

Core coverage: Melton/Bacchus Marsh, Rockbank, Diggers Rest, Sunbury, Riddells Creek and Gisborne. Gisborne is the western/north-western automatic-booking limit; Macedon and Woodend are excluded.

Core postcode groups: `3335-3341, 3427-3438` using only registered delivery postcodes.

Overlap buffer: `3020-3023, 3025-3026, 3036-3049`. This follows the Sunshine/Deer Park and airport/Keilor corridors.

### 4. Melbourne North, North East and Lilydale (`melb_v2_north_northeast`)

Core coverage: Moonee Valley, Brunswick/Coburg, Preston/Reservoir, Broadmeadows, Craigieburn, Epping, Bundoora, Greensborough, Kew/Balwyn, Doncaster, Box Hill, Ringwood, Croydon, Glen Waverley and Lilydale.

Core postcode groups: `3031-3049, 3055-3064, 3070-3120, 3122-3140, 3146-3160` using only registered delivery postcodes.

Overlap buffer: `3051-3054, 3065-3068, 3121, 3161-3170, 3427-3438`. This adds the inner-north, Richmond, Oakleigh/Clayton and Sunbury/Gisborne boundaries.

Craigieburn and Lilydale are the automatic-booking limits. Whittlesea, Healesville, Yarra Junction and Warburton are excluded.

### 5. Melbourne South, South East and Mornington Peninsula (`melb_v2_south_southeast`)

Core coverage: Caulfield/Carnegie, Oakleigh/Clayton, Bayside south, Dandenong, Springvale, Keysborough, Frankston, Narre Warren, Berwick/Officer, Cranbourne and the Mornington Peninsula.

Core postcode groups: `3161-3180, 3189-3204, 3802-3809, 3910-3920, 3926-3944, 3975-3978` using only registered delivery postcodes.

Overlap buffer: `3141-3160, 3181-3188, 3205-3207`. This adds the South Yarra/Malvern, Glen Waverley/Rowville and inner Bayside boundaries.

Pakenham 3810 and locations farther east are excluded. French Island 3921, Tooradin/Koo Wee Rup 3980+ and the Gippsland/South Gippsland postcodes are also excluded from automatic booking.

### 6. Geelong and Torquay (`melb_v2_geelong_torquay`)

Coverage: Lara/Little River corridor, metropolitan Geelong, Armstrong Creek and Torquay.

Explicit postcodes (18):

`3211-3228` using only registered delivery postcodes.

Overlap buffer: `3024, 3027-3030`. This adds the Wyndham/Little River approach from Melbourne's west.

Torquay 3228 is the southern automatic-booking limit. Anglesea and Surf Coast postcodes 3230+ remain manual.

## Proposed Melbourne agent allocation

The exact days remain editable per agent. The recommended starting allocation is:

| Agent origin | Primary zones | Secondary/overlap zones |
|---|---|---|
| Frankston | South/South East/Mornington; Inner City/Bayside | North/North East to Lilydale |
| Melton | Melton/Sunbury/Gisborne; West/Werribee; Geelong/Torquay | North/North East; Inner City/Bayside |

Until the second agent is created, the Frankston agent can select any required western or Geelong route on a specific slot. After the Melton agent is active, each agent should have separate time windows; the same zone may be assigned to both agents when either could reasonably service it.

## Implementation record

1. A rollback snapshot was retained before the guarded production update.
2. The twelve `v2` zones were generated from the bundled delivery-postcode register and applied without radius anchors.
3. Sydney now uses the approved six-window Tuesday/Thursday route. Melbourne retains its five existing time windows with the new Frankston-oriented route assignments.
4. Assignee profiles, one-off block-outs and calendar settings were preserved.
5. Public production checks passed for Bardia, Wetherill Park, Frankston, Melton and Torquay. Pakenham correctly remains outside automatic booking.
6. Source defaults, automated overlap checks and the explicit-assignment calendar safeguard are complete locally. They require an authorised code deployment before they become the production fallback and calendar behaviour.
