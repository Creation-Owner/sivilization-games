begin;

create table public.paddle_live_price_map (
  price_id text primary key,
  item_kind text not null
    check (item_kind in ('product', 'film_buy', 'film_rent')),
  item_id uuid not null,
  currency text not null,
  rental_seconds integer,
  enabled boolean not null default true,

  check (price_id like 'pri_%'),
  check (
    (item_kind = 'film_rent' and rental_seconds > 0)
    or
    (item_kind <> 'film_rent' and rental_seconds is null)
  )
);

create table public.paddle_live_processed_transactions (
  transaction_id text primary key,
  event_id text not null unique,
  user_id uuid not null references auth.users(id),
  processed_at timestamptz not null default now()
);

alter table public.paddle_live_price_map
  enable row level security;

alter table public.paddle_live_processed_transactions
  enable row level security;

revoke all on public.paddle_live_price_map
  from public, anon, authenticated;

revoke all on public.paddle_live_processed_transactions
  from public, anon, authenticated;

grant select on public.paddle_live_price_map to service_role;

grant select, insert on public.paddle_live_processed_transactions
  to service_role;

create function public.process_live_paddle_payment(p_event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  t jsonb := p_event -> 'data';
  line jsonb;
  m public.paddle_live_price_map%rowtype;
  v_user uuid;
  v_transaction text;
  v_event text;
  v_total bigint;
  v_currency text;
  v_paid_at timestamptz;
  v_expiry timestamptz;
  v_payment uuid;
  v_inserted integer;
  v_kind_count integer;
  v_line_count integer;
  v_payment_kind text;
  v_item_id uuid;
  v_seen_prices text[] := array[]::text[];
begin
  if p_event ->> 'event_type' <> 'transaction.completed'
     or t ->> 'status' <> 'completed' then
    raise exception 'Expected a completed transaction';
  end if;

  v_event := p_event ->> 'event_id';
  v_transaction := t ->> 'id';
  v_user := (t -> 'custom_data' ->> 'user_id')::uuid;
  v_currency := upper(t ->> 'currency_code');
  v_total := (t -> 'details' -> 'totals' ->> 'total')::bigint;

  if v_event is null or v_event not like 'evt_%'
     or v_transaction is null or v_transaction not like 'txn_%'
     or v_user is null
     or v_currency is null
     or v_total is null
     or v_total <= 0
     or v_total > 2147483647 then
    raise exception 'Invalid transaction fields';
  end if;

  if t ->> 'subscription_id' is not null then
    raise exception 'Recurring payments are not supported by this handler';
  end if;

  if jsonb_typeof(t -> 'items') is distinct from 'array' then
    raise exception 'Missing transaction items';
  end if;

  v_line_count := jsonb_array_length(t -> 'items');

  if v_line_count < 1 or v_line_count > 100 then
    raise exception 'Invalid item count';
  end if;

  perform 1 from auth.users where id = v_user;

  if not found then
    raise exception 'Unknown application user';
  end if;

  -- All fulfillment below is in the same database transaction.
  insert into public.paddle_live_processed_transactions (
    transaction_id, event_id, user_id
  )
  values (v_transaction, v_event, v_user)
  on conflict do nothing;

  get diagnostics v_inserted = row_count;

  if v_inserted = 0 then
    if exists (
      select 1
      from public.paddle_live_processed_transactions
      where transaction_id = v_transaction
        and user_id = v_user
    ) then
      return jsonb_build_object('duplicate', true);
    end if;

    raise exception 'Conflicting event identity';
  end if;

  -- Serialize this handler's entitlement writes for the same user.
  perform pg_advisory_xact_lock(
    hashtextextended(v_user::text, 0)
  );

  v_paid_at := (p_event ->> 'occurred_at')::timestamptz;

  if v_paid_at is null then
    raise exception 'Missing event timestamp';
  end if;

  -- Validate every paid price against the explicit live mapping.
  for line in select value from jsonb_array_elements(t -> 'items')
  loop
    if (line -> 'price' ->> 'id') is null then
      raise exception 'Missing line price ID';
    end if;

    if (line -> 'price' ->> 'id') = any(v_seen_prices) then
      raise exception 'Duplicate price line';
    end if;

    v_seen_prices := array_append(
      v_seen_prices, line -> 'price' ->> 'id'
    );

    if (line ->> 'quantity')::integer is distinct from 1 then
      raise exception
        'This digital entitlement handler requires quantity one';
    end if;

    if line -> 'price' ->> 'billing_cycle' is not null then
      raise exception 'Recurring price is not supported';
    end if;

    select * into m
    from public.paddle_live_price_map
    where price_id = line -> 'price' ->> 'id'
      and enabled
    for share;

    if not found then
      raise exception 'Unmapped or disabled live price';
    end if;

    if upper(m.currency) <> v_currency then
      raise exception 'Currency does not match the live mapping';
    end if;

    if m.item_kind = 'product' then
      perform 1 from public.products where id = m.item_id;
    else
      perform 1 from public.films where id = m.item_id;
    end if;

    if not found then
      raise exception 'Mapped application item does not exist';
    end if;
  end loop;

  -- Do not mix films and shop products in one checkout.
  select count(distinct item_kind)
  into v_kind_count
  from public.paddle_live_price_map
  where price_id = any(v_seen_prices);

  if v_kind_count <> 1 then
    raise exception 'Mixed purchase types are not supported';
  end if;

  select item_kind, item_id
  into v_payment_kind, v_item_id
  from public.paddle_live_price_map
  where price_id = v_seen_prices[1];

  if v_payment_kind <> 'product' and v_line_count <> 1 then
    raise exception 'Film checkout must contain exactly one film';
  end if;

  insert into public.payments (
    user_id,
    payment_type,
    item_id,
    amount_cents,
    currency,
    status,
    metadata
  )
  values (
    v_user,
    v_payment_kind,
    case when v_line_count = 1 then v_item_id else null end,
    v_total::integer,
    lower(v_currency),
    'paid',
    jsonb_build_object(
      'paddle_environment', 'production',
      'paddle_transaction_id', v_transaction,
      'paddle_event_id', v_event,
      'paddle_customer_id', t ->> 'customer_id'
    )
  )
  returning id into v_payment;

  for line in select value from jsonb_array_elements(t -> 'items')
  loop
    select * into strict m
    from public.paddle_live_price_map
    where price_id = line -> 'price' ->> 'id';

    if m.item_kind = 'product' then
      insert into public.product_purchases (
        user_id, product_id, payment_id
      )
      select v_user, m.item_id, v_payment
      where not exists (
        select 1
        from public.product_purchases
        where user_id = v_user and product_id = m.item_id
      );

    else
      v_expiry := case
        when m.item_kind = 'film_rent'
        then v_paid_at + make_interval(secs => m.rental_seconds)
        else null
      end;

      insert into public.purchases (
        user_id,
        film_id,
        purchase_type,
        price_cents,
        purchased_at,
        expires_at,
        paddle_transaction_id
      )
      values (
        v_user,
        m.item_id,
        case when m.item_kind = 'film_rent' then 'rent' else 'buy' end,
        v_total::integer,
        v_paid_at,
        v_expiry,
        v_transaction
      );

      -- Existing entitlement rows are deliberately not overwritten.
      insert into public.film_access (
        user_id, film_id, access_type, expires_at
      )
      select
        v_user,
        m.item_id,
        case
          when m.item_kind = 'film_rent' then 'rented'
          else 'purchased'
        end,
        v_expiry
      where not exists (
        select 1
        from public.film_access
        where user_id = v_user and film_id = m.item_id
      );
    end if;
  end loop;

  return jsonb_build_object(
    'processed', true,
    'transaction_id', v_transaction,
    'payment_id', v_payment
  );
end;
$$;

revoke all on function public.process_live_paddle_payment(jsonb)
  from public, anon, authenticated;

grant execute on function public.process_live_paddle_payment(jsonb)
  to service_role;
create policy "Owners read complimentary access"
on public.owner_complimentary_access
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and is_owner is true
  )
);
commit;