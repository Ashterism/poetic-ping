-- First verified public-domain set. These are original English texts from
-- public-domain editions; do not replace them with later edited translations.
with inserted as (
  insert into public.poems (user_id, title, author, body, language, access_type)
  select null, poem.title, poem.author, poem.body, 'en', 'public'
  from (values
    ('Jerusalem', 'William Blake', $$And did those feet in ancient time
Walk upon England''s mountains green?
And was the holy Lamb of God
On England''s pleasant pastures seen?

And did the Countenance Divine
Shine forth upon our clouded hills?
And was Jerusalem builded here
Among those dark Satanic mills?

Bring me my bow of burning gold:
Bring me my arrows of desire:
Bring me my spear: O clouds unfold!
Bring me my chariot of fire.

I will not cease from mental fight,
Nor shall my sword sleep in my hand
Till we have built Jerusalem
In England''s green and pleasant land.$$),
    ('The World Is Too Much With Us', 'William Wordsworth', $$The world is too much with us; late and soon,
Getting and spending, we lay waste our powers;
Little we see in Nature that is ours;
We have given our hearts away, a sordid boon!
This Sea that bares her bosom to the moon;
The winds that will be howling at all hours,
And are up-gathered now like sleeping flowers;
For this, for everything, we are out of tune;
It moves us not. Great God! I''d rather be
A Pagan suckled in a creed outworn;
So might I, standing on this pleasant lea,
Have glimpses that would make me less forlorn;
Have sight of Proteus rising from the sea;
Or hear old Triton blow his wreathèd horn.$$),
    ('London', 'William Blake', $$I wander thro'' each charter''d street,
Near where the charter''d Thames does flow,
And mark in every face I meet
Marks of weakness, marks of woe.

In every cry of every Man,
In every Infant''s cry of fear,
In every voice, in every ban,
The mind-forg''d manacles I hear.

How the Chimney-sweeper''s cry
Every black''ning Church appalls;
And the hapless Soldier''s sigh
Runs in blood down Palace walls.

But most thro'' midnight streets I hear
How the youthful Harlot''s curse
Blasts the new-born Infant''s tear,
And blights with plagues the Marriage hearse.$$),
    ('I Hear America Singing', 'Walt Whitman', $$I hear America singing, the varied carols I hear,
Those of mechanics, each one singing his as it should be blithe and strong,
The carpenter singing his as he measures his plank or beam,
The mason singing his as he makes ready for work, or leaves off work,
The boatman singing what belongs to him in his boat, the deckhand singing on the steamboat deck,
The shoemaker singing as he sits on his bench, the hatter singing as he stands,
The wood-cutter''s song, the ploughboy''s on his way in the morning, or at noon intermission or at sundown,
The delicious singing of the mother, or of the young wife at work, or of the girl sewing or washing,
Each singing what belongs to him or her and to none else,
The day what belongs to the day—at night the party of young fellows, robust, friendly,
Singing with open mouths their strong melodious songs.$$)
  ) as poem(title, author, body)
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
cross join lateral (
  select id from public.tags where user_id is null and slug = 'public-domain' limit 1
) existing_tag
left join tag on true
on conflict do nothing;
