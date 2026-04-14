-- Cutover Stage 4 (part 1): backfill aliases from the 18 legacy
-- name_map rows in hub_settings. For each pair, find the employee
-- whose CURRENT (last_name, first_name) matches the NEW form and
-- append the OLD form as an alias. Idempotent.
DO $$
DECLARE
  emp_id UUID;
  old_alias TEXT;
  pairs TEXT[][] := ARRAY[
    ARRAY['Abney',          'Michael "Mike"',  'Abney, Michael'],
    ARRAY['Johnson',        'Jamie "Jamie"',   'Johnson, Jamie'],
    ARRAY['McCarter',       'Zachary',         'McCarter, Zackary'],
    ARRAY['Shanklin',       'Sandi',           'Shanklin, Sandra'],
    ARRAY['Livesey-Lum',    'Lani',            'Livesey-Lum, Iolani'],
    ARRAY['Thompson',       'Cindy',           'Thompson, Mary'],
    ARRAY['Watson',         'Nikki',           'Watson, Heather'],
    ARRAY['Hicks',          'Abbi',            'Hicks, Abbigayle'],
    ARRAY['Akerele',        'Bimbor',          'Akerele, Abimbola'],
    ARRAY['Dalton',         'Madilynn',        'Dalton, Madison'],
    ARRAY['Frank',          'Frankie',         'Frank, Niyonyishu (Frank)'],
    ARRAY['Lane',           'Hope',            'Lane, Samantha'],
    ARRAY['Polacco',        'Cassie',          'Polacco, Cassandra'],
    ARRAY['Price',          'Aaron',           'Price, Richard'],
    ARRAY['Sammons',        'Maleah',          'Sammons, Raeleah'],
    ARRAY['Stanley',        'Mel',             'Stanley, Melanie'],
    ARRAY['Devlin',         'Sam',             'Devlin, Samantha'],
    ARRAY['Lineberger',     'Wendy',           'Rhodes Hancock, Wendy']
  ];
  i INT;
BEGIN
  FOR i IN 1..array_length(pairs, 1) LOOP
    SELECT id INTO emp_id
      FROM employees
     WHERE lower(last_name) = lower(pairs[i][1])
       AND lower(first_name) = lower(pairs[i][2])
     LIMIT 1;
    IF emp_id IS NOT NULL THEN
      old_alias := pairs[i][3];
      UPDATE employees
         SET aliases = ARRAY(
               SELECT DISTINCT unnest(aliases || ARRAY[old_alias])
             ),
             updated_at = now()
       WHERE id = emp_id;
    END IF;
  END LOOP;
END $$;
