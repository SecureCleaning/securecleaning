begin;

-- These legacy tables have no public browser consumers in the application.
-- Revoke column grants too: table-level REVOKE does not remove column ACLs.
revoke all on public.ai_chat_sessions, public.owner_operators, public.owner_operator_ratings from public, anon, authenticated;
revoke insert on public.quotes from public, anon, authenticated;
do $$
declare c record;
begin
  for c in select table_name,column_name from information_schema.columns
    where table_schema='public' and table_name in ('ai_chat_sessions','owner_operators','owner_operator_ratings')
  loop
    execute format('revoke all (%I) on public.%I from public, anon, authenticated',c.column_name,c.table_name);
  end loop;
  for c in select column_name from information_schema.columns where table_schema='public' and table_name='quotes'
  loop
    execute format('revoke insert (%I) on public.quotes from public, anon, authenticated',c.column_name);
  end loop;
end $$;
drop policy if exists "Users access own chat by token" on public.ai_chat_sessions;
drop policy if exists "Anon can create chat session" on public.ai_chat_sessions;
drop policy if exists "Anon can insert quotes" on public.quotes;
drop policy if exists "Public can view active operators" on public.owner_operators;
drop policy if exists "Public read public ratings" on public.owner_operator_ratings;
-- Retain service grants and authenticated quote-read policy unchanged.

alter table public.cleaner_emails add column if not exists individual_delivery_key text;
alter table public.cleaner_emails add column if not exists individual_draft_fingerprint text;
create unique index if not exists cleaner_emails_individual_delivery_key_idx
  on public.cleaner_emails(individual_delivery_key) where individual_delivery_key is not null;
create unique index if not exists cleaner_emails_individual_unresolved_draft_idx
  on public.cleaner_emails(individual_draft_fingerprint)
  where individual_draft_fingerprint is not null and delivery_outcome in ('sending','unknown');

create or replace function public.consume_public_rate_limit(p_policy text,p_subject text,p_limit integer,p_window_ms integer)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare
  clock_now timestamptz;
  bucket public.public_rate_buckets%rowtype;
  shared public.public_rate_buckets%rowtype;
  bucket_key text;
begin
  if p_policy is null or p_subject is null or p_limit is null or p_window_ms is null
    or p_limit < 1 or p_limit > 10000 or p_window_ms < 1000 or p_window_ms > 86400000
    or length(p_policy) not between 1 and 100 or p_subject !~ '^[a-f0-9]{24}$' then
    raise exception 'Invalid rate policy';
  end if;
  -- One transaction lock makes subject eligibility, shared capacity, and new-key
  -- admission atomic. No rejected subject can increment the accepted-work budget.
  perform pg_advisory_xact_lock(734921065);
  clock_now := clock_timestamp();
  delete from public.public_rate_buckets where key in (
    select key from public.public_rate_buckets where expires_at <= clock_now and key <> 'global'
    order by expires_at limit 1000
  );
  bucket_key := p_policy || ':' || p_subject;
  select * into bucket from public.public_rate_buckets where key=bucket_key for update;
  if found and bucket.expires_at > clock_now and bucket.hits >= p_limit then
    return jsonb_build_object('allowed',false,'retry_after',greatest(1,ceil(extract(epoch from bucket.expires_at-clock_now))));
  end if;
  if bucket.key is null and (select count(*) from public.public_rate_buckets)
    + (case when exists(select 1 from public.public_rate_buckets where key='global') then 0 else 1 end) >= 100000 then
    return jsonb_build_object('allowed',false,'retry_after',60);
  end if;
  insert into public.public_rate_buckets(key,hits,expires_at) values('global',0,clock_now+interval '1 minute')
    on conflict(key) do update set hits=case when public_rate_buckets.expires_at <= clock_now then 0 else public_rate_buckets.hits end,
      expires_at=case when public_rate_buckets.expires_at <= clock_now then clock_now+interval '1 minute' else public_rate_buckets.expires_at end
    returning * into shared;
  if shared.hits >= 1000 then
    return jsonb_build_object('allowed',false,'retry_after',greatest(1,ceil(extract(epoch from shared.expires_at-clock_now))));
  end if;
  insert into public.public_rate_buckets(key,hits,expires_at) values(bucket_key,1,clock_now+p_window_ms*interval '1 millisecond')
    on conflict(key) do update set hits=case when public_rate_buckets.expires_at <= clock_now then 1 else public_rate_buckets.hits+1 end,
      expires_at=case when public_rate_buckets.expires_at <= clock_now then clock_now+p_window_ms*interval '1 millisecond' else public_rate_buckets.expires_at end
    returning * into bucket;
  update public.public_rate_buckets set hits=hits+1 where key='global';
  return jsonb_build_object('allowed',true,'retry_after',greatest(1,ceil(extract(epoch from bucket.expires_at-clock_now))));
end $$;
revoke all on function public.consume_public_rate_limit(text,text,integer,integer) from public,anon,authenticated;
grant execute on function public.consume_public_rate_limit(text,text,integer,integer) to service_role;
-- Enforce storage bounds through every server write/RPC without invalidating
-- untouched legacy documents during unrelated quote updates.
create or replace function public.enforce_quote_document_bounds()
returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin
  if TG_OP='INSERT' or NEW.inspection_report is distinct from OLD.inspection_report then
    if octet_length(NEW.inspection_report::text)>131072 then raise exception 'Inspection document exceeds size limit'; end if;
  end if;
  if TG_OP='INSERT' or NEW.firm_quote_workflow is distinct from OLD.firm_quote_workflow then
    if octet_length(NEW.firm_quote_workflow::text)>524288 then raise exception 'Quote workflow exceeds size limit'; end if;
  end if;
  if TG_OP='INSERT' or NEW.final_quote_document is distinct from OLD.final_quote_document then
    if octet_length(NEW.final_quote_document::text)>1048576 then raise exception 'Final quote document exceeds size limit'; end if;
  end if;
  return NEW;
end $$;
revoke all on function public.enforce_quote_document_bounds() from public,anon,authenticated;
grant execute on function public.enforce_quote_document_bounds() to service_role;
drop trigger if exists enforce_quote_document_bounds on public.quotes;
create trigger enforce_quote_document_bounds before insert or update of inspection_report,firm_quote_workflow,final_quote_document
  on public.quotes for each row execute function public.enforce_quote_document_bounds();
commit;
