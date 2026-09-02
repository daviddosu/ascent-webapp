import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { normalizeDeadlineForPersistence, sameOfficialInstitutionDomain } from './david-applications.ts'

Deno.test('accepts verified university sibling domains for official application research', () => {
  assert(sameOfficialInstitutionDomain(
    'https://physics.stanford.edu/graduate/graduate-admissions',
    'https://gradadmissions.stanford.edu/apply/recommendations',
  ))
  assert(sameOfficialInstitutionDomain(
    'https://admissions.example.ac.uk/programmes/physics',
    'https://physics.example.ac.uk/phd',
  ))
})

Deno.test('rejects lookalikes, insecure URLs, and unrelated shared-hosting tenants', () => {
  assertEquals(sameOfficialInstitutionDomain(
    'https://physics.stanford.edu/graduate/graduate-admissions',
    'https://stanford.edu.example.org/admissions',
  ), false)
  assertEquals(sameOfficialInstitutionDomain(
    'https://physics.stanford.edu/graduate/graduate-admissions',
    'http://gradadmissions.stanford.edu/apply/recommendations',
  ), false)
  assertEquals(sameOfficialInstitutionDomain(
    'https://institution-a.github.io/admissions',
    'https://institution-b.github.io/recommendations',
  ), false)
  assertEquals(sameOfficialInstitutionDomain(
    'https://physics.one.ac.uk/admissions',
    'https://physics.two.ac.uk/recommendations',
  ), false)
})

Deno.test('keeps human deadlines out of timestamp persistence boundaries', () => {
  assertEquals(normalizeDeadlineForPersistence('December 15, 2026, at 5:00 p.m. Eastern Time', 'Eastern Time'), {
    dateTime: null,
    timezone: null,
  })
  assertEquals(normalizeDeadlineForPersistence('2026-12-15T17:00:00-05:00', 'America/New_York'), {
    dateTime: '2026-12-15T22:00:00.000Z',
    timezone: 'America/New_York',
  })
})
