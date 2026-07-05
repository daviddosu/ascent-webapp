import { cloud, currentUser } from './cloud'

export type CloudWorkspace = {
  tasks: Task[]
  goals: Goal[]
  reviews: Review[]
  dailyReviews: DailyReview[]
  lists: { name: string; color: string }[]
  profile: { displayName: string; timezone: string }
}

type Row = Record<string, any>

async function clientAndUser() {
  const user = await currentUser()
  const client = cloud
  if (!client || !user) throw new Error('A signed-in cloud account is required.')
  return { client, userId: user.id }
}

function throwIfError(result: { error: { message: string } | null }) {
  if (result.error) throw new Error(result.error.message)
}

export async function loadCloudWorkspace(): Promise<CloudWorkspace | null> {
  const { client, userId } = await clientAndUser()
  const [profileResult, listsResult, goalsResult, milestonesResult, tasksResult, subtasksResult, tagsResult, taskTagsResult, reviewsResult, dailyReviewsResult] = await Promise.all([
    client.from('profiles').select('*').eq('id', userId).maybeSingle(),
    client.from('lists').select('*').eq('user_id', userId).order('position'),
    client.from('goals').select('*').eq('user_id', userId).order('position'),
    client.from('milestones').select('*').eq('user_id', userId).order('position'),
    client.from('tasks').select('*').eq('user_id', userId).is('archived_at', null).order('position'),
    client.from('subtasks').select('*').eq('user_id', userId).order('position'),
    client.from('tags').select('*').eq('user_id', userId),
    client.from('task_tags').select('*').eq('user_id', userId),
    client.from('reviews').select('*').eq('user_id', userId).order('review_date', { ascending: false }),
    client.from('daily_reviews').select('*').eq('user_id', userId).order('review_date', { ascending: false }),
  ])
  ;[profileResult, listsResult, goalsResult, milestonesResult, tasksResult, subtasksResult, tagsResult, taskTagsResult, reviewsResult, dailyReviewsResult].forEach(throwIfError)

  const goalRows = (goalsResult.data ?? []) as Row[]
  const taskRows = (tasksResult.data ?? []) as Row[]
  const reviewRows = (reviewsResult.data ?? []) as Row[]
  const dailyReviewRows = (dailyReviewsResult.data ?? []) as Row[]
  if (!goalRows.length && !taskRows.length && !reviewRows.length && !dailyReviewRows.length) return null

  const listRows = (listsResult.data ?? []) as Row[]
  const milestoneRows = (milestonesResult.data ?? []) as Row[]
  const subtaskRows = (subtasksResult.data ?? []) as Row[]
  const tagRows = (tagsResult.data ?? []) as Row[]
  const taskTagRows = (taskTagsResult.data ?? []) as Row[]
  const listById = new Map(listRows.map(row => [row.id, row]))
  const tagById = new Map(tagRows.map(row => [row.id, row.name]))

  const goals: Goal[] = goalRows.map(row => ({
    id: row.id,
    title: row.title,
    why: row.why ?? '',
    targetDate: row.target_date ?? '',
    status: row.status,
    color: row.color,
    milestones: milestoneRows
      .filter(milestone => milestone.goal_id === row.id)
      .map(milestone => ({
        id: milestone.id,
        title: milestone.title,
        completed: Boolean(milestone.completed_at),
      })),
  }))

  const tasks: Task[] = taskRows.map(row => ({
    id: row.id,
    title: row.title,
    description: row.description ?? '',
    dueDate: row.due_date ?? new Date().toISOString().slice(0, 10),
    dueTime: row.due_time ?? '',
    list: listById.get(row.list_id)?.name ?? 'Personal',
    tags: taskTagRows
      .filter(relation => relation.task_id === row.id)
      .map(relation => tagById.get(relation.tag_id))
      .filter((name): name is string => Boolean(name)),
    priority: row.priority,
    completed: Boolean(row.completed_at),
    completedAt: row.completed_at,
    goalId: row.goal_id,
    estimate: row.estimate_minutes,
    recurring: row.recurrence,
    topThree: Boolean(row.top_three),
    carriedCount: row.carried_count ?? 0,
    lastCarryReason: row.last_carry_reason ?? '',
    position: row.position,
    createdAt: row.created_at,
    subtasks: subtaskRows
      .filter(subtask => subtask.task_id === row.id)
      .map(subtask => ({
        id: subtask.id,
        title: subtask.title,
        completed: Boolean(subtask.completed_at),
      })),
  }))

  return {
    tasks,
    goals,
    lists: listRows.map(row => ({ name: row.name, color: row.color })),
    reviews: reviewRows.map(row => ({
      id: row.id,
      date: row.review_date,
      wins: row.wins ?? '',
      blockers: row.blockers ?? '',
      stop: row.stop_doing ?? '',
      continue: row.continue_doing ?? '',
    })),
    dailyReviews: dailyReviewRows.map(row => ({
      id: row.id,
      date: row.review_date,
      win: row.win ?? '',
      blocker: row.blocker ?? '',
      tomorrow: row.tomorrow ?? '',
    })),
    profile: {
      displayName: (profileResult.data as Row | null)?.display_name ?? 'Ascent user',
      timezone: (profileResult.data as Row | null)?.timezone ?? 'UTC',
    },
  }
}

async function deleteMissing(table: string, userId: string, ids: string[]) {
  const { client } = await clientAndUser()
  let query = client.from(table).delete().eq('user_id', userId)
  if (ids.length) query = query.not('id', 'in', `(${ids.join(',')})`)
  const result = await query
  throwIfError(result)
}

export async function saveCloudWorkspace(workspace: CloudWorkspace) {
  const { client, userId } = await clientAndUser()

  throwIfError(await client.from('profiles').upsert({
    id: userId,
    display_name: workspace.profile.displayName,
    timezone: workspace.profile.timezone,
    updated_at: new Date().toISOString(),
  }))

  const listResult = await client
    .from('lists')
    .upsert(workspace.lists.map((list, position) => ({
      user_id: userId,
      name: list.name,
      color: list.color,
      position,
    })), { onConflict: 'user_id,name' })
    .select('id,name')
  throwIfError(listResult)
  const listIds = new Map(((listResult.data ?? []) as Row[]).map(row => [row.name, row.id]))

  if (workspace.goals.length) {
    const goalsResult = await client.from('goals').upsert(workspace.goals.map((goal, position) => ({
      id: goal.id,
      user_id: userId,
      title: goal.title,
      why: goal.why,
      target_date: goal.targetDate || null,
      status: goal.status,
      color: goal.color,
      position,
      updated_at: new Date().toISOString(),
    })))
    throwIfError(goalsResult)
  }

  const milestones = workspace.goals.flatMap(goal => goal.milestones.map((milestone, position) => ({
    id: milestone.id,
    user_id: userId,
    goal_id: goal.id,
    title: milestone.title,
    completed_at: milestone.completed ? new Date().toISOString() : null,
    position,
  })))
  if (milestones.length) throwIfError(await client.from('milestones').upsert(milestones))

  if (workspace.tasks.length) {
    const tasksResult = await client.from('tasks').upsert(workspace.tasks.map(item => ({
      id: item.id,
      user_id: userId,
      goal_id: item.goalId,
      list_id: listIds.get(item.list) ?? null,
      title: item.title,
      description: item.description,
      due_date: item.dueDate || null,
      due_time: item.dueTime || null,
      priority: item.priority,
      estimate_minutes: item.estimate,
      recurrence: item.recurring,
      top_three: item.topThree,
      carried_count: item.carriedCount,
      last_carry_reason: item.lastCarryReason,
      position: item.position,
      completed_at: item.completedAt,
      created_at: item.createdAt,
      updated_at: new Date().toISOString(),
    })))
    throwIfError(tasksResult)
  }

  const subtasks = workspace.tasks.flatMap(item => item.subtasks.map((subtask, position) => ({
    id: subtask.id,
    user_id: userId,
    task_id: item.id,
    title: subtask.title,
    completed_at: subtask.completed ? new Date().toISOString() : null,
    position,
  })))
  if (subtasks.length) throwIfError(await client.from('subtasks').upsert(subtasks))

  const uniqueTags = [...new Set(workspace.tasks.flatMap(item => item.tags))]
  let tagIds = new Map<string, string>()
  if (uniqueTags.length) {
    const tagResult = await client.from('tags').upsert(uniqueTags.map(name => ({
      user_id: userId,
      name,
    })), { onConflict: 'user_id,name' }).select('id,name')
    throwIfError(tagResult)
    tagIds = new Map(((tagResult.data ?? []) as Row[]).map(row => [row.name, row.id]))
  }

  throwIfError(await client.from('task_tags').delete().eq('user_id', userId))
  const taskTags = workspace.tasks.flatMap(item => item.tags.flatMap(name => {
    const tagId = tagIds.get(name)
    return tagId ? [{ user_id: userId, task_id: item.id, tag_id: tagId }] : []
  }))
  if (taskTags.length) throwIfError(await client.from('task_tags').upsert(taskTags))

  if (workspace.reviews.length) {
    throwIfError(await client.from('reviews').upsert(workspace.reviews.map(review => ({
      id: review.id,
      user_id: userId,
      review_date: review.date,
      wins: review.wins,
      blockers: review.blockers,
      stop_doing: review.stop,
      continue_doing: review.continue,
      updated_at: new Date().toISOString(),
    }))))
  }

  if (workspace.dailyReviews.length) {
    throwIfError(await client.from('daily_reviews').upsert(workspace.dailyReviews.map(review => ({
      id: review.id,
      user_id: userId,
      review_date: review.date,
      win: review.win,
      blocker: review.blocker,
      tomorrow: review.tomorrow,
      updated_at: new Date().toISOString(),
    }))))
  }
}
