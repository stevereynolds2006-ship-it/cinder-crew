create table if not exists cinder_scores (
  id serial primary key,
  handle text not null,
  handle_key text not null unique,
  score integer not null check (score >= 1 and score <= 500000),
  rank_title text not null,
  combo integer not null default 0 check (combo >= 0 and combo <= 99),
  created_at timestamptz not null default now()
);

create index if not exists cinder_scores_score_idx on cinder_scores (score desc);

insert into cinder_scores (handle, handle_key, score, rank_title, combo)
select v.handle, v.handle_key, v.score, v.rank_title, v.combo
from (
  values
    ('Ashbrand', 'ashbrand', 4820, 'Cinder Saint', 8),
    ('Kiln Maw', 'kiln maw', 3510, 'Mythic Smith', 6),
    ('Soot Saint', 'soot saint', 2740, 'Furnace Kin', 5),
    ('Wick', 'wick', 1660, 'Coalhand', 4),
    ('Ember Pit', 'ember pit', 980, 'Coalhand', 3)
) as v(handle, handle_key, score, rank_title, combo)
where not exists (select 1 from cinder_scores limit 1);
