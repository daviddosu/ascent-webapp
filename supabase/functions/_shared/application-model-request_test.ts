import { assertEquals, assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { ApplicationModelRequestError, requestApplicationModel } from './application-model-request.ts'

Deno.test('retries one transient model response and reports the retry without retrying the body side effect', async () => {
  let calls = 0
  const result = await requestApplicationModel<{ ok: boolean }>({
    apiKey: 'test-key',
    body: { model: 'test', input: 'application' },
    fetchImpl: async () => {
      calls += 1
      return calls === 1
        ? new Response(JSON.stringify({ error: { message: 'busy' } }), { status: 429, headers: { 'retry-after-ms': '0' } })
        : new Response(JSON.stringify({ ok: true }), { status: 200 })
    },
    sleep: async () => {},
  })
  assertEquals(calls, 2)
  assertEquals(result.payload, { ok: true })
  assertEquals(result.retryCount, 1)
  assertEquals(result.attempts, 2)
})

Deno.test('does not retry a non-transient provider error', async () => {
  let calls = 0
  await assertRejects(
    () => requestApplicationModel({
      apiKey: 'test-key',
      body: { model: 'test' },
      fetchImpl: async () => {
        calls += 1
        return new Response(JSON.stringify({ error: { message: 'invalid request' } }), { status: 400 })
      },
      sleep: async () => {},
    }),
    ApplicationModelRequestError,
  )
  assertEquals(calls, 1)
})
