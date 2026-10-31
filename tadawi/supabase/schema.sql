-- ============================================================
--  تداوي — سكيما Supabase
--  شغّل الملف ده كله مرة واحدة في: Supabase Dashboard > SQL Editor > New query > Run
-- ============================================================

create extension if not exists pgcrypto;

-- ---------------- المستخدمون ----------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  role        text not null default 'patient' check (role in ('patient','doctor','admin')),
  status      text not null default 'active'  check (status in ('active','pending','approved','suspended')),
  name        text not null default '',
  phone       text not null default '',
  photo       text not null default '',
  gender      text not null default '',
  age         text not null default '',
  notes       text not null default '',
  bio         text not null default '',
  dept        text,
  fee         numeric not null default 0,
  years       int     not null default 0,
  license     text    not null default '',
  created_at  bigint  not null default (extract(epoch from now()) * 1000)::bigint
);
create index if not exists profiles_doctors_idx on public.profiles (role, status);

-- ---------------- الاستشارات ----------------
create table if not exists public.consultations (
  id          uuid primary key default gen_random_uuid(),
  patient_id  uuid not null references public.profiles(id) on delete cascade,
  doctor_id   uuid not null references public.profiles(id) on delete cascade,
  complaint   text not null default '',
  fee         numeric not null default 0,
  status      text not null default 'pending_payment'
              check (status in ('pending_payment','open','closed','rejected')),
  patient     jsonb not null default '{}'::jsonb,
  doctor      jsonb not null default '{}'::jsonb,
  payment     jsonb not null default '{}'::jsonb,
  created_at  bigint not null default (extract(epoch from now()) * 1000)::bigint
);
create index if not exists consultations_patient_idx on public.consultations (patient_id);
create index if not exists consultations_doctor_idx  on public.consultations (doctor_id);

-- ---------------- الرسائل ----------------
create table if not exists public.messages (
  id          uuid primary key default gen_random_uuid(),
  cid         uuid not null references public.consultations(id) on delete cascade,
  sender      uuid not null references public.profiles(id) on delete cascade,
  text        text not null check (char_length(text) between 1 and 2000),
  at          bigint not null default (extract(epoch from now()) * 1000)::bigint
);
create index if not exists messages_cid_idx on public.messages (cid, at);

-- ---------------- إعدادات المنصة ----------------
create table if not exists public.settings (
  id    text primary key,
  value jsonb not null default '{}'::jsonb
);
insert into public.settings (id, value) values ('app', '{"fawryNumber":"01000000000"}')
on conflict (id) do nothing;

-- ---------------- دوال مساعدة ----------------
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function public.is_participant(c uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.consultations
    where id = c and (patient_id = auth.uid() or doctor_id = auth.uid())
  );
$$;

create or replace function public.consultation_is_open(c uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.consultations where id = c and status = 'open');
$$;

-- ---------------- حماية الأعمدة الحساسة (تريجرز) ----------------
-- الدور والحالة: مفيش مستخدم عادي يغيّرهم (الأدمن بس، أو من SQL Editor)
create or replace function public.guard_profile_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    if new.role <> old.role or new.status <> old.status or new.id <> old.id then
      raise exception 'not allowed to change role or status';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_guard_profile_update on public.profiles;
create trigger trg_guard_profile_update before update on public.profiles
for each row execute function public.guard_profile_update();

-- الدكتور بيقدر ينهي الاستشارة بس (يغيّر status من open إلى closed ولا حاجة تانية)
create or replace function public.guard_consultation_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    if new.status <> 'closed' or old.status <> 'open'
       or new.patient_id <> old.patient_id or new.doctor_id <> old.doctor_id
       or new.fee <> old.fee or new.payment is distinct from old.payment
       or new.complaint <> old.complaint then
      raise exception 'not allowed';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_guard_consultation_update on public.consultations;
create trigger trg_guard_consultation_update before update on public.consultations
for each row execute function public.guard_consultation_update();

-- ---------------- Row Level Security ----------------
alter table public.profiles       enable row level security;
alter table public.consultations  enable row level security;
alter table public.messages       enable row level security;
alter table public.settings       enable row level security;

-- profiles
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated using (
  id = auth.uid() or public.is_admin() or (role = 'doctor' and status = 'approved')
  or exists (select 1 from public.consultations c
             where (c.patient_id = auth.uid() and c.doctor_id = profiles.id)
                or (c.doctor_id  = auth.uid() and c.patient_id = profiles.id))
);

drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles for insert to authenticated with check (
  id = auth.uid() and (
    (role = 'patient' and status = 'active') or
    (role = 'doctor'  and status = 'pending')
  )
);

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

drop policy if exists profiles_delete on public.profiles;
create policy profiles_delete on public.profiles for delete to authenticated using (public.is_admin());

-- consultations
drop policy if exists cons_read on public.consultations;
create policy cons_read on public.consultations for select to authenticated using (
  patient_id = auth.uid() or doctor_id = auth.uid() or public.is_admin()
);

drop policy if exists cons_insert on public.consultations;
create policy cons_insert on public.consultations for insert to authenticated with check (
  patient_id = auth.uid() and status = 'pending_payment' and payment->>'status' = 'pending'
  and exists (select 1 from public.profiles d where d.id = doctor_id and d.role = 'doctor' and d.status = 'approved')
);

drop policy if exists cons_update on public.consultations;
create policy cons_update on public.consultations for update to authenticated
  using (public.is_admin() or (doctor_id = auth.uid() and status = 'open'))
  with check (public.is_admin() or (doctor_id = auth.uid() and status = 'closed'));

-- messages (الأدمن مش بيقرأ المحادثات — خصوصية)
drop policy if exists msg_read on public.messages;
create policy msg_read on public.messages for select to authenticated using (public.is_participant(cid));

drop policy if exists msg_insert on public.messages;
create policy msg_insert on public.messages for insert to authenticated with check (
  sender = auth.uid() and public.is_participant(cid) and public.consultation_is_open(cid)
);

-- settings
drop policy if exists settings_read on public.settings;
create policy settings_read on public.settings for select to authenticated using (true);
drop policy if exists settings_write on public.settings;
create policy settings_write on public.settings for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------- Realtime ----------------
do $$
declare t text;
begin
  foreach t in array array['profiles','consultations','messages'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
