-- Second verified public-domain batch. These are original English texts from
-- historical editions. Source URLs are retained as provenance for the shared
-- catalogue; do not substitute later edited translations or adaptations.
with inserted as (
  insert into public.poems (
    user_id, title, author, body, language, access_type,
    source_type, source_title, source_section, source_page, source_url, rights_note
  )
  select
    null, poem.title, poem.author, poem.body, 'en', 'public',
    'Public-domain digital edition', poem.source_title, poem.source_section,
    poem.source_page, poem.source_url,
    'Original English text from a historic public-domain edition; shared catalogue entry.'
  from (values
    (
      'Hope is the Thing with Feathers',
      'Emily Dickinson',
      $$“Hope” is the thing with feathers
That perches in the soul,
And sings the tune without the words,
And never stops at all,

And sweetest in the gale is heard;
And sore must be the storm
That could abash the little bird
That kept so many warm.

I''ve heard it in the chillest land,
And on the strangest sea;
Yet, never, in extremity,
It asked a crumb of me.$$,
      'The Complete Poems of Emily Dickinson',
      'Ideas',
      '52',
      'https://en.wikisource.org/wiki/The_Complete_Poems_of_Emily_Dickinson/Hope_is_the_thing_with_feathers'
    ),
    (
      'To Toussaint L''Ouverture',
      'William Wordsworth',
      $$Toussaint, the most unhappy Man of Men!
Whether the all-cheering sun be free to shed
His beams around thee, or thou rest thy head
Pillowed in some dark dungeon''s noisome den,
O miserable Chieftain! where and when
Wilt thou find patience? Yet die not; do thou
Wear rather in thy bonds a cheerful brow:
Though fallen Thyself, never to rise again,
Live, and take comfort. Thou hast left behind
Powers that will work for thee; air, earth, and skies;
There''s not a breathing of the common wind
That will forget thee; thou hast great allies;
Thy friends are exultations, agonies,
And love, and Man''s unconquerable mind.$$,
      'Poems (Wordsworth, 1815)',
      'Protest',
      '114',
      'https://en.wikisource.org/wiki/Poems_(Wordsworth,_1815)/Volume_2/To_Toussaint_L%27Ouverture'
    ),
    (
      'Sonnet LXVI',
      'William Shakespeare',
      $$Tired with all these, for restful death I cry,
As to behold desert a beggar born,
And needy nothing trimm''d in jollity,
And purest faith unhappily forsworn,
And gilded honour shamefully misplaced,
And maiden virtue rudely strumpeted,
And right perfection wrongfully disgraced,
And strength by limping sway disabled,
And art made tongue-tied by authority,
And folly doctor-like controlling skill,
And simple truth miscall''d simplicity,
And captive good attending captain ill:
Tired with all these, from these would I be gone,
Save that, to die, I leave my love alone.$$,
      'Shakespeare''s Sonnets',
      'Truth',
      '221',
      'https://en.wikisource.org/wiki/Shakespeare%27s_Sonnets/Sonnet_66'
    ),
    (
      'The Glories of Our Blood and State',
      'James Shirley',
      $$The glories of our blood and state
Are shadows, not substantial things;
There is no armour against fate;
Death lays his icy hand on kings:
Sceptre and Crown
Must tumble down,
And in the dust be equal made
With the poor crooked scythe and spade.

Some men with swords may reap the field,
And plant fresh laurels where they kill:
But their strong nerves at last must yield;
They tame but one another still:
Early or late
They stoop to fate,
And must give up their murmuring breath
When they, pale captives, creep to death.

The garlands wither on your brow;
Then boast no more your mighty deeds!
Upon Death''s purple altar now
See where the victor-victim bleeds:
Your heads must come
To the cold tomb:
Only the actions of the just
Smell sweet and blossom in their dust.$$,
      'The Contention of Ajax and Ulysses',
      'Change',
      '174',
      'https://en.wikisource.org/wiki/The_Contestation_of_Ajax_and_Ulysses'
    ),
    (
      'A Little Boy Lost',
      'William Blake',
      $$Nought loves another as itself,
Nor venerates another so,
Nor is it possible to thought
A greater than itself to know.

And, Father, how can I love you,
Or any of my brothers more?
I love you like the little bird
That picks up crumbs around the door.

The Priest sat by and heard the child,
In trembling zeal he seized his hair:
He led him by his little coat,
And all admired the priestly care.

And standing on the altar high,
Lo, what a fiend is here! said he:
One who sets reason up for judge
Of our most holy mystery.

The weeping child could not be heard,
The weeping parents wept in vain:
They stripped him to his little shirt,
And bound him in an iron chain.

And burned him in a holy place,
Where many had been burned before:
The weeping parents wept in vain.
Are such things done on Albion''s shore?$$,
      'Songs of Experience',
      'Protest',
      '118',
      'https://en.wikisource.org/wiki/A_Little_Boy_Lost_(Songs_of_Experience)'
    )
  ) as poem(title, author, body, source_title, source_section, source_page, source_url)
  where not exists (
    select 1 from public.poems existing
    where existing.user_id is null
      and existing.title = poem.title
      and existing.author = poem.author
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
cross join lateral (
  select id from public.tags where user_id is null and slug = 'public-domain' limit 1
) existing_tag
left join tag on true
on conflict do nothing;
