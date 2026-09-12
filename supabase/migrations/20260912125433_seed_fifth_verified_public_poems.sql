-- Fifth verified public-domain batch. These poems are shared catalogue entries
-- with a primary source link and an attributed publication year.
with inserted as (
  insert into public.poems (
    user_id, title, author, body, language, access_type,
    source_type, source_title, source_section, source_page, source_url, rights_note,
    attribution_year
  )
  select null, poem.title, poem.author, poem.body, 'en', 'public',
    'Public-domain digital edition', poem.source_title, poem.source_section,
    null, poem.source_url,
    'Original English text from a public-domain edition; shared catalogue entry.',
    poem.attribution_year
  from (values
    (
      'Ozymandias', 'Percy Bysshe Shelley',
      $$I met a traveller from an antique land,
Who said—“Two vast and trunkless legs of stone
Stand in the desert.... Near them, on the sand,
Half sunk a shattered visage lies, whose frown,
And wrinkled lip, and sneer of cold command,
Tell that its sculptor well those passions read
Which yet survive, stamped on these lifeless things,
The hand that mocked them, and the heart that fed:
And on the pedestal these words appear:
‘My name is Ozymandias, king of kings:
Look on my works, ye Mighty, and despair!’
Nothing beside remains. Round the decay
Of that colossal wreck, boundless and bare
The lone and level sands stretch far away.”$$,
      'The Examiner', 'Reflection',
      'https://en.wikisource.org/wiki/Ozymandias_(Shelley)', 1818
    ),
    (
      'I Wandered Lonely as a Cloud', 'William Wordsworth',
      $$I wandered lonely as a cloud
That floats on high o''er vales and hills,
When all at once I saw a crowd,
A host, of golden daffodils;
Beside the lake, beneath the trees,
Fluttering and dancing in the breeze.

Continuous as the stars that shine
And twinkle on the milky way,
They stretched in never-ending line
Along the margin of a bay:
Ten thousand saw I at a glance,
Tossing their heads in sprightly dance.

The waves beside them danced; but they
Out-did the sparkling waves in glee:
A poet could not but be gay,
In such a jocund company:
I gazed—and gazed—but little thought
What wealth the show to me had brought:

For oft, when on my couch I lie
In vacant or in pensive mood,
They flash upon that inward eye
Which is the bliss of solitude;
And then my heart with pleasure fills,
And dances with the daffodils.$$,
      'Poems, in Two Volumes', 'Nature',
      'https://en.wikisource.org/wiki/Poems,_in_Two_Volumes_(Wordsworth,_1807)/I_Wandered_Lonely_as_a_Cloud', 1807
    ),
    (
      'The Lake Isle of Innisfree', 'W. B. Yeats',
      $$I will arise and go now, and go to Innisfree,
And a small cabin build there, of clay and wattles made;
Nine bean-rows will I have there, a hive for the honey-bee,
And live alone in the bee-loud glade.

And I shall have some peace there, for peace comes dropping slow,
Dropping from the veils of the morning to where the cricket sings;
There midnight''s all a glimmer, and noon a purple glow,
And evening full of the linnet''s wings.

I will arise and go now, for always night and day
I hear lake water lapping with low sounds by the shore;
While I stand on the roadway, or on the pavements grey,
I hear it in the deep heart''s core.$$,
      'The Countess Kathleen and Various Legends and Lyrics', 'Peace',
      'https://en.wikisource.org/wiki/The_Lake_Isle_of_Innisfree', 1890
    ),
    (
      'To Autumn', 'John Keats',
      $$Season of mists and mellow fruitfulness,
Close bosom-friend of the maturing sun;
Conspiring with him how to load and bless
With fruit the vines that round the thatch-eves run;
To bend with apples the moss''d cottage-trees,
And fill all fruit with ripeness to the core;
To swell the gourd, and plump the hazel shells
With a sweet kernel; to set budding more,
And still more, later flowers for the bees,
Until they think warm days will never cease,
For summer has o''er-brimm''d their clammy cells.

Who hath not seen thee oft amid thy store?
Sometimes whoever seeks abroad may find
Thee sitting careless on a granary floor,
Thy hair soft-lifted by the winnowing wind;
Or on a half-reap''d furrow sound asleep,
Drows''d with the fume of poppies, while thy hook
Spares the next swath and all its twined flowers:
And sometimes like a gleaner thou dost keep
Steady thy laden head across a brook;
Or by a cyder-press, with patient look,
Thou watchest the last oozings hours by hours.

Where are the songs of spring? Ay, where are they?
Think not of them, thou hast thy music too,—
While barred clouds bloom the soft-dying day,
And touch the stubble-plains with rosy hue;
Then in a wailful choir the small gnats mourn
Among the river sallows, borne aloft
Or sinking as the light wind lives or dies;
And full-grown lambs loud bleat from hilly bourn;
Hedge-crickets sing; and now with treble soft
The red-breast whistles from a garden-croft;
And gathering swallows twitter in the skies.$$,
      'Lamia, Isabella, The Eve of St. Agnes, and Other Poems', 'Nature',
      'https://en.wikisource.org/wiki/To_Autumn', 1820
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
  from (values
    ('Public domain', 'public-domain'),
    ('Nature', 'nature'),
    ('Reflection', 'reflection'),
    ('Peace', 'peace')
  ) as tag(name, slug)
  where not exists (
    select 1 from public.tags existing
    where existing.user_id is null and existing.slug = tag.slug
  )
  returning id, slug
), all_tags as (
  select id, slug from tags
  union all
  select id, slug from public.tags
  where user_id is null and slug in ('public-domain', 'nature', 'reflection', 'peace')
)
insert into public.poem_tags (poem_id, tag_id)
select inserted.id, all_tags.id
from inserted
join lateral (
  select case inserted.title
    when 'Ozymandias' then 'reflection'
    when 'I Wandered Lonely as a Cloud' then 'nature'
    when 'The Lake Isle of Innisfree' then 'peace'
    when 'To Autumn' then 'nature'
  end as theme
) mapped on true
join all_tags on all_tags.slug in ('public-domain', mapped.theme)
on conflict do nothing;
