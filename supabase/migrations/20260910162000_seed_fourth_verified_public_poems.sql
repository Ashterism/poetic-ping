-- Fourth verified public-domain batch: five exact texts from historic English editions.
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
      'England in 1819', 'Percy Bysshe Shelley',
      $$An old, mad, blind, despised, and dying king,—
Princes, the dregs of their dull race, who flow
Through public scorn,—mud from a muddy spring,—
Rulers who neither see, nor feel, nor know,
But leech-like to their fainting country cling,
Till they drop, blind in blood, without a blow,—
A people starved and stabbed in the untilled field,—
An army, which liberticide and prey
Makes as a two-edged sword to all who wield,—
Golden and sanguine laws which tempt and slay;
Religion Christless, Godless—a book sealed;
A Senate,—Time''s worst statute unrepealed,—
Are graves, from which a glorious Phantom may
Burst, to illumine our tempestuous day.$$, 
      'The Complete Poetical Works of Percy Bysshe Shelley (1914)', 'Ideas', '26',
      'https://en.wikisource.org/wiki/England_in_1819'
    ),
    (
      'Composed upon Westminster Bridge', 'William Wordsworth',
      $$Earth has not any thing to shew more fair:
Dull would he be of soul who could pass by
A sight so touching in its majesty:
This City now doth like a garment wear
The beauty of the morning; silent, bare,
Ships, towers, domes, theatres, and temples lie
Open unto the fields, and to the sky;
All bright and glittering in the smokeless air.
Never did sun more beautifully steep
In his first splendor valley, rock, or hill;
Ne''er saw I, never felt, a calm so deep!
The river glideth at his own sweet will:
Dear God! the very houses seem asleep;
And all that mighty heart is lying still!$$,
      'Poems (Wordsworth, 1815)', 'Vision', '53',
      'https://en.wikisource.org/wiki/Poems_(Wordsworth,_1815)/Volume_2/Composed_on_Westminster_bridge'
    ),
    (
      'Sonnet XVI: Cromwell, Our Chief of Men', 'John Milton',
      $$Cromwell, our chief of men, who through a cloud
Not of war only, but detractions rude,
Guided by faith and matchless fortitude,
To peace and truth thy glorious way hast plough''d,
And on the neck of crownèd fortune proud
Hast rear''d God''s trophies and his work pursued,
While Darwen stream with blood of Scots imbrued,
And Dunbar field resounds thy praises loud,
And Worcester''s laureat wreath. Yet much remains
To conquer still; peace hath her victories
No less renown''d than war: new foes arise
Threatening to bind our souls with secular chains;
Help us to save free conscience from the paw
Of hireling wolves, whose gospel is their maw.$$,
      'Poems, &c. Upon Several Occasions', 'Protest', '115',
      'https://en.wikisource.org/wiki/To_the_Lord_General_Cromwell,_May_1652'
    ),
    (
      'Revolution is the Pod', 'Emily Dickinson',
      $$Revolution is the pod
Systems rattle from;
When the winds of
Will are stirred,
Excellent is bloom.

But except its russet
Base
Every summer be
The entomber of itself;
So of Liberty.

Left inactive on the
Stalk,
All its purple fled,
Revolution shakes it
For
Test if it be dead.$$,
      'Further Poems of Emily Dickinson', 'Change', '155',
      'https://en.wikisource.org/wiki/Further_Poems_of_Emily_Dickinson/Revolution_is_the_pod'
    ),
    (
      'To be or not to be', 'William Shakespeare',
      $$To be, or not to be: that is the question:
Whether ''tis nobler in the mind to suffer
The slings and arrows of outrageous fortune,
Or to take arms against a sea of troubles,
And by opposing end them? To die: to sleep;
No more; and by a sleep to say we end
The heart-ache and the thousand natural shocks
That flesh is heir to, ''tis a consummation
Devoutly to be wish''d. To die, to sleep;
To sleep: perchance to dream: ay, there''s the rub;
For in that sleep of death what dreams may come,
When we have shuffled off this mortal coil,
Must give us pause: there''s the respect
That makes calamity of so long life;
For who would bear the whips and scorns of time,
The oppressor''s wrong, the proud man''s contumely,
The pangs of despised love, the law''s delay,
The insolence of office and the spurns
That patient merit of the unworthy takes,
When he himself might his quietus make
With a bare bodkin? Who would fardels bear,
To grunt and sweat under a weary life,
But that the dread of something after death,
The undiscover''d country from whose bourn
No traveller returns, puzzles the will
And makes us rather bear those ills we have
Than fly to others that we know not of?
Thus conscience does make cowards of us all;
And thus the native hue of resolution
Is sicklied o''er with the pale cast of thought,
And enterprises of great pith and moment
With this regard their currents turn awry
And lose the name of action.$$,
      'Hamlet', 'Truth', '188',
      'https://en.wikisource.org/wiki/Page:Shakespeare_-_First_Folio_Faithfully_Reproduced,_Methuen,_1910.djvu/781'
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
