# Quote Calibration Notes — Secure Cleaning

## Current tested scenarios

### 1. Small office, 120sqm, weekly
- Output: $165–$180
- Behaviour: minimum charge dominates

### 2. Medium office, 300sqm, 3x/week
- Output: $290–$355
- Behaviour: believable indicative range for a structured commercial quote

### 3. Medical, 220sqm, daily
- Output: $236–$288
- Behaviour: medical multiplier working; still conservative if clinical standard is high

### 4. Warehouse, 800sqm, weekly
- Output: $263–$322
- Behaviour: acceptable for indicative quoting, depending on complexity

## Interpretation
- The engine is usable for launch as an indicative estimator.
- Small sites frequently floor to the minimum invoice.
- The formula is conservative on base labour and relies on the minimum charge and add-ons.

## Main levers for future tuning
1. `HOURLY_RATE`
2. cleanable area assumption (`floorArea / 400`)
3. `MINIMUM_INVOICE`
4. bathroom/kitchen/window add-on rates
5. city multipliers

## Recommendation
Keep current settings for MVP.
Recalibrate after 10–20 real quotes against real close rates.
