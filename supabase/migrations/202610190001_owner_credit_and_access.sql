begin;

-- A shared request ledger makes retries idempotent.
-- Reuse a request ID only for the exact same operation.
create table public.owner_management_requests (
  request_id uuid primary key,
  owner_id uuid not null references auth.users(id),
  target_user_id uuid not null references auth.users(id),
  operation text not null
    check (operation in ('wallet_credit', 'extend_access')),
  input jsonb not null,
  result jsonb,
  created_at timestamptz not null default now()
);

-- Manual access is separate from Paddle subscriptions.
create table public.owner_complimentary_access (
  user_id uuid primary key references auth.users(id),
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

alter table public.owner_management_requests
  enable row level security;

alter table public.owner_complimentary_access
  enable row level security;

-- No direct browser writes, including inserts, updates or truncation.
revoke all on table public.owner_management_requests
  from public, anon, authenticated;

revoke all on table public.owner_complimentary_access
  from public, anon, authenticated;

-- Users can read their own manual-access expiry.
grant select on public.owner_complimentary_access
  to authenticated;

create policy "Users read own complimentary access"
on public.owner_complimentary_access
for select
to authenticated
using (user_id = (select auth.uid()));


-- =========================================================
-- RPC: add internal wallet credit
-- Amounts are integer minor units: 500 means USD 5.00
-- under your current USD wallet convention.
-- =========================================================

create function public.owner_add_wallet_credit(
  p_target_user_id uuid,
  p_amount_cents integer,
  p_request_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_reason text := btrim(p_reason);
  v_input jsonb;
  v_previous public.owner_management_requests%rowtype;
  v_rows integer;
  v_before integer;
  v_after integer;
  v_result jsonb;
begin
  if v_actor is null then
    raise exception using
      errcode = '42501',
      message = 'Authentication required.';
  end if;

  -- Authorization is checked on the server, not from UI state.
  if not exists (
    select 1
    from public.profiles
    where id = v_actor
      and is_owner is true
  ) then
    raise exception using
      errcode = '42501',
      message = 'Owner access required.';
  end if;

  if p_target_user_id is null or p_request_id is null then
    raise exception 'Target user and request ID are required.';
  end if;

  -- Proposed per-request limit: USD 1,000.
  if p_amount_cents is null
     or p_amount_cents < 1
     or p_amount_cents > 100000 then
    raise exception
      'Credit must be between 1 and 100000 cents.';
  end if;

  if v_reason is null
     or char_length(v_reason) < 3
     or char_length(v_reason) > 500 then
    raise exception 'Reason must contain 3 to 500 characters.';
  end if;

  v_input := jsonb_build_object(
    'amount_cents', p_amount_cents,
    'reason', v_reason
  );

  insert into public.owner_management_requests (
    request_id,
    owner_id,
    target_user_id,
    operation,
    input
  )
  values (
    p_request_id,
    v_actor,
    p_target_user_id,
    'wallet_credit',
    v_input
  )
  on conflict (request_id) do nothing;

  get diagnostics v_rows = row_count;

  if v_rows = 0 then
    select *
    into strict v_previous
    from public.owner_management_requests
    where request_id = p_request_id;

    if v_previous.owner_id is distinct from v_actor
       or v_previous.target_user_id is distinct from p_target_user_id
       or v_previous.operation is distinct from 'wallet_credit'
       or v_previous.input is distinct from v_input then
      raise exception
        'Request ID was already used for a different operation.';
    end if;

    if v_previous.result is null then
      raise exception 'Previous request has no completed result.';
    end if;

    return v_previous.result ||
      jsonb_build_object('duplicate', true);
  end if;

  -- Lock the current balance so concurrent credits do not overwrite
  -- each other with stale browser-calculated values.
  select wallet_balance_cents
  into v_before
  from public.profiles
  where id = p_target_user_id
  for update;

  if not found then
    raise exception 'Target user profile does not exist.';
  end if;

  if v_before is null or v_before < 0 then
    raise exception 'Existing wallet balance is invalid.';
  end if;

  if v_before::bigint + p_amount_cents::bigint > 2147483647 then
    raise exception 'Credit would exceed the wallet storage limit.';
  end if;

  update public.profiles
  set wallet_balance_cents =
    wallet_balance_cents + p_amount_cents
  where id = p_target_user_id
  returning wallet_balance_cents into v_after;

  insert into public.owner_actions (
    owner_id,
    target_user_id,
    action,
    details
  )
  values (
    v_actor,
    p_target_user_id,
    'add_wallet_balance',
    jsonb_build_object(
      'request_id', p_request_id,
      'amount_cents', p_amount_cents,
      'balance_before_cents', v_before,
      'balance_after_cents', v_after,
      'reason', v_reason,
      'source', 'owner_rpc'
    )
  );

  v_result := jsonb_build_object(
    'user_id', p_target_user_id,
    'amount_cents', p_amount_cents,
    'wallet_balance_cents', v_after,
    'request_id', p_request_id,
    'duplicate', false
  );

  update public.owner_management_requests
  set result = v_result
  where request_id = p_request_id;

  return v_result;
end;
$$;


-- =========================================================
-- RPC: extend complimentary access
-- This does not create or change a Paddle subscription.
-- =========================================================

create function public.owner_extend_access(
  p_target_user_id uuid,
  p_days integer,
  p_request_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_reason text := btrim(p_reason);
  v_input jsonb;
  v_previous public.owner_management_requests%rowtype;
  v_rows integer;
  v_before timestamptz;
  v_after timestamptz;
  v_now timestamptz;
  v_result jsonb;
begin
  if v_actor is null then
    raise exception using
      errcode = '42501',
      message = 'Authentication required.';
  end if;

  if not exists (
    select 1
    from public.profiles
    where id = v_actor
      and is_owner is true
  ) then
    raise exception using
      errcode = '42501',
      message = 'Owner access required.';
  end if;

  if p_target_user_id is null or p_request_id is null then
    raise exception 'Target user and request ID are required.';
  end if;

  -- Proposed per-request limit: one year.
  if p_days is null or p_days < 1 or p_days > 365 then
    raise exception 'Days must be an integer between 1 and 365.';
  end if;

  if v_reason is null
     or char_length(v_reason) < 3
     or char_length(v_reason) > 500 then
    raise exception 'Reason must contain 3 to 500 characters.';
  end if;

  v_input := jsonb_build_object(
    'days', p_days,
    'reason', v_reason
  );

  insert into public.owner_management_requests (
    request_id,
    owner_id,
    target_user_id,
    operation,
    input
  )
  values (
    p_request_id,
    v_actor,
    p_target_user_id,
    'extend_access',
    v_input
  )
  on conflict (request_id) do nothing;

  get diagnostics v_rows = row_count;

  if v_rows = 0 then
    select *
    into strict v_previous
    from public.owner_management_requests
    where request_id = p_request_id;

    if v_previous.owner_id is distinct from v_actor
       or v_previous.target_user_id is distinct from p_target_user_id
       or v_previous.operation is distinct from 'extend_access'
       or v_previous.input is distinct from v_input then
      raise exception
        'Request ID was already used for a different operation.';
    end if;

    if v_previous.result is null then
      raise exception 'Previous request has no completed result.';
    end if;

    return v_previous.result ||
      jsonb_build_object('duplicate', true);
  end if;

  -- Use the target profile as the serialization lock, including
  -- when no complimentary-access record exists yet.
  perform 1
  from public.profiles
  where id = p_target_user_id
  for update;

  if not found then
    raise exception 'Target user profile does not exist.';
  end if;

  select expires_at
  into v_before
  from public.owner_complimentary_access
  where user_id = p_target_user_id
  for update;

  v_now := clock_timestamp();

  -- Extend the unexpired manual grant, otherwise start now.
  -- Each day here means 24 hours.
  v_after :=
    greatest(coalesce(v_before, v_now), v_now)
    + p_days * interval '24 hours';

  insert into public.owner_complimentary_access (
    user_id,
    expires_at,
    updated_at
  )
  values (
    p_target_user_id,
    v_after,
    v_now
  )
  on conflict (user_id)
  do update set
    expires_at = excluded.expires_at,
    updated_at = excluded.updated_at;

  insert into public.owner_actions (
    owner_id,
    target_user_id,
    action,
    details
  )
  values (
    v_actor,
    p_target_user_id,
    'extend_complimentary_access',
    jsonb_build_object(
      'request_id', p_request_id,
      'days', p_days,
      'expires_before', v_before,
      'expires_after', v_after,
      'reason', v_reason,
      'source', 'owner_rpc'
    )
  );

  v_result := jsonb_build_object(
    'user_id', p_target_user_id,
    'complimentary_expires_at', v_after,
    'request_id', p_request_id,
    'duplicate', false
  );

  update public.owner_management_requests
  set result = v_result
  where request_id = p_request_id;

  return v_result;
end;
$$;


-- Only signed-in callers may invoke these functions.
-- Each function additionally requires profiles.is_owner = true.

revoke all on function public.owner_add_wallet_credit(
  uuid, integer, uuid, text
) from public, anon, authenticated, service_role;

grant execute on function public.owner_add_wallet_credit(
  uuid, integer, uuid, text
) to authenticated;

revoke all on function public.owner_extend_access(
  uuid, integer, uuid, text
) from public, anon, authenticated, service_role;

grant execute on function public.owner_extend_access(
  uuid, integer, uuid, text
) to authenticated;

commit;