import { currentUser, getCloudClient } from './cloud'

export const acceptedTaskFileTypes = [
  'image/png',
  'image/jpeg',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/html',
  'application/zip',
  'application/x-zip-compressed',
  'application/json',
  'application/x-ipynb+json',
] as const

export type FileAsset = {
  id: string
  taskId: string | null
  agentRunId: string | null
  originalFilename: string
  mimeType: string
  sizeBytes: number
  checksum: string
  source: 'task_upload' | 'roon_generated' | 'roon_writer_reply' | 'institution_reply'
  reusable: boolean
  originalAssetId: string | null
  storageKey: string
  createdAt: string
  assetKind: 'immutable_original' | 'canonical_profile_record' | 'generated_derivative' | 'programme_derivative' | 'writer_draft' | 'reference_letter' | 'edited_version' | 'approved_final' | 'submitted_version'
  applicationCaseId: string | null
  opportunityId: string | null
  sourceAssetIds: string[]
  templateVersion: string | null
  promptVersion: string | null
  authorType: string | null
  revisionHistory: unknown[]
  approvalStatus: 'not_required' | 'pending' | 'approved' | 'rejected' | 'superseded'
  finalSubmissionDestination: string | null
  artifactMetadata: Record<string, unknown> | null
}

type FileAssetRow = {
  id: string
  task_id: string | null
  agent_run_id: string | null
  original_filename: string
  mime_type: string
  size_bytes: number
  checksum: string
  source: FileAsset['source']
  reusable: boolean
  original_asset_id: string | null
  storage_key: string
  created_at: string
  asset_kind?: FileAsset['assetKind']
  application_case_id?: string | null
  opportunity_id?: string | null
  source_asset_ids?: string[]
  template_version?: string | null
  prompt_version?: string | null
  author_type?: string | null
  revision_history?: unknown[]
  approval_status?: FileAsset['approvalStatus']
  final_submission_destination?: string | null
}

function mapAsset(row: FileAssetRow, artifactMetadata: Record<string, unknown> | null = null): FileAsset {
  return {
    id: row.id,
    taskId: row.task_id,
    agentRunId: row.agent_run_id,
    originalFilename: row.original_filename,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    checksum: row.checksum,
    source: row.source,
    reusable: row.reusable,
    originalAssetId: row.original_asset_id,
    storageKey: row.storage_key,
    createdAt: row.created_at,
    assetKind: row.asset_kind ?? (row.source === 'task_upload' ? 'immutable_original' : 'generated_derivative'),
    applicationCaseId: row.application_case_id ?? null,
    opportunityId: row.opportunity_id ?? null,
    sourceAssetIds: row.source_asset_ids ?? (row.original_asset_id ? [row.original_asset_id] : []),
    templateVersion: row.template_version ?? null,
    promptVersion: row.prompt_version ?? null,
    authorType: row.author_type ?? (row.source === 'task_upload' ? 'user' : row.source === 'roon_writer_reply' ? 'writer' : row.source === 'institution_reply' ? 'institution' : 'david'),
    revisionHistory: row.revision_history ?? [],
    approvalStatus: row.approval_status ?? (row.source === 'task_upload' ? 'not_required' : 'pending'),
    finalSubmissionDestination: row.final_submission_destination ?? null,
    artifactMetadata,
  }
}

const finalGeneratedAssetKinds = new Set<FileAsset['assetKind']>(['approved_final', 'submitted_version'])
const currentCvRendererVersion = '1.8.0'

/** User task attachments exclude private research captures and other
 * evidence plumbing even when an older row was stored with `task_upload`.
 * The original asset remains available to the application evidence layer. */
export function isUserVisibleTaskAttachment(asset: Pick<FileAsset, 'source' | 'originalFilename' | 'mimeType' | 'applicationCaseId' | 'artifactMetadata' | 'assetKind'>) {
  if (asset.source === 'roon_generated') return false
  const metadata = asset.artifactMetadata ?? {}
  if (metadata.private_user_visible === false || metadata.user_visible === false || metadata.evidence_scope === 'internal' || metadata.evidence_scope === 'private') return false
  if (asset.assetKind === 'generated_derivative' && asset.source !== 'task_upload') return false
  const filename = asset.originalFilename.toLocaleLowerCase()
  const internalEvidenceName = /(?:^|[-_. ])(?:source|evidence|capture|snapshot|research-source|page-source|validation|trace|compiler|ats)(?:[-_. ]|$)/i.test(filename)
  if ((asset.mimeType === 'text/html' || asset.mimeType === 'application/json') && internalEvidenceName) return false
  if (asset.applicationCaseId && /\.(?:html?|json|log|tex)$/i.test(filename) && /(?:harvard|programme|faculty|physics|application)/i.test(filename) && internalEvidenceName) return false
  return true
}

function isCvFilename(filename: string) {
  return /(?:^|[\s_.-])(?:cv|resume|curriculum[\s_.-]*vitae)(?:$|[\s_.-])/i.test(filename)
}

function generatedAssetPriority(asset: FileAsset) {
  return (
    (asset.finalSubmissionDestination ? 100 : 0) +
    (asset.approvalStatus === 'approved' ? 20 : 0) +
    (finalGeneratedAssetKinds.has(asset.assetKind) ? 10 : 0) +
    (asset.approvalStatus === 'pending' ? 1 : 0)
  )
}

function cvFilenameSpecificity(filename: string) {
  return filename
    .replace(/\.pdf$/i, '')
    .split(/[\s_.-]+/)
    .filter(Boolean)
    .length
}

function newestGeneratedAsset(left: FileAsset, right: FileAsset) {
  const priorityDifference = generatedAssetPriority(right) - generatedAssetPriority(left)
  if (priorityDifference) return priorityDifference
  const specificityDifference = cvFilenameSpecificity(right.originalFilename) - cvFilenameSpecificity(left.originalFilename)
  if (specificityDifference) return specificityDifference
  const timeDifference = Date.parse(right.createdAt) - Date.parse(left.createdAt)
  if (Number.isFinite(timeDifference) && timeDifference) return timeDifference
  return right.id.localeCompare(left.id)
}

function hasCurrentCvRenderingEvidence(asset: FileAsset) {
  if (asset.mimeType !== 'application/pdf' || !isCvFilename(asset.originalFilename)) return true
  const metadata = asset.artifactMetadata
  // The artifact metadata join is a secondary read. A pending CV is already
  // a durable review checkpoint, so keep that exact candidate visible if the
  // join is temporarily unavailable; superseded or rejected PDFs remain
  // hidden until their provenance can be verified.
  if (!metadata) return asset.approvalStatus === 'pending'
  return metadata?.artifact_role === 'compiled_pdf' && metadata.renderer_version === currentCvRendererVersion
}

/**
 * Select the files that are safe to show as user deliverables.
 *
 * Generated LaTeX, compiler logs, ATS text, and previews are private quality
 * checks. Older rows do not have the final-destination marker, so a PDF named
 * like a CV is retained as a compatibility fallback and deduplicated to one
 * latest candidate while new rows use the explicit marker.
 */
export function selectUserVisibleGeneratedFiles(assets: FileAsset[]) {
  const generated = assets.filter(asset => asset.source === 'roon_generated')
  const visible = generated.filter(asset => (
    asset.mimeType === 'application/pdf' ||
    Boolean(asset.finalSubmissionDestination) ||
    finalGeneratedAssetKinds.has(asset.assetKind)
  ) && hasCurrentCvRenderingEvidence(asset))
  const cvCandidates = visible
    .filter(asset => asset.mimeType === 'application/pdf' && isCvFilename(asset.originalFilename))
    .sort(newestGeneratedAsset)
  const selectedCv = cvCandidates[0]
  const cvCandidateIds = new Set(cvCandidates.map(asset => asset.id))
  return visible
    .filter(asset => !cvCandidateIds.has(asset.id) || asset.id === selectedCv?.id)
    .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt))
}

const fileAssetSelect = 'id,task_id,agent_run_id,original_filename,mime_type,size_bytes,checksum,source,reusable,original_asset_id,storage_key,created_at,asset_kind,application_case_id,opportunity_id,source_asset_ids,template_version,prompt_version,author_type,revision_history,approval_status,final_submission_destination'

async function sha256(file: File) {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

export async function loadTaskFileAssets(taskId: string) {
  const client = await getCloudClient()
  const user = await currentUser()
  if (!client || !user) return []
  const { data, error } = await client
    .from('file_assets')
    .select(fileAssetSelect)
    .eq('task_id', taskId)
    .order('created_at')
    .returns<FileAssetRow[]>()
  if (error) throw new Error(error.message)
  const rows = data ?? []
  const artifactMetadataByAssetId = new Map<string, Record<string, unknown>>()
  const assetIds = rows.map(row => row.id).filter(Boolean)
  if (assetIds.length) {
    const artifactResult = await client
      .from('application_artifacts')
      .select('file_asset_id,metadata')
      .in('file_asset_id', assetIds)
    if (artifactResult.error && artifactResult.error.code !== '42P01') throw new Error(artifactResult.error.message)
    for (const artifact of (artifactResult.data ?? []) as Array<{ file_asset_id?: unknown; metadata?: unknown }>) {
      if (!artifact.file_asset_id || !artifact.metadata || typeof artifact.metadata !== 'object' || Array.isArray(artifact.metadata)) continue
      artifactMetadataByAssetId.set(String(artifact.file_asset_id), artifact.metadata as Record<string, unknown>)
    }
  }
  return rows.map(row => mapAsset(row, artifactMetadataByAssetId.get(row.id) ?? null))
}

export async function uploadTaskFileAsset(taskId: string, file: File, reusable = false) {
  if (!acceptedTaskFileTypes.includes(file.type as typeof acceptedTaskFileTypes[number])) {
    throw new Error('Choose a PNG, JPEG, PDF, DOCX, HTML, TXT, ZIP, or notebook file.')
  }
  if (file.size > 20 * 1024 * 1024) throw new Error('Attachments must be 20 MB or smaller.')
  const client = await getCloudClient()
  const user = await currentUser()
  if (!client || !user) throw new Error('Sign in to attach files.')
  const checksum = await sha256(file)
  const existing = await client.from('file_assets')
    .select(fileAssetSelect)
    .eq('user_id', user.id).eq('task_id', taskId).eq('checksum', checksum).maybeSingle<FileAssetRow>()
  if (existing.data) return mapAsset(existing.data)
  const assetId = crypto.randomUUID()
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-160) || 'attachment'
  const storageKey = `${user.id}/${assetId}/${safeName}`
  const stored = await client.storage.from('private-file-assets').upload(storageKey, file, {
    contentType: file.type,
    upsert: false,
  })
  if (stored.error) throw new Error(stored.error.message)
  const inserted = await client.from('file_assets').insert({
    id: assetId,
    user_id: user.id,
    task_id: taskId,
    original_filename: file.name.slice(0, 255),
    mime_type: file.type,
    storage_key: storageKey,
    size_bytes: file.size,
    checksum,
    source: 'task_upload',
    reusable,
    asset_kind: 'immutable_original',
  }).select(fileAssetSelect).single<FileAssetRow>()
  if (inserted.error) {
    await client.storage.from('private-file-assets').remove([storageKey])
    throw new Error(inserted.error.message)
  }
  return mapAsset(inserted.data)
}

export async function setFileAssetReusable(assetId: string, reusable: boolean) {
  const client = await getCloudClient()
  const user = await currentUser()
  if (!client || !user) throw new Error('Sign in to update this file.')
  const { error } = await client.rpc('set_file_asset_reusable', { p_asset_id: assetId, p_reusable: reusable })
  if (error) throw new Error(error.message)
}

export async function removeTaskFileAsset(assetId: string) {
  const client = await getCloudClient()
  const user = await currentUser()
  if (!client || !user) throw new Error('Sign in to remove this file.')
  const found = await client.from('file_assets').select('storage_key').eq('id', assetId).eq('user_id', user.id).single<{ storage_key: string }>()
  if (found.error) throw new Error(found.error.message)
  const removed = await client.from('file_assets').delete().eq('id', assetId).eq('user_id', user.id)
  if (removed.error) throw new Error(removed.error.message)
  await client.storage.from('private-file-assets').remove([found.data.storage_key])
}

export async function downloadTaskFileAsset(asset: FileAsset) {
  const client = await getCloudClient()
  const user = await currentUser()
  if (!client || !user) throw new Error('Sign in to preview this file.')
  const { data, error } = await client.storage.from('private-file-assets').download(asset.storageKey)
  if (error || !data) throw new Error(error?.message ?? 'The file could not be opened.')
  return data
}

export async function createTaskFileAssetViewUrl(asset: FileAsset) {
  const client = await getCloudClient()
  const user = await currentUser()
  if (!client || !user) throw new Error('Sign in to preview this file.')
  const { data, error } = await client.storage.from('private-file-assets').createSignedUrl(asset.storageKey, 10 * 60)
  if (error || !data?.signedUrl) throw new Error(error?.message ?? 'The file could not be opened.')
  return data.signedUrl
}
