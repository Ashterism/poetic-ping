-- Sixth verified public-domain batch from the supplied catalogue.
-- Each entry is an original English text from a public-domain edition.
with inserted as (
  insert into public.poems (
    user_id, title, author, body, language, access_type,
    source_type, source_title, source_section, source_url, rights_note,
    attribution_year
  )
  select null, poem.title, poem.author, poem.body, 'en', 'public',
    'Public-domain digital edition', poem.source_title, poem.source_section,
    poem.source_url,
    'Original English text from a public-domain edition; shared catalogue entry.',
    poem.attribution_year
  from (values
    (
      'Song of Myself I', 'Walt Whitman',
      $$I celebrate myself, and sing myself,
And what I assume you shall assume,
For every atom belonging to me as good belongs to you.

I loafe and invite my soul,
I lean and loafe at my ease observing a spear of summer grass.

My tongue, every atom of my blood, form''d from this soil, this air,
Born here of parents born here from parents the same, and their parents the same,
I, now thirty-seven years old in perfect health begin,
Hoping to cease not till death.

Creeds and schools in abeyance,
Retiring back a while sufficed at what they are, but never forgotten,
I harbor for good or bad, I permit to speak at every hazard,
Nature without check with original energy.$$,
      'Leaves of Grass (1882)', 'Ideas',
      'https://en.wikisource.org/wiki/Page:Leaves_of_Grass_(1882).djvu/35', 1882
    ),
    (
      'How Beastly the Bourgeois Is', 'D.H. Lawrence',
      $$How beastly the bourgeois is
especially the male of the species—

Presentable, eminently presentable—
shall I make you a present of him?

Isn''t he handsome? isn''t he healthy? Isn''t he a fine specimen?
doesn''t he look the fresh clean englishman, outside?
Isn''t it god''s own image? tramping his thirty miles a day
after partridges, or a little rubber bail?
wouldn''t you like to be like that, well off, and quite the thing?

Oh, but wait!
Let him meet a new emotion, let him be faced with another man''s need,
let him come home to a bit of moral difficulty, let life face him with a new demand on his understanding
and then watch him go soggy, like a wet meringue.
Watch him turn into a mess, either a fool or a bully.
Just watch the display of him, confronted with a new demand on his intelligence,
a new life-demand.

How beastly the bourgeois is
specially the male of the species—

Nicely groomed, like a mushroom
standing there so sleek and erect and eyeable—
and like a fungus, living on the remains of bygone life
sucking his life out of the dead leaves of greater life than his own.

And even so, he''s stale, he''s been there too long.
Touch him, and you''ll find he''s all gone inside
just like an old mushroom, all wormy inside, and hollow
under a smooth skin and an upright appearance.

Full of seething, wormy, hollow feelings
rather nasty—
How beastly the bourgeois is!

Standing in their thousands, these appearances, in damp England
what a pity they can''t all be kicked over
like sickening toadstools, and left to melt back, swiftly
into the soil of England.$$,
      'Pansies', 'Ideas',
      'https://en.wikisource.org/wiki/Pansies_(Lawrence)/How_Beastly_the_Bourgeois_is%E2%80%94', 1929
    ),
    (
      'Dulce et Decorum Est', 'Wilfred Owen',
      $$Bent double, like old beggars under sacks,
Knock-kneed, coughing like hags, we cursed through sludge,
Till on the haunting flares we turned our backs
And towards our distant rest began to trudge.
Men marched asleep. Many had lost their boots
But limped on, blood-shod. All went lame; all blind;
Drunk with fatigue; deaf even to the hoots
Of gas-shells dropping softly behind.

Gas! GAS! Quick, boys!—An ecstasy of fumbling
Fitting the clumsy helmets just in time,
But someone still was yelling out and stumbling
And flound''ring like a man in fire or lime.—
Dim, through the misty panes and thick green light,
As under a green sea, I saw him drowning.

In all my dreams before my helpless sight
He plunges at me, guttering, choking, drowning.

If in some smothering dreams you too could pace
Behind the wagon that we flung him in,
And watch the white eyes writhing in his face,
His hanging face, like a devil''s sick of sin,
If you could hear, at every jolt, the blood
Come gargling from the froth-corrupted lungs,
Bitter as the cud
Of vile, incurable sores on innocent tongues,—
My friend, you would not tell with such high zest
To children ardent for some desperate glory,
The old Lie: Dulce et decorum est
Pro patria mori.$$,
      'Poems by Wilfred Owen', 'Vision',
      'https://en.wikisource.org/wiki/Poems_by_Wilfred_Owen/Dulce_et_Decorum_est', 1920
    ),
    (
      'Recessional', 'Rudyard Kipling',
      $$God of our fathers, known of old—
Lord of our far-flung battle-line—
Beneath whose awful Hand we hold
Dominion over palm and pine—
Lord God of Hosts, be with us yet,
Lest we forget—lest we forget!

The tumult and the shouting dies—
The captains and the kings depart—
Still stands Thine ancient Sacrifice,
An humble and a contrite heart.
Lord God of Hosts, be with us yet,
Lest we forget—lest we forget!

Far-called our navies melt away—
On dune and headland sinks the fire—
Lo, all our pomp of yesterday
Is one with Nineveh and Tyre!
Judge of the Nations, spare us yet,
Lest we forget—lest we forget!

If, drunk with sight of power, we loose
Wild tongues that have not Thee in awe
Such boasting as the Gentiles use
Or lesser breeds without the Law—
Lord God of Hosts, be with us yet,
Lest we forget—lest we forget!

For heathen heart that puts her trust
In reeking tube and iron shard—
All valiant dust that builds on dust,
And guarding calls not Thee to guard—
For frantic boast and foolish word,
Thy mercy on Thy People, Lord! Amen.$$,
      'The Times', 'Truth',
      'https://en.wikisource.org/wiki/Poems_That_Every_Child_Should_Know/Recessional', 1897
    )
  ) as poem(title, author, body, source_title, source_section, source_url, attribution_year)
  where not exists (
    select 1 from public.poems existing
    where existing.user_id is null and existing.title = poem.title and existing.author = poem.author
  )
  returning id, title
), tags as (
  insert into public.tags (user_id, name, slug)
  select null, tag.name, tag.slug
  from (values ('Public domain', 'public-domain'), ('Ideas', 'ideas'), ('Vision', 'vision'), ('Truth', 'truth')) as tag(name, slug)
  where not exists (
    select 1 from public.tags existing where existing.user_id is null and existing.slug = tag.slug
  )
  returning id, slug
), all_tags as (
  select id, slug from tags
  union
  select id, slug from public.tags where user_id is null and slug in ('public-domain', 'ideas', 'vision', 'truth')
)
insert into public.poem_tags (poem_id, tag_id)
select inserted.id, all_tags.id
from inserted
join lateral (
  select case inserted.title
    when 'Song of Myself I' then 'ideas'
    when 'How Beastly the Bourgeois Is' then 'ideas'
    when 'Dulce et Decorum Est' then 'vision'
    when 'Recessional' then 'truth'
  end as theme
) mapped on true
join all_tags on all_tags.slug in ('public-domain', mapped.theme)
on conflict do nothing;
