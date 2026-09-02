import { describe, expect, it } from 'vitest'
import { isUserVisibleTaskAttachment, selectUserVisibleGeneratedFiles, type FileAsset } from './file-assets'

function asset(overrides: Partial<FileAsset> = {}): FileAsset {
  return {
    id: 'asset-1', taskId: 'task-1', agentRunId: 'run-1', originalFilename: 'cv.pdf', mimeType: 'application/pdf', sizeBytes: 10, checksum: 'a', source: 'task_upload', reusable: false, originalAssetId: null, storageKey: 'private/cv.pdf', createdAt: '2026-08-25T00:00:00Z', assetKind: 'immutable_original', applicationCaseId: 'case-1', opportunityId: 'opp-1', sourceAssetIds: [], templateVersion: null, promptVersion: null, authorType: 'user', revisionHistory: [], approvalStatus: 'not_required', finalSubmissionDestination: null, artifactMetadata: null,
    ...overrides,
  }
}

describe('task attachment visibility', () => {
  it('hides internal HTML research captures even when stored as task uploads', () => {
    expect(isUserVisibleTaskAttachment(asset({ originalFilename: 'harvard-physics-source.html', mimeType: 'text/html' }))).toBe(false)
  })

  it('keeps the applicant CV visible', () => {
    expect(isUserVisibleTaskAttachment(asset())).toBe(true)
  })

  it('keeps a pending generated CV visible when the secondary artifact join is unavailable', () => {
    const generated = asset({
      source: 'roon_generated',
      assetKind: 'programme_derivative',
      originalFilename: 'David_Harvard_Physics_CV.pdf',
      approvalStatus: 'pending',
      artifactMetadata: null,
    })
    const superseded = { ...generated, id: 'asset-2', approvalStatus: 'superseded' as const }
    expect(selectUserVisibleGeneratedFiles([superseded, generated])).toEqual([generated])
  })
})
