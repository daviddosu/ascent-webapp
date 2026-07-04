import { cloud, currentUser } from './cloud'

export type CoachingInsight = {
  title: string
  detail: string
  actions: string[]
}

export async function requestCoachingInsight(): Promise<CoachingInsight> {
  const user = await currentUser()
  if (!cloud || !user) throw new Error('Sign in to request a private coaching insight.')
  const { data, error } = await cloud.functions.invoke<CoachingInsight>('ai-coach', { method: 'POST' })
  if (error || !data) throw new Error(error?.message ?? 'No coaching insight was returned.')
  return data
}
