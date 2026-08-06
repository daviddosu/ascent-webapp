import { currentUser, getCloudClient } from './cloud'

export const acceptedTaskFileTypes = [
  'image/png',
  'image/jpeg',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
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

function mapAsset(row: FileAssetRow): FileAsset {
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
  }
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
  return (data ?? []).map(mapAsset)
}

export async function uploadTaskFileAsset(taskId: string, file: File, reusable = false) {
  if (!acceptedTaskFileTypes.includes(file.type as typeof acceptedTaskFileTypes[number])) {
    throw new Error('Choose a PNG, JPEG, PDF, DOCX, or TXT file.')
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
