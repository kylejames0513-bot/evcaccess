-- EVC workbook import sources and completion provenance for training-matrix imports.

alter type public.import_source add value if not exists 'evc_training_xlsx';
alter type public.import_source add value if not exists 'evc_merged_employees_xlsx';

alter type public.completion_source add value if not exists 'import_evc_training';
