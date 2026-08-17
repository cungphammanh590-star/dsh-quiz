import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { defineTool, type JsonValue } from '@deepseek-ai/dsh-tools'
import { answerIsCorrect, normalizeQuestion, type QuestionDraftInput, type QuizQuestion } from './model.ts'
import { QuizStore, quizDomainSpec } from './store.ts'
import { registerQuizRpc } from './rpc.ts'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-client-connection'

export { answerIsCorrect, normalizeQuestion } from './model.ts'
export type { Difficulty, QuestionDraftInput, QuizQuestion, QuizType } from './model.ts'

export const name = 'quiz'
export const inject = ['storageDomain', 'systemPrompt', 'tools']

export interface Config {
  maxDrafts?: number
  maxQuestionsPerBatch?: number
}

export const Config: z<Config> = z.object({
  maxDrafts: z.number().step(1).min(1).max(500).default(50),
  maxQuestionsPerBatch: z.number().step(1).min(1).max(20).default(10),
})

const QUESTION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'string', required: true },
    type: { type: 'string', enum: ['single', 'multiple', 'true_false'], required: true },
    prompt: { type: 'string', required: true },
    options: { type: 'array', items: { type: 'string' }, required: true },
    correctAnswers: { type: 'array', items: { type: 'integer' }, required: true },
    explanation: { type: 'string', required: true },
    topic: { type: 'string', required: true },
    difficulty: { type: 'string', enum: ['easy', 'medium', 'hard'], required: true },
    sourceExcerpt: { type: 'string', required: true },
    sourceSessionId: { type: 'string', required: true },
    createdAt: { type: 'string', required: true },
    reviewEnabled: { type: 'boolean', required: true },
    attempts: { type: 'integer', required: true },
    correctAttempts: { type: 'integer', required: true },
  },
} as const

const QUESTION_INPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    type: {
      type: 'string',
      enum: ['single', 'multiple', 'true_false'],
      required: true,
      description: 'single, multiple, or true_false, exactly as requested by the user.',
    },
    prompt: { type: 'string', required: true, description: 'A clear question answerable from source_excerpt.' },
    options: {
      type: 'array',
      required: true,
      description: 'Two to eight non-empty options. For true_false use exactly two localized options.',
      items: { type: 'string' },
    },
    correct_answers: {
      type: 'array',
      required: true,
      description: 'Zero-based indexes of all correct options.',
      items: { type: 'integer' },
    },
    explanation: {
      type: 'string',
      required: true,
      description: 'Why the answer is correct, grounded only in source_excerpt.',
    },
    topic: { type: 'string', required: true, description: 'A short topic label.' },
    difficulty: { type: 'string', enum: ['easy', 'medium', 'hard'], required: true },
    source_excerpt: {
      type: 'string',
      required: true,
      description: 'The exact relevant excerpt from the conversation answer used to construct the question.',
    },
  },
} as const

function publicQuestion(question: QuizQuestion, revealAnswer: boolean): Record<string, JsonValue> {
  return {
    id: question.id,
    type: question.type,
    prompt: question.prompt,
    options: question.options,
    topic: question.topic,
    difficulty: question.difficulty,
    sourceSessionId: question.sourceSessionId,
    reviewEnabled: question.reviewEnabled,
    attempts: question.attempts,
    correctAttempts: question.correctAttempts,
    ...(revealAnswer ? {
      correctAnswers: question.correctAnswers,
      explanation: question.explanation,
      sourceExcerpt: question.sourceExcerpt,
    } : {}),
  }
}

export async function apply(ctx: Context, config: Config): Promise<void> {
  const maxDrafts = config.maxDrafts ?? 50
  const maxQuestionsPerBatch = config.maxQuestionsPerBatch ?? 10
  const domain = await ctx.storageDomain.open(quizDomainSpec)
  ctx.effect(() => () => domain.close())
  const store = new QuizStore(domain, maxDrafts)
  ctx.inject(['agents', 'connection'], (webCtx) => {
    registerQuizRpc(webCtx, webCtx.connection, store)
  })

  ctx.systemPrompt.section({
    name: 'tool:quiz',
    order: 118,
    text: 'Quiz tools turn a specific educational answer into optional practice. Never create a quiz unless the user asks. Follow the user\'s requested question type, count, and difficulty; ask when a material choice is missing. Ground every question and explanation only in the supplied conversation excerpt. quiz_create_draft does not add questions to the durable library. Show the questions without revealing answers. After the user answers, call quiz_answer. Call quiz_save only after the user explicitly chooses to add a question, and keep review disabled unless the user explicitly enables it.',
  })

  ctx.tools.register(defineTool({
    name: 'quiz_create_draft',
    description: 'Create temporary quiz questions from a conversation answer after the user asks for a quiz. This does not add them to the durable question bank.',
    parameters: {
      questions: {
        type: 'array',
        required: true,
        description: `One to ${maxQuestionsPerBatch} questions, matching the user's requested type and count.`,
        items: QUESTION_INPUT_SCHEMA,
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          questions: { type: 'array', items: QUESTION_SCHEMA, required: true },
          saved: { type: 'boolean', required: true },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: JSON.stringify({ questions: value.questions.map(question => publicQuestion(question, false)), saved: false }),
      }],
      presentationMeta: (_args, value) => ({
        kind: 'quiz-drafts',
        questions: value.questions.map(question => publicQuestion(question, false)),
      }),
    },
    execute(args, exec) {
      if (!exec.agent) throw new Error('quiz_create_draft requires an owning agent session')
      if (args.questions.length < 1 || args.questions.length > maxQuestionsPerBatch) {
        throw new Error(`questions must contain between 1 and ${maxQuestionsPerBatch} items`)
      }
      const createdAt = new Date().toISOString()
      const questions = args.questions.map((raw): QuizQuestion => {
        const input: QuestionDraftInput = {
          type: raw.type,
          prompt: raw.prompt,
          options: raw.options,
          correctAnswers: raw.correct_answers,
          explanation: raw.explanation,
          topic: raw.topic,
          difficulty: raw.difficulty,
          sourceExcerpt: raw.source_excerpt,
        }
        const question = normalizeQuestion(input, randomUUID(), exec.agent!.session.id, createdAt)
        store.addDraft(question)
        return question
      })
      return Promise.resolve({ questions, saved: false })
    },
    presentCall: args => ({ card: 'generic', title: `Create ${args.questions.length} quiz draft${args.questions.length === 1 ? '' : 's'}`, kind: 'other' }),
  }))

  ctx.tools.register(defineTool({
    name: 'quiz_answer',
    description: 'Grade the user answer to a draft or saved quiz question and return the grounded explanation.',
    parameters: {
      quiz_id: { type: 'string', required: true },
      selected_answers: {
        type: 'array',
        required: true,
        description: 'Zero-based indexes selected by the user.',
        items: { type: 'integer' },
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          correct: { type: 'boolean', required: true },
          correctAnswers: { type: 'array', items: { type: 'integer' }, required: true },
          explanation: { type: 'string', required: true },
          attempts: { type: 'integer', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    async execute(args) {
      const question = store.get(args.quiz_id)
      if (question === undefined) throw new Error(`quiz question ${JSON.stringify(args.quiz_id)} was not found`)
      if (args.selected_answers.some(index => index < 0 || index >= question.options.length)) {
        throw new Error('selected answer indexes must identify existing options')
      }
      const correct = answerIsCorrect(question, args.selected_answers)
      const updated = await store.recordAnswer(question.id, correct)
      return {
        correct,
        correctAnswers: updated.correctAnswers,
        explanation: updated.explanation,
        attempts: updated.attempts,
      }
    },
    presentCall: () => ({ card: 'generic', title: 'Grade quiz answer', kind: 'read' }),
  }))

  ctx.tools.register(defineTool({
    name: 'quiz_save',
    description: 'Add a quiz draft to the durable question bank only after the user explicitly asks to save it. Review remains opt-in.',
    parameters: {
      quiz_id: { type: 'string', required: true },
      review_enabled: {
        type: 'boolean',
        required: true,
        description: 'True only when the user explicitly wants this question included in review.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: { question: { ...QUESTION_SCHEMA, required: true } },
      },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(publicQuestion(value.question, true)) }],
    },
    async execute(args) {
      return { question: await store.save(args.quiz_id, args.review_enabled) }
    },
    presentCall: () => ({ card: 'generic', title: 'Save quiz question', kind: 'edit' }),
  }))

  ctx.tools.register(defineTool({
    name: 'quiz_list',
    description: 'List saved question-bank entries, optionally filtered by topic or review status.',
    parameters: {
      topic: { type: 'string', description: 'Optional case-insensitive topic substring.' },
      review_only: { type: 'boolean', description: 'Return only questions opted into review.' },
      reveal_answers: { type: 'boolean', description: 'Reveal answers only when the user asks to inspect the bank, not during practice.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          questions: { type: 'array', items: { type: 'object', additionalProperties: true }, required: true },
          count: { type: 'integer', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    execute(args) {
      const questions = store.list(args.topic, args.review_only ?? false)
        .map(question => publicQuestion(question, args.reveal_answers ?? false))
      return Promise.resolve({ questions, count: questions.length })
    },
    presentCall: () => ({ card: 'generic', title: 'Browse quiz bank', kind: 'read' }),
  }))
}
