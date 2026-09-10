alter table public.poems
  add column if not exists attribution_year integer;

alter table public.poems
  drop constraint if exists poems_attribution_year_range;

alter table public.poems
  add constraint poems_attribution_year_range
  check (attribution_year is null or attribution_year between 1 and 2100);

-- Use the best accepted historical year: composition where it is established,
-- otherwise first publication or standard attribution. The field remains optional
-- because a precise single year is not always knowable.
update public.poems as poem
set attribution_year = source.attribution_year
from (values
  ('Jerusalem', 'William Blake', 1804),
  ('The World Is Too Much With Us', 'William Wordsworth', 1802),
  ('London', 'William Blake', 1794),
  ('I Hear America Singing', 'Walt Whitman', 1860),
  ('Hope is the Thing with Feathers', 'Emily Dickinson', 1861),
  ('To Toussaint L''Ouverture', 'William Wordsworth', 1802),
  ('Sonnet LXVI', 'William Shakespeare', 1609),
  ('The Glories of Our Blood and State', 'James Shirley', 1659),
  ('A Little Boy Lost', 'William Blake', 1794),
  ('In Time of ''The Breaking of Nations''', 'Thomas Hardy', 1914),
  ('An Irish Airman Foresees his Death', 'W.B. Yeats', 1918),
  ('Inversnaid', 'Gerard Manley Hopkins', 1879),
  ('The Second Coming', 'W.B. Yeats', 1919),
  ('England in 1819', 'Percy Bysshe Shelley', 1819),
  ('Composed upon Westminster Bridge', 'William Wordsworth', 1802),
  ('Sonnet XVI: Cromwell, Our Chief of Men', 'John Milton', 1652),
  ('Revolution is the Pod', 'Emily Dickinson', 1862),
  ('To be or not to be', 'William Shakespeare', 1603)
) as source(title, author, attribution_year)
where poem.user_id is null
  and poem.title = source.title
  and poem.author = source.author;
