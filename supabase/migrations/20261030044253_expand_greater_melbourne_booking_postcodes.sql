-- Extend the existing Melbourne booking zones to the audited 2026 ABS Greater
-- Melbourne boundary. Preserve zone order, existing overlaps, agents, windows,
-- block-outs, access settings and Melbourne priority configuration.
do $$
declare
  config jsonb;
  required_zone_count integer;
begin
  select content::jsonb
  into config
  from public.availability_private_config
  where key = 'availability.config'
  for update;

  if config is null then
    raise exception 'availability.config is missing';
  end if;

  select count(*)
  into required_zone_count
  from jsonb_array_elements(coalesce(config->'zones', '[]'::jsonb)) as zone
  where zone->>'id' in (
    'melb_v2_melton_sunbury_gisborne',
    'melb_v2_north_northeast',
    'melb_v2_south_southeast'
  );

  if required_zone_count <> 3 then
    raise exception 'expected all three Melbourne expansion zones, found %', required_zone_count;
  end if;

  with additions(zone_id, postcodes) as (
    values
      (
        'melb_v2_melton_sunbury_gisborne',
        array['3440', '3441', '3442']::text[]
      ),
      (
        'melb_v2_north_northeast',
        array[
          '3658',
          '3750', '3751', '3752', '3753', '3754', '3755', '3756', '3757', '3758', '3759',
          '3760', '3761', '3762', '3763', '3765', '3766', '3767',
          '3770', '3775', '3777', '3778',
          '3781', '3782', '3783', '3785', '3786', '3787', '3788', '3789',
          '3791', '3792', '3793', '3795', '3796', '3797', '3799'
        ]::text[]
      ),
      (
        'melb_v2_south_southeast',
        array['3810', '3812', '3813', '3814', '3815', '3980', '3981', '3984']::text[]
      )
  ), updated_config as (
    select jsonb_set(
      config,
      '{zones}',
      (
        select jsonb_agg(
          case
            when additions.zone_id is null then zone
            else jsonb_set(
              zone,
              '{postcodes}',
              to_jsonb(array(
                select postcode
                from (
                  select postcode, 0 as source_group, position
                  from jsonb_array_elements_text(coalesce(zone->'postcodes', '[]'::jsonb))
                    with ordinality as existing(postcode, position)
                  union all
                  select postcode, 1 as source_group, position
                  from unnest(additions.postcodes) with ordinality as added(postcode, position)
                  where not coalesce(zone->'postcodes', '[]'::jsonb) ? postcode
                ) as combined
                order by source_group, position
              )),
              true
            )
          end
          order by zone_position
        )
        from jsonb_array_elements(config->'zones') with ordinality as zones(zone, zone_position)
        left join additions on additions.zone_id = zone->>'id'
      ),
      false
    ) as value
  )
  update public.availability_private_config
  set
    content = updated_config.value::text,
    updated_at = now()
  from updated_config
  where key = 'availability.config';
end
$$;
