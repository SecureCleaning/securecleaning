create table if not exists public.calendar_public_holidays (
  id text primary key,
  state_code text not null check (state_code in ('ACT', 'NSW', 'NT', 'QLD', 'SA', 'TAS', 'VIC', 'WA')),
  holiday_date date not null,
  holiday_name text not null check (length(trim(holiday_name)) between 2 and 160),
  start_time time without time zone not null default time '00:00',
  end_time time without time zone not null default time '00:00',
  is_all_day boolean not null default true,
  source_url text not null check (source_url ~ '^https://'),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.calendar_public_holidays is
  'Authoritative statewide public-holiday periods used to block booking availability and label staff calendars.';

create index if not exists calendar_public_holidays_lookup_idx
  on public.calendar_public_holidays (state_code, holiday_date)
  where active;

alter table public.calendar_public_holidays enable row level security;
revoke all on table public.calendar_public_holidays from public, anon, authenticated;
grant select, insert, update, delete on table public.calendar_public_holidays to service_role;

insert into public.calendar_public_holidays (
  id, state_code, holiday_date, holiday_name, start_time, end_time, is_all_day, source_url
)
values
  ('nsw-2026-new-years-day', 'NSW', '2026-01-01', 'New Year''s Day', '00:00', '00:00', true, 'https://www.nsw.gov.au/about-nsw/public-holidays'),
  ('nsw-2026-australia-day', 'NSW', '2026-01-26', 'Australia Day', '00:00', '00:00', true, 'https://www.nsw.gov.au/about-nsw/public-holidays'),
  ('nsw-2026-good-friday', 'NSW', '2026-04-03', 'Good Friday', '00:00', '00:00', true, 'https://www.nsw.gov.au/about-nsw/public-holidays'),
  ('nsw-2026-easter-saturday', 'NSW', '2026-04-04', 'Easter Saturday', '00:00', '00:00', true, 'https://www.nsw.gov.au/about-nsw/public-holidays'),
  ('nsw-2026-easter-sunday', 'NSW', '2026-04-05', 'Easter Sunday', '00:00', '00:00', true, 'https://www.nsw.gov.au/about-nsw/public-holidays'),
  ('nsw-2026-easter-monday', 'NSW', '2026-04-06', 'Easter Monday', '00:00', '00:00', true, 'https://www.nsw.gov.au/about-nsw/public-holidays'),
  ('nsw-2026-anzac-day', 'NSW', '2026-04-25', 'Anzac Day', '00:00', '00:00', true, 'https://www.nsw.gov.au/about-nsw/public-holidays'),
  ('nsw-2026-anzac-additional-day', 'NSW', '2026-04-27', 'Additional public holiday for Anzac Day', '00:00', '00:00', true, 'https://www.nsw.gov.au/about-nsw/public-holidays'),
  ('nsw-2026-kings-birthday', 'NSW', '2026-06-08', 'King''s Birthday', '00:00', '00:00', true, 'https://www.nsw.gov.au/about-nsw/public-holidays'),
  ('nsw-2026-labour-day', 'NSW', '2026-10-05', 'Labour Day', '00:00', '00:00', true, 'https://www.nsw.gov.au/about-nsw/public-holidays'),
  ('nsw-2026-christmas-day', 'NSW', '2026-12-25', 'Christmas Day', '00:00', '00:00', true, 'https://www.nsw.gov.au/about-nsw/public-holidays'),
  ('nsw-2026-boxing-day', 'NSW', '2026-12-26', 'Boxing Day', '00:00', '00:00', true, 'https://www.nsw.gov.au/about-nsw/public-holidays'),
  ('nsw-2026-boxing-additional-day', 'NSW', '2026-12-28', 'Additional public holiday for Boxing Day', '00:00', '00:00', true, 'https://www.nsw.gov.au/about-nsw/public-holidays'),
  ('nsw-2027-new-years-day', 'NSW', '2027-01-01', 'New Year''s Day', '00:00', '00:00', true, 'https://www.nsw.gov.au/about-nsw/public-holidays'),
  ('nsw-2027-australia-day', 'NSW', '2027-01-26', 'Australia Day', '00:00', '00:00', true, 'https://www.nsw.gov.au/about-nsw/public-holidays'),
  ('nsw-2027-good-friday', 'NSW', '2027-03-26', 'Good Friday', '00:00', '00:00', true, 'https://www.nsw.gov.au/about-nsw/public-holidays'),
  ('nsw-2027-easter-saturday', 'NSW', '2027-03-27', 'Easter Saturday', '00:00', '00:00', true, 'https://www.nsw.gov.au/about-nsw/public-holidays'),
  ('nsw-2027-easter-sunday', 'NSW', '2027-03-28', 'Easter Sunday', '00:00', '00:00', true, 'https://www.nsw.gov.au/about-nsw/public-holidays'),
  ('nsw-2027-easter-monday', 'NSW', '2027-03-29', 'Easter Monday', '00:00', '00:00', true, 'https://www.nsw.gov.au/about-nsw/public-holidays'),
  ('nsw-2027-anzac-day', 'NSW', '2027-04-25', 'Anzac Day', '00:00', '00:00', true, 'https://www.nsw.gov.au/about-nsw/public-holidays'),
  ('nsw-2027-anzac-additional-day', 'NSW', '2027-04-26', 'Additional public holiday for Anzac Day', '00:00', '00:00', true, 'https://www.nsw.gov.au/about-nsw/public-holidays'),
  ('nsw-2027-kings-birthday', 'NSW', '2027-06-14', 'King''s Birthday', '00:00', '00:00', true, 'https://www.nsw.gov.au/about-nsw/public-holidays'),
  ('nsw-2027-labour-day', 'NSW', '2027-10-04', 'Labour Day', '00:00', '00:00', true, 'https://www.nsw.gov.au/about-nsw/public-holidays'),
  ('nsw-2027-christmas-day', 'NSW', '2027-12-25', 'Christmas Day', '00:00', '00:00', true, 'https://www.nsw.gov.au/about-nsw/public-holidays'),
  ('nsw-2027-boxing-day', 'NSW', '2027-12-26', 'Boxing Day', '00:00', '00:00', true, 'https://www.nsw.gov.au/about-nsw/public-holidays'),
  ('nsw-2027-christmas-additional-day', 'NSW', '2027-12-27', 'Additional public holiday for Christmas Day', '00:00', '00:00', true, 'https://www.nsw.gov.au/about-nsw/public-holidays'),
  ('nsw-2027-boxing-additional-day', 'NSW', '2027-12-28', 'Additional public holiday for Boxing Day', '00:00', '00:00', true, 'https://www.nsw.gov.au/about-nsw/public-holidays'),

  ('vic-2026-new-years-day', 'VIC', '2026-01-01', 'New Year''s Day', '00:00', '00:00', true, 'https://business.vic.gov.au/business-information/public-holidays/victorian-public-holidays-2026'),
  ('vic-2026-australia-day', 'VIC', '2026-01-26', 'Australia Day', '00:00', '00:00', true, 'https://business.vic.gov.au/business-information/public-holidays/victorian-public-holidays-2026'),
  ('vic-2026-labour-day', 'VIC', '2026-03-09', 'Labour Day', '00:00', '00:00', true, 'https://business.vic.gov.au/business-information/public-holidays/victorian-public-holidays-2026'),
  ('vic-2026-good-friday', 'VIC', '2026-04-03', 'Good Friday', '00:00', '00:00', true, 'https://business.vic.gov.au/business-information/public-holidays/victorian-public-holidays-2026'),
  ('vic-2026-easter-saturday', 'VIC', '2026-04-04', 'Saturday before Easter Sunday', '00:00', '00:00', true, 'https://business.vic.gov.au/business-information/public-holidays/victorian-public-holidays-2026'),
  ('vic-2026-easter-sunday', 'VIC', '2026-04-05', 'Easter Sunday', '00:00', '00:00', true, 'https://business.vic.gov.au/business-information/public-holidays/victorian-public-holidays-2026'),
  ('vic-2026-easter-monday', 'VIC', '2026-04-06', 'Easter Monday', '00:00', '00:00', true, 'https://business.vic.gov.au/business-information/public-holidays/victorian-public-holidays-2026'),
  ('vic-2026-anzac-day', 'VIC', '2026-04-25', 'Anzac Day', '00:00', '00:00', true, 'https://business.vic.gov.au/business-information/public-holidays/victorian-public-holidays-2026'),
  ('vic-2026-kings-birthday', 'VIC', '2026-06-08', 'King''s Birthday', '00:00', '00:00', true, 'https://business.vic.gov.au/business-information/public-holidays/victorian-public-holidays-2026'),
  ('vic-2026-afl-grand-final-friday', 'VIC', '2026-09-25', 'Friday before the AFL Grand Final', '00:00', '00:00', true, 'https://business.vic.gov.au/business-information/public-holidays/victorian-public-holidays-2026'),
  ('vic-2026-melbourne-cup', 'VIC', '2026-11-03', 'Melbourne Cup Day', '00:00', '00:00', true, 'https://business.vic.gov.au/business-information/public-holidays/victorian-public-holidays-2026'),
  ('vic-2026-christmas-day', 'VIC', '2026-12-25', 'Christmas Day', '00:00', '00:00', true, 'https://business.vic.gov.au/business-information/public-holidays/victorian-public-holidays-2026'),
  ('vic-2026-boxing-day', 'VIC', '2026-12-26', 'Boxing Day', '00:00', '00:00', true, 'https://business.vic.gov.au/business-information/public-holidays/victorian-public-holidays-2026'),
  ('vic-2026-boxing-additional-day', 'VIC', '2026-12-28', 'Additional public holiday for Boxing Day', '00:00', '00:00', true, 'https://business.vic.gov.au/business-information/public-holidays/victorian-public-holidays-2026'),
  ('vic-2027-new-years-day', 'VIC', '2027-01-01', 'New Year''s Day', '00:00', '00:00', true, 'https://business.vic.gov.au/business-information/public-holidays/victorian-public-holidays-2027'),
  ('vic-2027-australia-day', 'VIC', '2027-01-26', 'Australia Day', '00:00', '00:00', true, 'https://business.vic.gov.au/business-information/public-holidays/victorian-public-holidays-2027'),
  ('vic-2027-labour-day', 'VIC', '2027-03-08', 'Labour Day', '00:00', '00:00', true, 'https://business.vic.gov.au/business-information/public-holidays/victorian-public-holidays-2027'),
  ('vic-2027-good-friday', 'VIC', '2027-03-26', 'Good Friday', '00:00', '00:00', true, 'https://business.vic.gov.au/business-information/public-holidays/victorian-public-holidays-2027'),
  ('vic-2027-easter-saturday', 'VIC', '2027-03-27', 'Saturday before Easter Sunday', '00:00', '00:00', true, 'https://business.vic.gov.au/business-information/public-holidays/victorian-public-holidays-2027'),
  ('vic-2027-easter-sunday', 'VIC', '2027-03-28', 'Easter Sunday', '00:00', '00:00', true, 'https://business.vic.gov.au/business-information/public-holidays/victorian-public-holidays-2027'),
  ('vic-2027-easter-monday', 'VIC', '2027-03-29', 'Easter Monday', '00:00', '00:00', true, 'https://business.vic.gov.au/business-information/public-holidays/victorian-public-holidays-2027'),
  ('vic-2027-anzac-day', 'VIC', '2027-04-25', 'Anzac Day', '00:00', '00:00', true, 'https://business.vic.gov.au/business-information/public-holidays/victorian-public-holidays-2027'),
  ('vic-2027-kings-birthday', 'VIC', '2027-06-14', 'King''s Birthday', '00:00', '00:00', true, 'https://business.vic.gov.au/business-information/public-holidays/victorian-public-holidays-2027'),
  ('vic-2027-melbourne-cup', 'VIC', '2027-11-02', 'Melbourne Cup Day', '00:00', '00:00', true, 'https://business.vic.gov.au/business-information/public-holidays/victorian-public-holidays-2027'),
  ('vic-2027-christmas-day', 'VIC', '2027-12-25', 'Christmas Day', '00:00', '00:00', true, 'https://business.vic.gov.au/business-information/public-holidays/victorian-public-holidays-2027'),
  ('vic-2027-boxing-day', 'VIC', '2027-12-26', 'Boxing Day', '00:00', '00:00', true, 'https://business.vic.gov.au/business-information/public-holidays/victorian-public-holidays-2027'),
  ('vic-2027-christmas-additional-day', 'VIC', '2027-12-27', 'Additional public holiday for Christmas Day', '00:00', '00:00', true, 'https://business.vic.gov.au/business-information/public-holidays/victorian-public-holidays-2027'),
  ('vic-2027-boxing-additional-day', 'VIC', '2027-12-28', 'Additional public holiday for Boxing Day', '00:00', '00:00', true, 'https://business.vic.gov.au/business-information/public-holidays/victorian-public-holidays-2027'),

  ('qld-2026-new-years-day', 'QLD', '2026-01-01', 'New Year''s Day', '00:00', '00:00', true, 'https://www.qld.gov.au/recreation/travel/holidays/public'),
  ('qld-2026-australia-day', 'QLD', '2026-01-26', 'Australia Day', '00:00', '00:00', true, 'https://www.qld.gov.au/recreation/travel/holidays/public'),
  ('qld-2026-good-friday', 'QLD', '2026-04-03', 'Good Friday', '00:00', '00:00', true, 'https://www.qld.gov.au/recreation/travel/holidays/public'),
  ('qld-2026-easter-saturday', 'QLD', '2026-04-04', 'The day after Good Friday', '00:00', '00:00', true, 'https://www.qld.gov.au/recreation/travel/holidays/public'),
  ('qld-2026-easter-sunday', 'QLD', '2026-04-05', 'Easter Sunday', '00:00', '00:00', true, 'https://www.qld.gov.au/recreation/travel/holidays/public'),
  ('qld-2026-easter-monday', 'QLD', '2026-04-06', 'Easter Monday', '00:00', '00:00', true, 'https://www.qld.gov.au/recreation/travel/holidays/public'),
  ('qld-2026-anzac-day', 'QLD', '2026-04-25', 'Anzac Day', '00:00', '00:00', true, 'https://www.qld.gov.au/recreation/travel/holidays/public'),
  ('qld-2026-labour-day', 'QLD', '2026-05-04', 'Labour Day', '00:00', '00:00', true, 'https://www.qld.gov.au/recreation/travel/holidays/public'),
  ('qld-2026-kings-birthday', 'QLD', '2026-10-05', 'King''s Birthday', '00:00', '00:00', true, 'https://www.qld.gov.au/recreation/travel/holidays/public'),
  ('qld-2026-christmas-eve', 'QLD', '2026-12-24', 'Christmas Eve public holiday', '18:00', '00:00', false, 'https://www.qld.gov.au/recreation/travel/holidays/public'),
  ('qld-2026-christmas-day', 'QLD', '2026-12-25', 'Christmas Day', '00:00', '00:00', true, 'https://www.qld.gov.au/recreation/travel/holidays/public'),
  ('qld-2026-boxing-day', 'QLD', '2026-12-26', 'Boxing Day', '00:00', '00:00', true, 'https://www.qld.gov.au/recreation/travel/holidays/public'),
  ('qld-2026-boxing-additional-day', 'QLD', '2026-12-28', 'Additional public holiday for Boxing Day', '00:00', '00:00', true, 'https://www.qld.gov.au/recreation/travel/holidays/public'),
  ('qld-2027-new-years-day', 'QLD', '2027-01-01', 'New Year''s Day', '00:00', '00:00', true, 'https://www.qld.gov.au/recreation/travel/holidays/public'),
  ('qld-2027-australia-day', 'QLD', '2027-01-26', 'Australia Day', '00:00', '00:00', true, 'https://www.qld.gov.au/recreation/travel/holidays/public'),
  ('qld-2027-good-friday', 'QLD', '2027-03-26', 'Good Friday', '00:00', '00:00', true, 'https://www.qld.gov.au/recreation/travel/holidays/public'),
  ('qld-2027-easter-saturday', 'QLD', '2027-03-27', 'The day after Good Friday', '00:00', '00:00', true, 'https://www.qld.gov.au/recreation/travel/holidays/public'),
  ('qld-2027-easter-sunday', 'QLD', '2027-03-28', 'Easter Sunday', '00:00', '00:00', true, 'https://www.qld.gov.au/recreation/travel/holidays/public'),
  ('qld-2027-easter-monday', 'QLD', '2027-03-29', 'Easter Monday', '00:00', '00:00', true, 'https://www.qld.gov.au/recreation/travel/holidays/public'),
  ('qld-2027-anzac-day', 'QLD', '2027-04-26', 'Anzac Day public holiday', '00:00', '00:00', true, 'https://www.qld.gov.au/recreation/travel/holidays/public'),
  ('qld-2027-labour-day', 'QLD', '2027-05-03', 'Labour Day', '00:00', '00:00', true, 'https://www.qld.gov.au/recreation/travel/holidays/public'),
  ('qld-2027-kings-birthday', 'QLD', '2027-10-04', 'King''s Birthday', '00:00', '00:00', true, 'https://www.qld.gov.au/recreation/travel/holidays/public'),
  ('qld-2027-christmas-eve', 'QLD', '2027-12-24', 'Christmas Eve public holiday', '18:00', '00:00', false, 'https://www.qld.gov.au/recreation/travel/holidays/public'),
  ('qld-2027-christmas-day', 'QLD', '2027-12-25', 'Christmas Day', '00:00', '00:00', true, 'https://www.qld.gov.au/recreation/travel/holidays/public'),
  ('qld-2027-boxing-day', 'QLD', '2027-12-26', 'Boxing Day', '00:00', '00:00', true, 'https://www.qld.gov.au/recreation/travel/holidays/public'),
  ('qld-2027-christmas-additional-day', 'QLD', '2027-12-27', 'Additional public holiday for Christmas Day', '00:00', '00:00', true, 'https://www.qld.gov.au/recreation/travel/holidays/public'),
  ('qld-2027-boxing-additional-day', 'QLD', '2027-12-28', 'Additional public holiday for Boxing Day', '00:00', '00:00', true, 'https://www.qld.gov.au/recreation/travel/holidays/public')
on conflict (id) do update set
  state_code = excluded.state_code,
  holiday_date = excluded.holiday_date,
  holiday_name = excluded.holiday_name,
  start_time = excluded.start_time,
  end_time = excluded.end_time,
  is_all_day = excluded.is_all_day,
  source_url = excluded.source_url,
  active = true,
  updated_at = now();
