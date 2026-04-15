-- First-class tracker rows for hub UI + Excel row correlation (normalized; not workbook layout).

CREATE TABLE public.new_hire_tracker_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sheet text NOT NULL,
  row_number integer NOT NULL,
  section text NOT NULL DEFAULT 'new_hire',
  last_name text NOT NULL,
  first_name text NOT NULL,
  hire_date date NOT NULL,
  paylocity_id text,
  division text,
  department text,
  position text,
  job_title text,
  status text NOT NULL DEFAULT 'active',
  notes text,
  employee_id uuid REFERENCES public.employees (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT new_hire_tracker_rows_sheet_row_section UNIQUE (sheet, row_number, section)
);

CREATE TABLE public.separation_tracker_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fy_sheet text NOT NULL,
  row_number integer NOT NULL,
  last_name text NOT NULL,
  first_name text NOT NULL,
  date_of_separation date NOT NULL,
  employee_id uuid REFERENCES public.employees (id) ON DELETE SET NULL,
  sync_status text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT separation_tracker_rows_sheet_row UNIQUE (fy_sheet, row_number)
);

CREATE INDEX new_hire_tracker_rows_sheet_idx ON public.new_hire_tracker_rows (sheet);
CREATE INDEX separation_tracker_rows_fy_sheet_idx ON public.separation_tracker_rows (fy_sheet);

ALTER TABLE public.new_hire_tracker_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.separation_tracker_rows ENABLE ROW LEVEL SECURITY;
