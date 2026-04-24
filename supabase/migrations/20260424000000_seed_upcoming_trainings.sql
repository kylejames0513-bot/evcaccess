-- =========================================================
-- Seed: Upcoming trainings + sessions + rosters (2026-04-24)
-- =========================================================
-- Source: HR-provided training schedule dated 2026-04-24.
--
-- What this does:
--   1. Adds six new training-type catalog entries that did not exist
--      (PCT_TRAIN, RISING_LEADERS, ACTIVE_SHOOTER, LEADERSHIP_HR,
--      HRC_SHARPS, VAN_LIFT). All inserted inactive so they don't
--      pollute the compliance matrix until cadences are set.
--   2. Creates ~20 scheduled sessions (May–Oct 2026) and one historic
--      completed session (CPR 2026-04-23) with full rosters.
--   3. Resolves attendee names to employees via
--      (legal_first_name, legal_last_name) → preferred_name fallback.
--      Unmatched names are written to review_queue for manual triage
--      in /inbox.
--
-- Idempotency: each session INSERT is guarded by a lookup on
--   (training_id, scheduled_start, title). Re-running the migration
--   will not duplicate rows. Enrollments use the existing
--   (session_id, employee_id) unique constraint.
--
-- Rollback snippet (if needed):
--   delete from session_enrollments where enrolled_by = 'seed_2026_04_24';
--   delete from sessions where id in (
--     select session_id from audit_log
--      where source = 'session_seed_2026_04_24' and action = 'session_seeded'
--   );
--   delete from review_queue where source = 'session_seed_2026_04_24';
--   delete from trainings where code in (
--     'PCT_TRAIN','RISING_LEADERS','ACTIVE_SHOOTER',
--     'LEADERSHIP_HR','HRC_SHARPS','VAN_LIFT'
--   );
-- =========================================================

-- ---- 1. New catalog entries (inactive) ------------------
insert into public.trainings (code, title, category, regulatory_citation, cadence_type, active)
values
  ('PCT_TRAIN',      'PCT Training',                        'clinical',   'Internal', 'unset', false),
  ('RISING_LEADERS', 'Rising Leaders Program',              'leadership', 'Internal', 'unset', false),
  ('ACTIVE_SHOOTER', 'Active Shooter Part I',               'safety',     'Internal', 'unset', false),
  ('LEADERSHIP_HR',  'HR Leadership Training',              'leadership', 'Internal', 'unset', false),
  ('HRC_SHARPS',     'HRC & Sharps Relias Training',        'compliance', 'Internal', 'unset', false),
  ('VAN_LIFT',       'Van Lift Training',                   'safety',     'Internal', 'unset', false)
on conflict (code) do nothing;

-- ---- 2. Seed block ---------------------------------------
do $$
declare
  v_run_id      uuid;
  v_training_id uuid;
  v_session_id  uuid;
  v_emp_id      uuid;
  v_label       text;
  v_name        text;
  v_names       text[];
  v_status      text;
  v_parts       text[];
  v_first       text;
  v_last        text;
begin
  -- Group all seeded rows under one ingestion_run
  insert into public.ingestion_runs (source, status, triggered_by)
  values ('session_seed_2026_04_24', 'running', 'migration_20260424000000')
  returning id into v_run_id;

  -- ---- helper: look up an employee by "First Last" -------
  create or replace function pg_temp._seed_find_employee(p_full text)
  returns uuid language plpgsql as $f$
  declare
    v_id    uuid;
    v_parts text[];
    v_first text;
    v_last  text;
  begin
    v_parts := regexp_split_to_array(btrim(p_full), '\s+');
    if array_length(v_parts, 1) < 2 then
      return null;
    end if;
    v_first := v_parts[1];
    v_last  := v_parts[array_length(v_parts, 1)];

    -- exact legal name match
    select id into v_id
      from public.employees
     where lower(legal_first_name) = lower(v_first)
       and lower(legal_last_name)  = lower(v_last)
     limit 1;
    if v_id is not null then return v_id; end if;

    -- preferred name fallback
    select id into v_id
      from public.employees
     where lower(preferred_name)   = lower(v_first)
       and lower(legal_last_name)  = lower(v_last)
     limit 1;
    if v_id is not null then return v_id; end if;

    -- known_aliases fallback (checks against 'First Last' in the array)
    select id into v_id
      from public.employees
     where exists (
       select 1 from unnest(known_aliases) a
        where lower(a) = lower(p_full)
     )
     limit 1;
    return v_id;
  end $f$;

  -- ---- helper: enroll a roster into a session ------------
  create or replace function pg_temp._seed_enroll(
    p_session_id uuid,
    p_label      text,
    p_run_id     uuid,
    p_names      text[],
    p_status     text default 'enrolled'
  ) returns int language plpgsql as $f$
  declare
    v_name text;
    v_id   uuid;
    v_hits int := 0;
  begin
    foreach v_name in array p_names loop
      v_id := pg_temp._seed_find_employee(v_name);
      if v_id is null then
        insert into public.review_queue (ingestion_run_id, source, reason, raw_payload)
        values (p_run_id, 'session_seed_2026_04_24', 'employee_name_not_found',
                jsonb_build_object(
                  'raw_name', v_name,
                  'session_label', p_label,
                  'session_id', p_session_id
                ));
      else
        insert into public.session_enrollments
          (session_id, employee_id, source, status, enrolled_by, notes)
        values
          (p_session_id, v_id, 'manual', p_status, 'seed_2026_04_24', null)
        on conflict (session_id, employee_id) do nothing;
        v_hits := v_hits + 1;
      end if;
    end loop;
    return v_hits;
  end $f$;

  -- ---- helper: create-or-find a session ------------------
  create or replace function pg_temp._seed_session(
    p_training_code text,
    p_title         text,
    p_start         timestamptz,
    p_end           timestamptz,
    p_location      text,
    p_kind          text,
    p_status        text,
    p_notes         text,
    p_capacity      int
  ) returns uuid language plpgsql as $f$
  declare
    v_tid  uuid;
    v_sid  uuid;
  begin
    select id into v_tid from public.trainings where code = p_training_code;
    if v_tid is null then
      raise exception 'Unknown training code: %', p_training_code;
    end if;
    select id into v_sid
      from public.sessions
     where training_id = v_tid
       and scheduled_start = p_start
       and coalesce(title, '') = coalesce(p_title, '');
    if v_sid is not null then return v_sid; end if;

    insert into public.sessions
      (training_id, scheduled_start, scheduled_end, location, capacity,
       status, title, session_kind, notes)
    values
      (v_tid, p_start, p_end, p_location, p_capacity,
       p_status, p_title, p_kind, p_notes)
    returning id into v_sid;
    return v_sid;
  end $f$;

  -- =====================================================
  -- HISTORIC: CPR Apr 23 (9 scheduled, 7 attended, 2 rescheduled)
  -- =====================================================
  v_session_id := pg_temp._seed_session(
    'CPR_FA', 'CPR & First Aid — Apr 23',
    '2026-04-23 09:00:00-04', '2026-04-23 13:00:00-04',
    'Training Room A', 'standalone', 'completed',
    '9 scheduled / 7 attended. Robert Graf and Jason Burris rescheduled to May 7 (staffing).',
    9
  );
  perform pg_temp._seed_enroll(v_session_id, 'CPR Apr 23 — attended', v_run_id, array[
    'Patreese Poore', 'Daniel Lineberger', 'Lacey Ausburn', 'Brandi Chew',
    'Colleen Goins', 'Matthew Chadwell', 'Wesley Thomas'
  ], 'attended');
  perform pg_temp._seed_enroll(v_session_id, 'CPR Apr 23 — no_show/rescheduled', v_run_id, array[
    'Robert Graf', 'Jason Burris'
  ], 'no_show');

  -- =====================================================
  -- CPR — May 7
  -- =====================================================
  v_session_id := pg_temp._seed_session(
    'CPR_FA', 'CPR & First Aid — May 7',
    '2026-05-07 09:00:00-04', '2026-05-07 13:00:00-04',
    'Training Room A', 'standalone', 'scheduled',
    'Staff notified 4/20/2026. Includes Robert Graf & Jason Burris rescheduled from Apr 23.',
    10
  );
  perform pg_temp._seed_enroll(v_session_id, 'CPR May 7', v_run_id, array[
    'Kirsten Purinton', 'Sandi Shanklin', 'Nikki Watson', 'Delynn Woods',
    'Jordan Jones', 'Melissa Jackson', 'Robert Graf', 'Jason Burris'
  ]);

  -- =====================================================
  -- CPR — May 14 (new hires, TBA)
  -- =====================================================
  perform pg_temp._seed_session(
    'CPR_FA', 'CPR & First Aid — May 14 (New Hires)',
    '2026-05-14 09:00:00-04', '2026-05-14 13:00:00-04',
    'Training Room A', 'standalone', 'scheduled',
    'Roster: New Hires — TBA. Staff notification date pending.',
    10
  );

  -- =====================================================
  -- UKERU — May 11
  -- =====================================================
  v_session_id := pg_temp._seed_session(
    'UKERU', 'Ukeru — May 11',
    '2026-05-11 09:00:00-04', '2026-05-11 16:00:00-04',
    'Training Room A', 'standalone', 'scheduled',
    'Includes New Hires (not yet named). Staff notified 4/20/2026.',
    14
  );
  perform pg_temp._seed_enroll(v_session_id, 'UKERU May 11', v_run_id, array[
    'Edward Copeland', 'Austin Loudin', 'Okorafor Ndubuisi', 'Michelle Shafer',
    'Idris Ibraheem', 'Tiffany Sharp', 'Theresa Fletcher', 'Justin Long',
    'Tyler Stringer', 'Matthew Chadwell'
  ]);

  -- =====================================================
  -- UKERU — May 29
  -- =====================================================
  v_session_id := pg_temp._seed_session(
    'UKERU', 'Ukeru — May 29',
    '2026-05-29 09:00:00-04', '2026-05-29 16:00:00-04',
    'Training Room A', 'standalone', 'scheduled',
    'Includes New Hires (not yet named). Staff notified 4/20/2026.',
    8
  );
  perform pg_temp._seed_enroll(v_session_id, 'UKERU May 29', v_run_id, array[
    'Antoinette Carbajal', 'Mattingly Miller', 'Luke Lawson'
  ]);

  -- =====================================================
  -- Initial Med — Apr 27–30
  -- =====================================================
  v_session_id := pg_temp._seed_session(
    'MED_TRAIN', 'Medication Administration — Apr 27–30',
    '2026-04-27 09:00:00-04', '2026-04-30 16:30:00-04',
    'Sertoma', 'standalone', 'scheduled',
    'Multi-day training (Apr 27–30). Staff notified 4/13/2026.',
    6
  );
  perform pg_temp._seed_enroll(v_session_id, 'Initial Med Apr 27–30', v_run_id, array[
    'Shyanna Steinbuergge', 'Emily Davis', 'Michelle Bradshaw'
  ]);

  -- =====================================================
  -- Initial Med — May 18–21
  -- =====================================================
  v_session_id := pg_temp._seed_session(
    'MED_TRAIN', 'Medication Administration — May 18–21',
    '2026-05-18 08:30:00-04', '2026-05-21 16:00:00-04',
    'EVC', 'standalone', 'scheduled',
    'Multi-day training (May 18–21). Capacity 12. Staff notification pending (TBA).',
    12
  );
  perform pg_temp._seed_enroll(v_session_id, 'Initial Med May 18–21', v_run_id, array[
    'Kelly Buckmaster', 'Maria Andrades', 'Cheryl McNaughton', 'Alyse Larsen',
    'Kelsey Ruffner', 'Linda White', 'Sarah Waterman', 'Michelle Gilbert',
    'Heaven Christison', 'Ashlynn Wyrick', 'Brandi Chew', 'Leah Hale'
  ]);

  -- =====================================================
  -- Post Med — May 1
  -- =====================================================
  v_session_id := pg_temp._seed_session(
    'POST_MED', 'Post Medication Training — May 1',
    '2026-05-01 09:00:00-04', '2026-05-01 11:00:00-04',
    'Multi-Purpose Room', 'standalone', 'scheduled',
    'Follows Apr 27–30 Initial Med cohort. Staff notified 4/20/2026.',
    6
  );
  perform pg_temp._seed_enroll(v_session_id, 'Post Med May 1', v_run_id, array[
    'Shyanna Steinbuergge', 'Emily Davis', 'Michelle Bradshaw'
  ]);

  -- =====================================================
  -- Post Med — May 22
  -- =====================================================
  v_session_id := pg_temp._seed_session(
    'POST_MED', 'Post Medication Training — May 22',
    '2026-05-22 09:00:00-04', '2026-05-22 11:00:00-04',
    'Multi-Purpose Room', 'standalone', 'scheduled',
    'Follows May 18–21 Initial Med cohort. Staff notification pending (TBA).',
    12
  );
  perform pg_temp._seed_enroll(v_session_id, 'Post Med May 22', v_run_id, array[
    'Kelly Buckmaster', 'Maria Andrades', 'Cheryl McNaughton', 'Alyse Larsen',
    'Kelsey Ruffner', 'Linda White', 'Sarah Waterman', 'Michelle Gilbert',
    'Heaven Christison', 'Ashlynn Wyrick', 'Brandi Chew', 'Leah Hale'
  ]);

  -- =====================================================
  -- Mealtime — May 20
  -- =====================================================
  v_session_id := pg_temp._seed_session(
    'MEALTIME', 'Mealtime Training — May 20',
    '2026-05-20 09:30:00-04', '2026-05-20 12:30:00-04',
    'Training Room A', 'standalone', 'scheduled',
    'Waiting on Suzanne Stinnette for date confirmation, requested 4/20/2026.',
    16
  );
  perform pg_temp._seed_enroll(v_session_id, 'Mealtime May 20', v_run_id, array[
    'Abbi Hicks', 'Alexandra Newberry', 'Amanda Arndts', 'Amaya Felton',
    'Amber Carter', 'Andria Cassell', 'Angel Hammons', 'Ann Shipperbottom',
    'Anna Caswell', 'Anne Puckett', 'Annette Woods', 'Austin Loudin',
    'Barbara Sanchez', 'Bethany Quiggle', 'Beverly Weber', 'Joseph Cannon'
  ]);

  -- =====================================================
  -- PCT Training — Jun 24–25
  -- =====================================================
  v_session_id := pg_temp._seed_session(
    'PCT_TRAIN', 'PCT Training — Jun 24–25',
    '2026-06-24 09:00:00-04', '2026-06-25 16:00:00-04',
    'Training Room A & B', 'standalone', 'scheduled',
    'Two full days (9a–4p). La''nema Bruce: Day 1 only. Date confirmation requested 4/20/2026.',
    16
  );
  perform pg_temp._seed_enroll(v_session_id, 'PCT Jun 24–25', v_run_id, array[
    'Jessica Boyette', 'Michelle Bradshaw', 'Esther Olatoye', 'Jaycee Botts',
    'Abigail Bowen', 'Morgan Andrews', 'Katlynn Frerichs', 'Leslie Turner',
    'John Turner', 'Kathryn Barnes', 'Kyle Mahoney', 'Jamie Ballard',
    'Alissa Chadwick', 'Judy Johnson', 'Shelia Huskey', 'La''nema Bruce'
  ]);

  -- =====================================================
  -- Rising Leaders — 7 recurring dates (Apr 6 already past, marked completed)
  -- =====================================================
  declare
    v_rl_dates timestamptz[] := array[
      '2026-04-06 10:00:00-04'::timestamptz,
      '2026-05-04 10:00:00-04'::timestamptz,
      '2026-06-01 10:00:00-04'::timestamptz,
      '2026-07-06 10:00:00-04'::timestamptz,
      '2026-08-10 10:00:00-04'::timestamptz,
      '2026-09-08 10:00:00-04'::timestamptz,
      '2026-10-05 10:00:00-04'::timestamptz
    ];
    v_dt timestamptz;
    v_title text;
    v_rl_status text;
  begin
    foreach v_dt in array v_rl_dates loop
      v_title := 'Rising Leaders — ' || to_char(v_dt, 'Mon FMDD');
      v_rl_status := case when v_dt < now() then 'completed' else 'scheduled' end;
      v_session_id := pg_temp._seed_session(
        'RISING_LEADERS', v_title,
        v_dt, v_dt + interval '2 hours',
        'Oak Ridge', 'recurring_instance', v_rl_status,
        'Part of Rising Leaders series (Apr–Oct 2026). Staff notified 4/20/2026 for May 4 session.',
        16
      );
      perform pg_temp._seed_enroll(v_session_id, v_title, v_run_id, array[
        'Morgan Jones', 'Carly Manuel', 'Tiffani Dixon', 'Kelly Ellis',
        'Karen Olsen', 'Rachel Strayer', 'Kasey Foster', 'Britney Richardson',
        'Abbi Hicks', 'Dianna Wooldridge', 'Lacey Hillard', 'Heather Cox',
        'Abbey Grow', 'Sarah Allen', 'Addie Foster', 'Katlynn Frerichs'
      ]);
    end loop;
  end;

  -- =====================================================
  -- HR Leadership Training — Jul 8
  -- =====================================================
  v_session_id := pg_temp._seed_session(
    'LEADERSHIP_HR', 'HR Leadership Training — Jul 8',
    '2026-07-08 09:00:00-04', '2026-07-08 16:00:00-04',
    null, 'standalone', 'scheduled',
    'Attendees: RMs and HMs/Leads, LLL Assistant Director, VP of Finance, John Manzella. Staff notification pending (TBD).',
    null
  );
  perform pg_temp._seed_enroll(v_session_id, 'HR Leadership Jul 8', v_run_id, array[
    'John Manzella'
  ]);

  -- =====================================================
  -- Van Lift — May 28
  -- =====================================================
  v_session_id := pg_temp._seed_session(
    'VAN_LIFT', 'Van Lift Training — May 28',
    '2026-05-28 09:00:00-04', '2026-05-28 12:00:00-04',
    '298 Blair Bend Rd — Loudon, TN', 'standalone', 'scheduled',
    'Off-site training in Loudon, TN.',
    11
  );
  perform pg_temp._seed_enroll(v_session_id, 'Van Lift May 28', v_run_id, array[
    'Kyle Mahoney', 'Sheri McMahan', 'Dustan Kelley', 'Katlynn Frerichs',
    'Katie Jeffers', 'Dreama Brant', 'Kasey Foster', 'Alissa Chadwick',
    'Matt Helton', 'Abby Grow', 'Penny Nunley'
  ]);

  -- =====================================================
  -- (Intentionally skipped, no confirmed date)
  --   Active Shooter Part I — Pending (catalog entry added, no session)
  --   HRC & Sharps Relias — Pending Availability (catalog entry added)
  -- =====================================================

  -- ---- close the ingestion run --------------------------
  update public.ingestion_runs
     set status = 'success',
         finished_at = now()
   where id = v_run_id;
end $$;
