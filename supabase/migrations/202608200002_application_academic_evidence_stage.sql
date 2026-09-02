-- Academic-evidence coordination is a first-class reversible preparation stage.
-- Keep the legacy current_stage projection aligned with the coordinator instead
-- of forcing it into document_preparation and losing the visible operation.
alter table public.application_cases
  drop constraint if exists application_cases_current_stage_check;

alter table public.application_cases
  add constraint application_cases_current_stage_check
  check (current_stage = any (array[
    'intake',
    'research',
    'shortlist_approval',
    'document_preparation',
    'academic_evidence',
    'writer_assignment',
    'referee_coordination',
    'portal_preparation',
    'submission_approval',
    'submitted',
    'monitoring',
    'interview',
    'additional_documents',
    'offer',
    'rejected',
    'withdrawn',
    'closed'
  ]));
