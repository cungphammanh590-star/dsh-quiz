import { describe, expect, it } from 'vitest'
import { normalizeQuestion, type QuizQuestion } from '../src/model.ts'
import { QuizStore, type QuizDomain } from '../src/store.ts'

function memoryDomain(): QuizDomain {
  const records = new Map<string, QuizQuestion>()
  const table = {
    get: (key: string) => records.get(key),
    entries: () => new Map(records).entries(),
    keys: () => new Map(records).keys(),
    get size() { return records.size },
    async put(key: string, value: QuizQuestion) { records.set(key, value) },
    async delete(key: string) { return records.delete(key) },
    async update(key: string, update: (current: QuizQuestion) => QuizQuestion) {
      const current = records.get(key)
      if (current === undefined) throw new Error('missing key')
      const next = update(current)
      records.set(key, next)
      return next
    },
  }
  return {
    name: 'dsh_quiz',
    table: () => table,
    close: () => Promise.resolve(),
  } as unknown as QuizDomain
}

function question(id: string): QuizQuestion {
  return normalizeQuestion({
    type: 'single',
    prompt: 'Which number is even?',
    options: ['1', '2'],
    correctAnswers: [1],
    explanation: 'Two is divisible by two.',
    topic: 'Arithmetic',
    difficulty: 'easy',
    sourceExcerpt: 'Even integers are divisible by two.',
  }, id, 'session-1', '2026-08-16T00:00:00.000Z')
}

describe('quiz store', () => {
  it('keeps drafts out of the bank until the user saves them', async () => {
    const store = new QuizStore(memoryDomain(), 10)
    store.addDraft(question('quiz-1'))
    expect(store.list()).toEqual([])

    await store.save('quiz-1', false)
    expect(store.list()).toHaveLength(1)
    expect(store.list()[0]?.reviewEnabled).toBe(false)
  })

  it('keeps review opt-in independent and records attempts', async () => {
    const store = new QuizStore(memoryDomain(), 10)
    store.addDraft(question('quiz-2'))
    await store.save('quiz-2', true)
    await store.recordAnswer('quiz-2', false)
    await store.recordAnswer('quiz-2', true)

    expect(store.list(undefined, true)).toMatchObject([{
      attempts: 2,
      correctAttempts: 1,
      reviewEnabled: true,
    }])
  })

  it('evicts only unsaved drafts when the bound is exceeded', () => {
    const store = new QuizStore(memoryDomain(), 1)
    store.addDraft(question('old'))
    store.addDraft(question('new'))
    expect(store.get('old')).toBeUndefined()
    expect(store.get('new')?.id).toBe('new')
  })
})
