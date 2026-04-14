-- Cutover Stage 4 (part 2): for every employee whose first_name carries
-- a quoted "Pref" or a (Pref) parens form, split into legal + preferred,
-- generate the canonical alias variants, append them to aliases[], and
-- (when there is no name collision) normalize first_name to the legal
-- form. When normalizing would collide with another existing employee
-- row, the aliases are merged in but first_name is left alone.
DO $$
DECLARE
  rec RECORD;
  legal_first TEXT;
  preferred TEXT;
  new_aliases TEXT[];
  collision_exists BOOLEAN;
BEGIN
  FOR rec IN
    SELECT id, last_name, first_name, aliases
    FROM employees
    WHERE first_name ~ '"[^"]+"'
       OR first_name ~ '\([^)]+\)'
  LOOP
    IF rec.first_name ~ '"[^"]+"' THEN
      legal_first := trim(regexp_replace(rec.first_name, '\s*"[^"]+"\s*', ''));
      preferred := substring(rec.first_name from '"([^"]+)"');
    ELSIF rec.first_name ~ '\([^)]+\)' THEN
      legal_first := trim(regexp_replace(rec.first_name, '\s*\([^)]+\)\s*', ''));
      preferred := substring(rec.first_name from '\(([^)]+)\)');
    ELSE
      CONTINUE;
    END IF;

    IF legal_first IS NULL OR length(legal_first) = 0 THEN CONTINUE; END IF;
    IF preferred IS NULL OR length(preferred) = 0 THEN CONTINUE; END IF;

    new_aliases := ARRAY[
      rec.last_name || ', ' || legal_first,
      legal_first || ' ' || rec.last_name,
      rec.last_name || ', ' || preferred,
      preferred || ' ' || rec.last_name,
      rec.last_name || ', ' || legal_first || ' "' || preferred || '"',
      legal_first || ' "' || preferred || '" ' || rec.last_name
    ];

    SELECT EXISTS (
      SELECT 1 FROM employees
       WHERE id <> rec.id
         AND lower(last_name) = lower(rec.last_name)
         AND lower(first_name) = lower(legal_first)
    ) INTO collision_exists;

    IF collision_exists THEN
      UPDATE employees
         SET aliases = ARRAY(
               SELECT DISTINCT a FROM unnest(coalesce(aliases, '{}'::text[]) || new_aliases) AS a WHERE length(a) > 0
             ),
             updated_at = now()
       WHERE id = rec.id;
    ELSE
      UPDATE employees
         SET first_name = legal_first,
             aliases = ARRAY(
               SELECT DISTINCT a FROM unnest(coalesce(aliases, '{}'::text[]) || new_aliases) AS a WHERE length(a) > 0
             ),
             updated_at = now()
       WHERE id = rec.id;
    END IF;
  END LOOP;
END $$;
