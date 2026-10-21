begin;

create or replace function public.owner_add_wallet_credit(
  p_target_user_id uuid,
  p_amount_cents integer,
  p_request_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid := auth.uid();
  v_current_balance integer;
  v_new_balance integer;
  v_existing_request jsonb;
begin
  if v_owner is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1
    from public.profiles
    where id = v_owner
      and is_owner is true
  ) then
    raise exception 'Owner permission required';
  end if;

  if p_target_user_id is null
     or p_amount_cents is null
     or p_request_id is null
     or p_reason is null then
    raise exception 'Missing required arguments';
  end if;

  if not exists (
    select 1
    from auth.users
    where id = p_target_user_id
  ) then
    raise exception 'Target user does not exist';
  end if;

  if p_amount_cents < 1 or p_amount_cents > 100000 then
    raise exception 'Amount must be between 1 and 100000 cents';
  end if;

  if length(btrim(p_reason)) < 3
     or length(btrim(p_reason)) > 500 then
    raise exception 'Reason must contain 3 to 500 characters';
  end if;

  -- If this exact request was already processed, return its recorded result.
  select details
  into v_existing_request
  from public.owner_actions
  where owner_id = v_owner
    and target_user_id = p_target_user_id
    and action = 'add_wallet_credit'
    and details ->> 'request_id' = p_request_id::text
  limit 1;

  if v_existing_request is not null then
    select wallet_balance_cents
    into v_new_balance
    from public.profiles
    where id = p_target_user_id;

    return jsonb_build_object(
      'user_id', p_target_user_id,
      'wallet_balance_cents', v_new_balance,
      'duplicate', true
    );
  end if;

  -- Lock the target profile so concurrent credits cannot lose an update.
  select wallet_balance_cents
  into v_current_balance
  from public.profiles
  where id = p_target_user_id
  for update;

  if v_current_balance is null then
    raise exception 'Target profile does not exist';
  end if;

  v_new_balance := v_current_balance + p_amount_cents;

  if v_new_balance < 0 or v_new_balance > 2147483647 then
    raise exception 'Resulting wallet balance is invalid';
  end if;

  update public.profiles
  set wallet_balance_cents = v_new_balance
  where id = p_target_user_id;

  insert into public.owner_actions
    (owner_id, target_user_id, action, details)
  values
    (
      v_owner,
      p_target_user_id,
      'add_wallet_credit',
      jsonb_build_object(
        'request_id', p_request_id,
        'amount_cents', p_amount_cents,
        'previous_balance_cents', v_current_balance,
        'new_balance_cents', v_new_balance,
        'reason', btrim(p_reason)
      )
    );

  return jsonb_build_object(
    'user_id', p_target_user_id,
    'wallet_balance_cents', v_new_balance,
    'duplicate', false
  );
end;
$$;

revoke all on function public.owner_add_wallet_credit(
  uuid, integer, uuid, text
)
from public, anon, authenticated;

grant execute on function public.owner_add_wallet_credit(
  uuid, integer, uuid, text
)
to authenticated;

commit;