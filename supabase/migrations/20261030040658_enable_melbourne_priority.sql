-- Enable Melbourne's postcode-first, multi-agent priority allocation.
-- Preserve the existing zones, windows, agent access and block-outs.
with current_config as (
  select key, content::jsonb as config
  from public.availability_private_config
  where key = 'availability.config'
), updated_config as (
  select
    key,
    jsonb_set(
      jsonb_set(
        jsonb_set(
          config,
          '{settings,melbourneBookingMode}',
          '"priority"'::jsonb,
          true
        ),
        '{settings,melbourneMaxSlotsToShow}',
        '12'::jsonb,
        true
      ),
      '{assignees}',
      (
        select jsonb_agg(
          case
            when assignee->>'id' = 'melb_primary'
              then jsonb_set(assignee, '{bookingPriority}', '1'::jsonb, true)
            else assignee
          end
          order by position
        )
        from jsonb_array_elements(config->'assignees') with ordinality as agents(assignee, position)
      ),
      false
    ) as config
  from current_config
)
update public.availability_private_config as target
set
  content = updated_config.config::text,
  updated_at = now()
from updated_config
where target.key = updated_config.key;
