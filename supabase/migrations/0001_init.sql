-- XLBSTUDY initial schema. Client-generated UUIDs; soft deletes for sync.

create table profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text,
  daily_goal int not null default 20,
  onboarded bool not null default false,
  hearts int not null default 5,
  hearts_updated_at timestamptz not null default now(),
  streak int not null default 0,
  last_study_date date,
  xp int not null default 0,
  updated_at timestamptz not null default now()
);

create table decks (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  title text not null,
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table cards (
  id uuid primary key,
  deck_id uuid not null references decks on delete cascade,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  kind text not null check (kind in ('basic', 'cloze')),
  front text not null,
  back text not null default '',
  due timestamptz not null default now(),
  stability float not null default 0,
  difficulty float not null default 0,
  reps int not null default 0,
  lapses int not null default 0,
  state int not null default 0,
  learning_steps int not null default 0,
  last_review timestamptz,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table review_logs (
  id uuid primary key,
  card_id uuid not null references cards on delete cascade,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  rating int not null check (rating between 1 and 4),
  reviewed_at timestamptz not null default now(),
  xp int not null default 0
);

create index on cards (user_id, due) where deleted_at is null;
create index on cards (deck_id);
create index on review_logs (reviewed_at);

-- RLS
alter table profiles enable row level security;
alter table decks enable row level security;
alter table cards enable row level security;
alter table review_logs enable row level security;

create policy own on profiles for all using (id = auth.uid()) with check (id = auth.uid());
create policy own on decks for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own on cards for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own on review_logs for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Profile on signup
create function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)));
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- Weekly leaderboard: exposes only display_name + xp
create function weekly_leaderboard()
returns table (display_name text, xp bigint, is_me bool)
language sql security definer set search_path = public as $$
  select p.display_name, sum(r.xp)::bigint, p.id = auth.uid()
  from review_logs r join profiles p on p.id = r.user_id
  where r.reviewed_at >= date_trunc('week', now())
  group by p.id, p.display_name
  order by 2 desc
  limit 50
$$;
