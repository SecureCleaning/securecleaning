-- Apply before the application cutover, during a controlled write pause.
-- No production values are embedded. Existing private configuration is moved transactionally.
begin;
alter table public.admin_staff_accounts add column if not exists session_version uuid not null default gen_random_uuid();
create or replace function public.revoke_changed_staff_sessions() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin
  if (new.username,new.password_hash,new.legacy_password_hash,new.role,new.active,new.availability_assignee_id)
      is distinct from (old.username,old.password_hash,old.legacy_password_hash,old.role,old.active,old.availability_assignee_id) then
    new.session_version := gen_random_uuid();
  end if;
  return new;
end $$;
revoke all on function public.revoke_changed_staff_sessions() from public,anon,authenticated;
grant execute on function public.revoke_changed_staff_sessions() to service_role;
drop trigger if exists revoke_changed_staff_sessions on public.admin_staff_accounts;
create trigger revoke_changed_staff_sessions before update on public.admin_staff_accounts for each row execute function public.revoke_changed_staff_sessions();
create table if not exists public.availability_private_config (like public.site_content including all);
alter table public.availability_private_config enable row level security;
revoke all on public.availability_private_config from public, anon, authenticated;
grant select, insert, update, delete on public.availability_private_config to service_role;
drop policy if exists service_only on public.availability_private_config;
create policy service_only on public.availability_private_config for all to service_role using (true) with check (true);
insert into public.availability_private_config select * from public.site_content where key = 'availability.config'
on conflict (key) do nothing;
delete from public.site_content where key = 'availability.config';
-- Remove every public policy, including any additional permissive policy, before allowlisting.
do $$ declare item record; begin
  for item in select policyname from pg_policies where schemaname='public' and tablename='site_content'
    and roles && array['public','anon','authenticated']::name[]
  loop execute format('drop policy %I on public.site_content', item.policyname); end loop;
end $$;
revoke all on public.site_content from public, anon, authenticated;
grant select on public.site_content to anon, authenticated;
create policy marketing_content_only on public.site_content for select to anon, authenticated
using (key in (
  'home.hero_badge',
  'home.hero_title',
  'home.hero_subtitle',
  'home.cta_primary_label',
  'home.cta_secondary_label',
  'home.trust_1',
  'home.trust_2',
  'home.trust_3',
  'home.trust_4',
  'home.how_title',
  'home.how_subtitle',
  'home.step_1_title',
  'home.step_1_desc',
  'home.step_2_title',
  'home.step_2_desc',
  'home.step_3_title',
  'home.step_3_desc',
  'home.how_cta_label',
  'home.why_title',
  'home.why_subtitle',
  'home.benefit_1_title',
  'home.benefit_1_desc',
  'home.benefit_2_title',
  'home.benefit_2_desc',
  'home.benefit_3_title',
  'home.benefit_3_desc',
  'home.benefit_4_title',
  'home.benefit_4_desc',
  'home.benefit_5_title',
  'home.benefit_5_desc',
  'home.benefit_6_title',
  'home.benefit_6_desc',
  'home.premises_title',
  'home.premises_subtitle',
  'home.cities_title',
  'home.cities_subtitle',
  'home.city_melbourne_desc',
  'home.city_melbourne_label',
  'home.city_sydney_desc',
  'home.city_sydney_label',
  'home.testimonials_title',
  'home.testimonials_subtitle',
  'home.testimonial_1_name',
  'home.testimonial_1_business',
  'home.testimonial_1_city',
  'home.testimonial_1_quote',
  'home.testimonial_2_name',
  'home.testimonial_2_business',
  'home.testimonial_2_city',
  'home.testimonial_2_quote',
  'home.testimonial_3_name',
  'home.testimonial_3_business',
  'home.testimonial_3_city',
  'home.testimonial_3_quote',
  'home.bottom_cta_title',
  'home.bottom_cta_body',
  'home.bottom_cta_primary_label',
  'home.bottom_cta_secondary_label',
  'about.hero_title',
  'about.hero_subtitle',
  'about.section_1_title',
  'about.intro',
  'about.section_1_paragraph_2',
  'about.section_1_paragraph_3',
  'about.section_2_title',
  'about.section_2_intro',
  'about.model_point_1',
  'about.model_point_2',
  'about.model_point_3',
  'about.model_point_4',
  'about.section_3_title',
  'about.section_3_intro',
  'about.standard_1',
  'about.standard_2',
  'about.standard_3',
  'about.standard_4',
  'about.standard_5',
  'about.standard_6',
  'about.section_4_title',
  'about.section_4_body',
  'about.section_5_title',
  'about.section_5_body',
  'about.bottom_cta_title',
  'about.bottom_cta_primary_label',
  'about.bottom_cta_secondary_label',
  'contact.hero_title',
  'contact.hero_subtitle',
  'contact.card_title',
  'contact.email_label',
  'contact.email',
  'contact.email_note',
  'contact.phone_label',
  'contact.phone',
  'contact.phone_note',
  'contact.service_areas_label',
  'contact.service_areas',
  'contact.hours_label',
  'contact.hours',
  'contact.hours_note',
  'contact.quick_links_title',
  'contact.quick_link_1',
  'contact.quick_link_2',
  'contact.quick_link_3',
  'contact.quick_link_4',
  'contact.form_title',
  'contact.form_note',
  'contact.form_button_label',
  'contact.bottom_banner_title',
  'contact.bottom_banner_body',
  'faq.heading',
  'faq.intro',
  'faq.item_1_question',
  'faq.item_1_answer',
  'faq.item_2_question',
  'faq.item_2_answer',
  'faq.item_3_question',
  'faq.item_3_answer',
  'faq.item_4_question',
  'faq.item_4_answer',
  'faq.item_5_question',
  'faq.item_5_answer',
  'faq.item_6_question',
  'faq.item_6_answer',
  'faq.item_7_question',
  'faq.item_7_answer',
  'faq.item_8_question',
  'faq.item_8_answer',
  'faq.item_9_question',
  'faq.item_9_answer',
  'faq.item_10_question',
  'faq.item_10_answer',
  'faq.recurring_cleaning_question',
  'faq.recurring_cleaning_answer',
  'faq.item_12_question',
  'faq.item_12_answer',
  'faq.item_13_question',
  'faq.item_13_answer',
  'faq.item_14_question',
  'faq.item_14_answer',
  'faq.cta_heading',
  'faq.cta_body',
  'faq.cta_primary_label',
  'faq.cta_secondary_label',
  'services.hero_title',
  'services.hero_subtitle',
  'services.hero_cta_label',
  'services.item_1_title',
  'services.item_1_description',
  'services.item_1_features',
  'services.item_1_multiplier',
  'services.item_2_title',
  'services.item_2_description',
  'services.item_2_features',
  'services.item_2_multiplier',
  'services.item_3_title',
  'services.item_3_description',
  'services.item_3_features',
  'services.item_3_multiplier',
  'services.function_centres_title',
  'services.function_centres_description',
  'services.function_centres_features',
  'services.function_centres_multiplier',
  'services.item_5_title',
  'services.item_5_description',
  'services.item_5_features',
  'services.item_5_multiplier',
  'services.item_6_title',
  'services.item_6_description',
  'services.item_6_features',
  'services.item_6_multiplier',
  'services.sports_facilities_title',
  'services.sports_facilities_description',
  'services.sports_facilities_features',
  'services.sports_facilities_multiplier',
  'services.item_8_title',
  'services.item_8_description',
  'services.item_8_features',
  'services.item_8_multiplier',
  'services.bottom_cta_title',
  'services.bottom_cta_body',
  'services.bottom_cta_primary_label',
  'services.bottom_cta_secondary_label',
  'cities.hero_title',
  'cities.hero_subtitle',
  'cities.melbourne_desc',
  'cities.melbourne_label',
  'cities.sydney_desc',
  'cities.sydney_label',
  'melbourne.hero_title',
  'melbourne.hero_body',
  'melbourne.why_title',
  'melbourne.why_body_1',
  'melbourne.why_body_2',
  'melbourne.areas_title',
  'melbourne.areas_note',
  'melbourne.pricing_title',
  'melbourne.pricing_body',
  'melbourne.pricing_cta_label',
  'melbourne.services_title',
  'melbourne.chat_title',
  'melbourne.chat_body',
  'melbourne.bottom_cta_title',
  'melbourne.bottom_cta_primary_label',
  'melbourne.bottom_cta_secondary_label',
  'sydney.hero_title',
  'sydney.hero_body',
  'sydney.why_title',
  'sydney.why_body_1',
  'sydney.why_body_2',
  'sydney.areas_title',
  'sydney.areas_note',
  'sydney.pricing_title',
  'sydney.pricing_body',
  'sydney.pricing_cta_label',
  'sydney.services_title',
  'sydney.chat_title',
  'sydney.chat_body',
  'sydney.bottom_cta_title',
  'sydney.bottom_cta_primary_label',
  'sydney.bottom_cta_secondary_label',
  'quote.hero_title',
  'quote.hero_subtitle',
  'quote.result_not_found_title',
  'quote.result_not_found_body',
  'quote.result_not_found_cta_label',
  'booking.hero_title',
  'booking.hero_subtitle',
  'booking.confirm_not_found_title',
  'booking.confirm_not_found_body',
  'booking.confirm_not_found_cta_label',
  'booking.confirm_title',
  'booking.confirm_reference_prefix',
  'booking.confirm_email_prefix',
  'booking.summary_title',
  'booking.next_title',
  'booking.next_step_1',
  'booking.next_step_2_template',
  'booking.next_step_3',
  'booking.next_step_4',
  'booking.next_step_5',
  'booking.bottom_primary_label',
  'booking.bottom_secondary_label'
));

create table if not exists public.quote_capabilities (
  token_hash text primary key check (token_hash ~ '^[a-f0-9]{64}$'),
  quote_id uuid not null references public.quotes(id) on delete cascade,
  purpose text not null check (purpose in ('document','booking')),
  variant text not null check (variant in ('remote_review','final')),
  document_version integer not null default 0,
  document_fingerprint text,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  consumed_at timestamptz,
  consumed_booking_id uuid references public.bookings(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.quote_capabilities enable row level security;
revoke all on public.quote_capabilities from public, anon, authenticated;
grant select, insert, update, delete on public.quote_capabilities to service_role;
drop policy if exists service_only on public.quote_capabilities;
create policy service_only on public.quote_capabilities for all to service_role using (true) with check (true);
create index if not exists quote_capabilities_quote_idx on public.quote_capabilities(quote_id);

create table if not exists public.booking_security_outbox (
  booking_id uuid primary key references public.bookings(id) on delete cascade,
  email_state text not null default 'pending' check (email_state in ('pending','sent','review_required')),
  calendar_state text not null default 'pending' check (calendar_state in ('pending','sent','review_required')),
  created_at timestamptz not null default now()
);
alter table public.booking_security_outbox enable row level security;
revoke all on public.booking_security_outbox from public, anon, authenticated;
grant select, insert, update, delete on public.booking_security_outbox to service_role;
drop policy if exists service_only on public.booking_security_outbox;
create policy service_only on public.booking_security_outbox for all to service_role using (true) with check (true);

create or replace function public.create_authorized_quote_booking(p_token_hash text, p_quote_ref text, p_booking jsonb)
returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare cap public.quote_capabilities%rowtype; q public.quotes%rowtype; b public.bookings%rowtype; site_uuid uuid; i jsonb;
begin
  select * into cap from public.quote_capabilities where token_hash=p_token_hash for update;
  if not found or cap.purpose <> 'booking' or cap.variant <> 'remote_review' or cap.revoked_at is not null or cap.expires_at <= now() then
    raise exception 'Quote booking access unavailable' using errcode='42501';
  end if;
  select * into q from public.quotes where id=cap.quote_id and quote_ref=p_quote_ref for update;
  if not found or q.client_id is null then raise exception 'Quote booking access unavailable' using errcode='42501'; end if;
  i := p_booking->'inputs';
  if lower(trim(coalesce(i->>'email',''))) <> lower(trim(coalesce(q.inputs->>'email','')))
     or length(regexp_replace(coalesce(i->>'phone',''), '[^0-9]', '', 'g')) < 8
     or length(regexp_replace(coalesce(q.inputs->>'phone',''), '[^0-9]', '', 'g')) < 8
     or regexp_replace(regexp_replace(i->>'phone', '[^0-9]', '', 'g'), '^61', '0')
       <> regexp_replace(regexp_replace(q.inputs->>'phone', '[^0-9]', '', 'g'), '^61', '0')
  then raise exception 'Quote contact mismatch' using errcode='42501'; end if;
  select * into b from public.bookings where quote_id=q.id order by created_at limit 1;
  if found then
    update public.quote_capabilities set consumed_booking_id=b.id, consumed_at=coalesce(consumed_at,now()) where token_hash=p_token_hash;
    return jsonb_build_object('id',b.id,'booking_ref',b.booking_ref,'site_id',b.site_id,'created',false);
  end if;
  if cap.consumed_at is not null then raise exception 'Quote booking access unavailable' using errcode='42501'; end if;
  select id into site_uuid from public.sites where client_id=q.client_id and city=(i->>'city')::public.city_type and is_active
    and lower(trim(address))=lower(trim(i->>'address')) and coalesce(postcode,'')=coalesce(i->>'postcode','') order by created_at limit 1;
  if site_uuid is null then
    insert into public.sites(client_id,site_name,address,suburb,postcode,city,premises_type,floor_area,access_notes,is_active)
      values(q.client_id,coalesce(nullif(i->>'businessName',''),i->>'contactName'),i->>'address',i->>'suburb',i->>'postcode',(i->>'city')::public.city_type,
        (i->>'premisesType')::public.premises_type,nullif(i->>'floorArea','')::numeric,i->>'notes',true) returning id into site_uuid;
  end if;
  insert into public.bookings(booking_ref,quote_id,client_id,site_id,assigned_operator_id,inputs,status,inspection_status,inspection_scheduled_for,first_clean_date,recurring_schedule)
    values(p_booking->>'booking_ref',q.id,q.client_id,site_uuid,nullif(p_booking->>'assigned_operator_id','')::uuid,i,'pending',
      p_booking->>'inspection_status',nullif(p_booking->>'inspection_scheduled_for','')::timestamptz,
      (p_booking->>'first_clean_date')::date,p_booking->'recurring_schedule') returning * into b;
  update public.quotes set status='accepted' where id=q.id;
  update public.quote_capabilities set consumed_booking_id=b.id, consumed_at=coalesce(consumed_at,now()) where token_hash=p_token_hash;
  insert into public.booking_security_outbox(booking_id) values(b.id);
  return jsonb_build_object('id',b.id,'booking_ref',b.booking_ref,'site_id',site_uuid,'created',true);
end $$;
revoke all on function public.create_authorized_quote_booking(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.create_authorized_quote_booking(text,text,jsonb) to service_role;

create table if not exists public.public_rate_buckets (
  key text primary key,
  hits integer not null,
  expires_at timestamptz not null
);
create index if not exists public_rate_buckets_expiry_idx on public.public_rate_buckets(expires_at);
alter table public.public_rate_buckets enable row level security;
revoke all on public.public_rate_buckets from public,anon,authenticated;
grant select,insert,update,delete on public.public_rate_buckets to service_role;
drop policy if exists service_only on public.public_rate_buckets;
create policy service_only on public.public_rate_buckets for all to service_role using(true) with check(true);
create or replace function public.consume_public_rate_limit(p_policy text,p_subject text,p_limit integer,p_window_ms integer)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare clock_now timestamptz := clock_timestamp(); bucket public.public_rate_buckets%rowtype; bucket_key text; global_hits integer;
begin
  if p_limit < 1 or p_limit > 10000 or p_window_ms < 1000 or p_window_ms > 86400000 or length(p_policy)>100 or p_subject !~ '^[a-f0-9]{24}$' then
    raise exception 'Invalid rate policy';
  end if;
  -- Global minute budget bounds new identities and paid side effects across all instances.
  insert into public.public_rate_buckets(key,hits,expires_at) values('global',1,clock_now+interval '1 minute')
    on conflict(key) do update set hits=case when public_rate_buckets.expires_at <= clock_now then 1 else public_rate_buckets.hits+1 end,
      expires_at=case when public_rate_buckets.expires_at <= clock_now then clock_now+interval '1 minute' else public_rate_buckets.expires_at end
    returning hits into global_hits;
  if global_hits > 1000 then return jsonb_build_object('allowed',false,'retry_after',60); end if;
  delete from public.public_rate_buckets where expires_at <= clock_now and key <> 'global';
  if (select count(*) from public.public_rate_buckets) >= 100000 then return jsonb_build_object('allowed',false,'retry_after',60); end if;
  bucket_key := p_policy || ':' || p_subject;
  insert into public.public_rate_buckets(key,hits,expires_at) values(bucket_key,1,clock_now + p_window_ms * interval '1 millisecond')
    on conflict(key) do update set hits=least(public_rate_buckets.hits+1,p_limit+1)
    returning * into bucket;
  return jsonb_build_object('allowed',bucket.hits <= p_limit,'retry_after',greatest(1,ceil(extract(epoch from bucket.expires_at-clock_now))));
end $$;
revoke all on function public.consume_public_rate_limit(text,text,integer,integer) from public,anon,authenticated;
grant execute on function public.consume_public_rate_limit(text,text,integer,integer) to service_role;
commit;
