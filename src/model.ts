import { z } from 'zod'

export const QUIZ_TYPES = ['single', 'multiple', 'true_false'] as const
export type QuizType = typeof QUIZ_TYPES[number]

export const DIFFICULTIES = ['easy', 'medium', 'hard'] as const
export type Difficulty = typeof DIFFICULTIES[number]

export const questionSchema = z.object({
  id: z.string().min(1),
  type: z.enum(QUIZ_TYPES),
  prompt: z.string().min(1),
  options: z.array(z.string().min(1)).min(2).max(8),
  correctAnswers: z.array(z.number().int().nonnegative()).min(1),
  explanation: z.string().min(1),
  topic: z.string().min(1),
  difficulty: z.enum(DIFFICULTIES),
  sourceExcerpt: z.string().min(1),
  sourceSessionId: z.string().min(1),
  createdAt: z.string().datetime(),
  reviewEnabled: z.boolean(),
  attempts: z.number().int().nonnegative(),
  correctAttempts: z.number().int().nonnegative(),
})

export type QuizQuestion = z.infer<typeof questionSchema>

export interface QuestionDraftInput {
  readonly type: QuizType
  readonly prompt: string
  readonly options: readonly string[]
  readonly correctAnswers: readonly number[]
  readonly explanation: string
  readonly topic: string
  readonly difficulty: Difficulty
  readonly sourceExcerpt: string
}

export function normalizeQuestion(
  input: QuestionDraftInput,
  id: string,
  sourceSessionId: string,
  createdAt: string,
): QuizQuestion {
  const prompt = input.prompt.trim()
  const options = input.options.map(option => option.trim())
  const explanation = input.explanation.trim()
  const topic = input.topic.trim()
  const sourceExcerpt = input.sourceExcerpt.trim()
  if ([prompt, explanation, topic, sourceExcerpt, ...options].some(value => value.length === 0)) {
    throw new Error('question text, options, explanation, topic, and source excerpt must be non-empty')
  }
  if (options.length < 2 || options.length > 8) {
    throw new Error('a question must have between 2 and 8 options')
  }
  const correctAnswers = [...new Set(input.correctAnswers)].sort((a, b) => a - b)
  if (correctAnswers.length === 0 || correctAnswers.some(index => index < 0 || index >= options.length)) {
    throw new Error('correct answer indexes must identify at least one existing option')
  }
  if (input.type !== 'multiple' && correctAnswers.length !== 1) {
    throw new Error(`${input.type} questions must have exactly one correct answer`)
  }
  if (input.type === 'true_false' && options.length !== 2) {
    throw new Error('true_false questions must have exactly two options')
  }
  return questionSchema.parse({
    id,
    type: input.type,
    prompt,
    options,
    correctAnswers,
    explanation,
    topic,
    difficulty: input.difficulty,
    sourceExcerpt,
    sourceSessionId,
    createdAt,
    reviewEnabled: false,
    attempts: 0,
    correctAttempts: 0,
  })
}

export function answerIsCorrect(question: QuizQuestion, selectedAnswers: readonly number[]): boolean {
  const selected = [...new Set(selectedAnswers)].sort((a, b) => a - b)
  return selected.length === question.correctAnswers.length
    && selected.every((answer, index) => answer === question.correctAnswers[index])
}
