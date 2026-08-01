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
  source: 'task_upload' | 'roon_generated'
  reusable: boolean
  originalAssetId: string | null
  storageKey: string
  createdAt: string
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
  }
}

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
    .select('id,task_id,agent_run_id,original_filename,mime_type,size_bytes,checksum,source,reusable,original_asset_id,storage_key,created_at')
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
    .select('id,task_id,agent_run_id,original_filename,mime_type,size_bytes,checksum,source,reusable,original_asset_id,storage_key,created_at')
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
  }).select('id,task_id,agent_run_id,original_filename,mime_type,size_bytes,checksum,source,reusable,original_asset_id,storage_key,created_at').single<FileAssetRow>()
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
