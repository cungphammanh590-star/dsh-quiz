import { describe, expect, it, vi } from 'vitest'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import { QuizClient } from '../src/client/api.ts'

describe('QuizClient', () => {
  it('uses single-segment read and write RPC channels', async () => {
    const call = vi.fn(async () => ({ ok: true as const, value: [] }))
    const client = new QuizClient({ rpc: { call } } as unknown as ConnectionHandle)

    await client.list('closures', true)
    await client.answer('quiz-1', [0])

    expect(call).toHaveBeenNthCalledWith(1, '/dsh-quiz-read', 'list', {
      topic: 'closures',
      reviewOnly: true,
    })
    expect(call).toHaveBeenNthCalledWith(2, '/dsh-quiz-write', 'answer', {
      quizId: 'quiz-1',
      selectedAnswers: [0],
    })
  })
})
