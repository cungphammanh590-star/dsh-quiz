import { describe, expect, it } from 'vitest'
import { answerIsCorrect, normalizeQuestion } from '../src/model.ts'

const base = {
  type: 'multiple' as const,
  prompt: 'Which values are even?',
  options: ['1', '2', '4'],
  correctAnswers: [2, 1, 2],
  explanation: 'Two and four are divisible by two.',
  topic: 'Arithmetic',
  difficulty: 'easy' as const,
  sourceExcerpt: 'Even integers are divisible by two.',
}

describe('quiz question model', () => {
  it('normalizes answer indexes and grades without depending on order', () => {
    const question = normalizeQuestion(base, 'quiz-1', 'session-1', '2026-08-16T00:00:00.000Z')
    expect(question.correctAnswers).toEqual([1, 2])
    expect(answerIsCorrect(question, [2, 1])).toBe(true)
    expect(answerIsCorrect(question, [1])).toBe(false)
  })

  it('rejects ambiguous single-answer questions', () => {
    expect(() => normalizeQuestion(
      { ...base, type: 'single', correctAnswers: [1, 2] },
      'quiz-2',
      'session-1',
      '2026-08-16T00:00:00.000Z',
    )).toThrow('exactly one correct answer')
  })

  it('requires exactly two judgment options', () => {
    expect(() => normalizeQuestion(
      { ...base, type: 'true_false', correctAnswers: [0] },
      'quiz-3',
      'session-1',
      '2026-08-16T00:00:00.000Z',
    )).toThrow('exactly two options')
  })
})
