-- =====================================================================
-- BREMAT – Valk robot heti karbantartási lap: adatbázis
--
-- Hol futtasd: Supabase → SQL Editor, a BREMAT (Valk napló) projektben.
-- Futtatás előtt nézd meg bal felül a projektválasztóban, hogy a jó
-- projekt van-e kiválasztva.
--
-- Többször is futtatható: a már meglévő elemeket nem rontja el, adatot nem
-- töröl. Minden tábla és függvény "km_" előtagot kap, így nem ütközik a
-- projekt többi táblájával.
--
-- Biztonsági modell:
--   * A táblákat a böngésző közvetlenül nem éri el (RLS be, policy nincs,
--     jogosultság visszavonva).
--   * Minden olvasás és írás az alábbi km_* függvényeken megy át, és
--     mindegyik ellenőrzi a hozzáférési kódot (a kód csak hash-ként van
--     tárolva).
--   * Beküldött lapot módosítani vagy törölni a felületről nem lehet;
--     a műszakvezetői jóváhagyás csak egyszer írható be.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------
-- 1. Hozzáférési kód (egyetlen sor, csak a hash-e tárolódik)
-- ---------------------------------------------------------------------
create table if not exists public.km_access (
  id         int primary key default 1 check (id = 1),
  code_hash  text not null,
  created_at timestamptz not null default now()
);
alter table public.km_access enable row level security;
revoke all on table public.km_access from anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. Kitöltött heti lapok
-- ---------------------------------------------------------------------
create table if not exists public.km_checks (
  id                    uuid primary key default gen_random_uuid(),
  created_at            timestamptz not null default now(),
  check_date            date not null,
  iso_year              int  not null,
  iso_week              int  not null,
  robot                 text not null,
  inspector             text not null,
  items                 jsonb not null,
  action_count          int  not null default 0,
  cooling_water_changed date,
  gas_flow_lpm          numeric(5,1),
  remarks               text,
  parts_used            text,
  escalate              boolean not null default false,
  escalate_to           text,
  approved_by           text,
  approved_at           timestamptz
);
create index if not exists km_checks_week_idx on public.km_checks (robot, iso_year, iso_week);
create index if not exists km_checks_date_idx on public.km_checks (check_date desc, created_at desc);
alter table public.km_checks enable row level security;
revoke all on table public.km_checks from anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. Belső segédfüggvények (kívülről nem hívhatók)
-- ---------------------------------------------------------------------
create or replace function public.km__hash(p_code text)
returns text
language sql immutable
set search_path = public, extensions
as $$
  select encode(extensions.digest(upper(regexp_replace(coalesce(p_code, ''), '[^0-9A-Za-z]', '', 'g')), 'sha256'), 'hex')
$$;

create or replace function public.km__check_code(p_code text)
returns void
language plpgsql security definer
set search_path = public, extensions
as $$
begin
  if not exists (select 1 from public.km_access where code_hash = public.km__hash(p_code)) then
    raise exception 'Hibás hozzáférési kód' using errcode = '28000';
  end if;
end
$$;

create or replace function public.km__text(p_value jsonb, p_max int)
returns text
language sql immutable
as $$
  select nullif(left(btrim(coalesce(p_value #>> '{}', '')), p_max), '')
$$;

revoke all on function public.km__hash(text) from public, anon, authenticated;
revoke all on function public.km__check_code(text) from public, anon, authenticated;
revoke all on function public.km__text(jsonb, int) from public, anon, authenticated;

-- Új hozzáférési kód: a régit érvényteleníti, az újat egyszer mutatja meg.
-- Csak az SQL Editorból hívható:  select public.km_new_code();
create or replace function public.km_new_code()
returns text
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  v_raw  text := upper(encode(extensions.gen_random_bytes(10), 'hex'));
  v_code text := substr(v_raw, 1, 5) || '-' || substr(v_raw, 6, 5) || '-' || substr(v_raw, 11, 5) || '-' || substr(v_raw, 16, 5);
begin
  insert into public.km_access (id, code_hash) values (1, public.km__hash(v_code))
  on conflict (id) do update set code_hash = excluded.code_hash, created_at = now();
  return v_code;
end
$$;
revoke all on function public.km_new_code() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 4. A felület által hívható függvények
-- ---------------------------------------------------------------------

-- Kód ellenőrzése (a belépő képernyő ezt hívja).
create or replace function public.km_ping(p_code text)
returns boolean
language plpgsql security definer
set search_path = public, extensions
as $$
begin
  perform public.km__check_code(p_code);
  return true;
end
$$;

-- Új heti lap beküldése. Minden mezőt itt, a szerveren is ellenőriz.
create or replace function public.km_submit(p_code text, p_check jsonb)
returns uuid
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  v_date      date;
  v_today     date := (now() at time zone 'Europe/Budapest')::date;
  v_robot     text := public.km__text(p_check -> 'robot', 120);
  v_inspector text := public.km__text(p_check -> 'inspector', 120);
  v_items     jsonb := p_check -> 'items';
  v_clean     jsonb := '[]'::jsonb;
  v_item      jsonb;
  v_no        int;
  v_status    text;
  v_note      text;
  v_actions   int := 0;
  v_escalate  boolean;
  v_esc_to    text := public.km__text(p_check -> 'escalate_to', 200);
  v_gas       numeric;
  v_cooling   boolean := coalesce((p_check ->> 'cooling_water_changed')::boolean, false);
  v_id        uuid;
begin
  perform public.km__check_code(p_code);

  begin
    v_date := (p_check ->> 'check_date')::date;
  exception when others then
    raise exception 'Érvénytelen dátum';
  end;
  if v_date is null then raise exception 'A dátum kötelező'; end if;
  if v_date > v_today + 1 or v_date < v_today - 400 then
    raise exception 'A dátum nem lehet jövőbeli vagy egy évnél régebbi';
  end if;
  if v_robot is null then raise exception 'A robot / cella megadása kötelező'; end if;
  if v_inspector is null then raise exception 'Az ellenőrzést végző nevének megadása kötelező'; end if;

  if jsonb_typeof(v_items) is distinct from 'array' or jsonb_array_length(v_items) <> 16 then
    raise exception 'Mind a 16 tételt ki kell tölteni';
  end if;
  for v_no in 1..16 loop
    v_item := v_items -> (v_no - 1);
    v_status := v_item ->> 'status';
    v_note := public.km__text(v_item -> 'note', 1000);
    if coalesce((v_item ->> 'no')::int, -1) <> v_no then
      raise exception 'A tételek sorrendje hibás (%.)', v_no;
    end if;
    if v_status is null or v_status not in ('ok', 'action') then
      raise exception 'A(z) %. tétel nincs kitöltve', v_no;
    end if;
    if v_status = 'action' then
      v_actions := v_actions + 1;
      if v_note is null then
        raise exception 'A(z) %. tételnél írd be, mit csináltál', v_no;
      end if;
    end if;
    v_clean := v_clean || jsonb_build_array(jsonb_build_object('no', v_no, 'status', v_status, 'note', v_note));
  end loop;

  if jsonb_typeof(p_check -> 'escalate') is distinct from 'boolean' then
    raise exception 'Jelöld be, hogy szükséges-e továbbjelzés';
  end if;
  v_escalate := (p_check ->> 'escalate')::boolean;
  if v_escalate and v_esc_to is null then
    raise exception 'Add meg, kinek kell továbbjelezni';
  end if;

  if nullif(p_check ->> 'gas_flow_lpm', '') is not null then
    begin
      v_gas := (p_check ->> 'gas_flow_lpm')::numeric;
    exception when others then
      raise exception 'A gázáramlás csak szám lehet';
    end;
    if v_gas < 0 or v_gas > 100 then raise exception 'A gázáramlás 0 és 100 l/min között lehet'; end if;
  end if;

  insert into public.km_checks (
    check_date, iso_year, iso_week, robot, inspector, items, action_count,
    cooling_water_changed, gas_flow_lpm, remarks, parts_used, escalate, escalate_to
  ) values (
    v_date,
    extract(isoyear from v_date)::int,
    extract(week from v_date)::int,
    v_robot, v_inspector, v_clean, v_actions,
    case when v_cooling then v_date end,
    round(v_gas, 1),
    public.km__text(p_check -> 'remarks', 4000),
    public.km__text(p_check -> 'parts_used', 2000),
    v_escalate,
    case when v_escalate then v_esc_to end
  )
  returning id into v_id;
  return v_id;
end
$$;

-- Archívum: az összes lap összefoglalója (a tételek nélkül), legújabb elöl.
create or replace function public.km_list(p_code text)
returns jsonb
language plpgsql security definer stable
set search_path = public, extensions
as $$
begin
  perform public.km__check_code(p_code);
  return coalesce((
    select jsonb_agg(to_jsonb(c) - 'items' order by c.check_date desc, c.created_at desc)
    from (select * from public.km_checks order by check_date desc, created_at desc limit 2000) c
  ), '[]'::jsonb);
end
$$;

-- Egy lap teljes tartalma.
create or replace function public.km_get(p_code text, p_id uuid)
returns jsonb
language plpgsql security definer stable
set search_path = public, extensions
as $$
declare
  v jsonb;
begin
  perform public.km__check_code(p_code);
  select to_jsonb(c) into v from public.km_checks c where c.id = p_id;
  if v is null then raise exception 'Nincs ilyen lap'; end if;
  return v;
end
$$;

-- Műszakvezetői jóváhagyás: csak egyszer írható be.
create or replace function public.km_approve(p_code text, p_id uuid, p_name text)
returns jsonb
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  v_name text := nullif(left(btrim(coalesce(p_name, '')), 120), '');
  v jsonb;
begin
  perform public.km__check_code(p_code);
  if v_name is null then raise exception 'A jóváhagyó nevének megadása kötelező'; end if;
  update public.km_checks
     set approved_by = v_name, approved_at = now()
   where id = p_id and approved_by is null
  returning to_jsonb(km_checks.*) into v;
  if v is null then
    if exists (select 1 from public.km_checks where id = p_id) then
      raise exception 'Ezt a lapot már jóváhagyták';
    end if;
    raise exception 'Nincs ilyen lap';
  end if;
  return v;
end
$$;

revoke all on function public.km_ping(text) from public;
revoke all on function public.km_submit(text, jsonb) from public;
revoke all on function public.km_list(text) from public;
revoke all on function public.km_get(text, uuid) from public;
revoke all on function public.km_approve(text, uuid, text) from public;
grant execute on function public.km_ping(text) to anon, authenticated;
grant execute on function public.km_submit(text, jsonb) to anon, authenticated;
grant execute on function public.km_list(text) to anon, authenticated;
grant execute on function public.km_get(text, uuid) to anon, authenticated;
grant execute on function public.km_approve(text, uuid, text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 5. Hozzáférési kód – csak az ELSŐ futtatáskor készül.
--    Az eredmény-táblázatban megjelenő kódot írd fel: ezt kell a
--    felületen egyszer beírni (vagy a linkbe tenni: ...?kod=A-KÓD).
--    Később új kód (a régi azonnal érvénytelen):  select public.km_new_code();
-- ---------------------------------------------------------------------
select case
  when exists (select 1 from public.km_access)
    then 'A kód már be van állítva. Új kód:  select public.km_new_code();'
  else public.km_new_code()
end as hozzaferesi_kod;
