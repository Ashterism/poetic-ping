-- Third verified public-domain batch. All entries are original English texts
-- from public-domain editions and retain a provenance URL for the catalogue.
with inserted as (
  insert into public.poems (
    user_id, title, author, body, language, access_type,
    source_type, source_title, source_section, source_page, source_url, rights_note
  )
  select null, poem.title, poem.author, poem.body, 'en', 'public',
    'Public-domain digital edition', poem.source_title, poem.source_section,
    poem.source_page, poem.source_url,
    'Original English text from a historic public-domain edition; shared catalogue entry.'
  from (values
    (
      'In Time of ''The Breaking of Nations''', 'Thomas Hardy',
      $$Only a man harrowing clods
In a slow silent walk
With an old horse that stumbles and nods
Half asleep as they stalk.

Only thin smoke without flame
From the heaps of couch-grass;
Yet this will go onward the same
Though Dynasties pass.

Yonder a maid and her wight
Come whispering by:
War''s annals will cloud into night
Ere their story die.$$, 
      'Moments of Vision', 'Ideas', '14',
      'https://www.poetryfoundation.org/poems/57320/in-time-of-the-breaking-of-nations'
    ),
    (
      'An Irish Airman Foresees his Death', 'W.B. Yeats',
      $$I know that I shall meet my fate
Somewhere among the clouds above;
Those that I fight I do not hate
Those that I guard I do not love;
My country is Kiltartan Cross,
My countrymen Kiltartan''s poor,
No likely end could bring them loss
Or leave them happier than before.
Nor law, nor duty bade me fight,
Nor public man, nor cheering crowds,
A lonely impulse of delight
Drove to this tumult in the clouds;
I balanced all, brought all to mind,
The years to come seemed waste of breath,
A waste of breath the years behind
In balance with this life, this death.$$, 
      'The Wild Swans at Coole', 'Vision', '42',
      'https://en.wikisource.org/wiki/The_Wild_Swans_at_Coole_(Collection)/An_Irish_Airman_Foresees_his_Death'
    ),
    (
      'Inversnaid', 'Gerard Manley Hopkins',
      $$This darksome burn, horseback brown,
His rollrock highroad roaring down,
In coop and in comb the fleece of his foam
Flutes and low to the lake falls home.

A windpuff-bonnet of fáwn-fróth
Turns and twindles over the broth
Of a pool so pitchblack, féll-frówning,
It rounds and rounds Despair to drowning.

Degged with dew, dappled with dew,
Are the groins of the braes that the brook treads through,
Wiry heathpacks, flitches of fern,
And the beadbonny ash that sits over the burn.

What would the world be, once bereft
Of wet and of wildness? Let them be left,
O let them be left, wildness and wet;
Long live the weeds and the wilderness yet.$$, 
      'Poems of Gerard Manley Hopkins', 'Truth', '215',
      'https://www.poetryfoundation.org/poems/44396/inversnaid'
    ),
    (
      'The Second Coming', 'W.B. Yeats',
      $$Turning and turning in the widening gyre
The falcon cannot hear the falconer;
Things fall apart; the centre cannot hold;
Mere anarchy is loosed upon the world,
The blood-dimmed tide is loosed, and everywhere
The ceremony of innocence is drowned;
The best lack all conviction, while the worst
Are full of passionate intensity.

Surely some revelation is at hand;
Surely the Second Coming is at hand.
The Second Coming! Hardly are those words out
When a vast image out of Spiritus Mundi
Troubles my sight: somewhere in sands of the desert
A shape with lion body and the head of a man,
A gaze blank and pitiless as the sun,
Is moving its slow thighs, while all about it
Reel shadows of the indignant desert birds.

The darkness drops again; but now I know
That twenty centuries of stony sleep
Were vexed to nightmare by a rocking cradle,
And what rough beast, its hour come round at last,
Slouches towards Bethlehem to be born?$$, 
      'Michael Robartes and the Dancer', 'Truth', '217',
      'https://en.wikisource.org/wiki/Michael_Robartes_and_the_Dancer'
    )
  ) as poem(title, author, body, source_title, source_section, source_page, source_url)
  where not exists (
    select 1 from public.poems existing
    where existing.user_id is null and existing.title = poem.title and existing.author = poem.author
  )
  returning id
), tag as (
  insert into public.tags (user_id, name, slug)
  select null, 'Public domain', 'public-domain'
  where not exists (select 1 from public.tags where user_id is null and slug = 'public-domain')
  returning id
)
insert into public.poem_tags (poem_id, tag_id)
select inserted.id, coalesce(tag.id, existing_tag.id)
from inserted
cross join lateral (select id from public.tags where user_id is null and slug = 'public-domain' limit 1) existing_tag
left join tag on true
on conflict do nothing;
