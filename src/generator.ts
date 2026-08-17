import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import { BlockAssembler, createUserMessage, type FinishReason, type GenerateOptions } from '@deepseek-ai/dsh-llm'
import type { SessionId } from '@deepseek-ai/dsh-session'
import { z } from 'zod'
import { DIFFICULTIES, QUIZ_TYPES, normalizeQuestion, type Difficulty, type QuizQuestion } from './model.ts'
import type { QuizStore } from './store.ts'

const generationQuestionSchema = z.object({
  type: z.enum(QUIZ_TYPES),
  prompt: z.string().min(1),
  options: z.array(z.string().min(1)).min(2).max(8),
  correctAnswers: z.array(z.number().int().nonnegative()).min(1),
  explanation: z.string().min(1),
  topic: z.string().min(1),
  sourceExcerpt: z.string().min(1),
})

const generationResponseSchema = z.object({
  questions: z.array(generationQuestionSchema).min(1).max(10),
})

export type RequestedQuizType = typeof QUIZ_TYPES[number] | 'mixed'

export interface QuizGenerationRequest {
  sessionId: string
  messageId: string
  type: RequestedQuizType
  count: number
  difficulty: Difficulty
}

export interface QuizGenerationPolicy {
  maxQuestions: number
  maxSourceChars: number
  maxOutputTokens: number
  timeoutMs: number
}

interface AssistantSource {
  text: string
  provider: string
  model: string
}

function sourceFromSession(ctx: Context, sessionId: string, messageId: string): AssistantSource | null {
  const agent = ctx.agents.get(sessionId as SessionId)
  if (agent === undefined) return null
  let route: { provider: string; model: string } | undefined
  let text: string | undefined
  for (const event of agent.session.events) {
    if (event.type === 'request/header') {
      route = { provider: event.data.header.config.provider, model: event.data.header.config.model }
    }
    if (event.type === 'assistant/message' && event.data.message.id === messageId) {
      const value = event.data.message.content
        .filter(block => block.type === 'text')
        .map(block => block.text)
        .join('\n\n')
        .trim()
      if (value !== '') text = value
    }
  }
  return text === undefined || route === undefined ? null : { text, ...route }
}

function systemPrompt(request: QuizGenerationRequest): string {
  const type = request.type === 'mixed' ? 'a balanced mix of single, multiple, and true_false' : `only ${request.type}`
  return [
    'Create practice questions grounded only in the supplied assistant answer.',
    `Return exactly ${request.count} questions using ${type} question types at ${request.difficulty} difficulty.`,
    'Return one JSON object and nothing else. Do not use Markdown fences.',
    'The object must have a questions array. Every question must contain type, prompt, options, correctAnswers, explanation, topic, and sourceExcerpt.',
    'correctAnswers contains zero-based option indexes. single and true_false have exactly one correct index. true_false has exactly two localized options.',
    'sourceExcerpt must be an exact non-empty excerpt from the supplied answer.',
  ].join('\n')
}

function finishError(finish: FinishReason | undefined): Error | undefined {
  if (finish === undefined) return new Error('quiz generation ended without a finish reason')
  switch (finish.kind) {
    case 'stop': return undefined
    case 'error':
    case 'aborted': return Object.assign(new Error(finish.failure.message), { code: finish.failure.code })
    case 'max-tokens': return new Error('quiz generation reached its output-token limit')
    case 'tool-calls': return new Error('quiz generation unexpectedly requested a tool')
    default: return new Error('quiz generation returned an unsupported finish reason')
  }
}

export function parseGeneratedQuestions(text: string): z.infer<typeof generationResponseSchema> {
  const trimmed = text.trim()
  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    throw new Error('quiz model returned invalid JSON')
  }
  return generationResponseSchema.parse(parsed)
}

export async function generateQuizDrafts(
  ctx: Context,
  store: QuizStore,
  request: QuizGenerationRequest,
  signal: AbortSignal,
  policy: QuizGenerationPolicy,
): Promise<QuizQuestion[]> {
  signal.throwIfAborted()
  if (!Number.isInteger(request.count) || request.count < 1 || request.count > policy.maxQuestions) {
    throw new Error(`quiz count must be an integer between 1 and ${policy.maxQuestions}`)
  }
  if (!['single', 'multiple', 'true_false', 'mixed'].includes(request.type)) {
    throw new Error('quiz type is not supported')
  }
  if (!DIFFICULTIES.includes(request.difficulty)) throw new Error('quiz difficulty is not supported')
  const source = sourceFromSession(ctx, request.sessionId, request.messageId)
  if (source === null) throw new Error('无法读取这条回答或模型路由，请刷新后重试。')
  const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(policy.timeoutMs)])
  const input = JSON.stringify({ assistantAnswer: source.text.slice(0, policy.maxSourceChars) })
  const options: GenerateOptions = {
    provider: source.provider,
    model: source.model,
    messages: [createUserMessage({
      content: [{ type: 'text', text: input }],
      source: { kind: 'plugin', plugin: 'dsh-quiz' },
    })],
    system: systemPrompt(request),
    maxTokens: policy.maxOutputTokens,
    sessionId: request.sessionId as SessionId,
    signal: requestSignal,
  }
  const assembler = new BlockAssembler()
  for await (const chunk of ctx.llm.stream(options)) {
    requestSignal.throwIfAborted()
    assembler.push(chunk)
  }
  requestSignal.throwIfAborted()
  const terminalError = finishError(assembler.finish)
  if (terminalError !== undefined) throw terminalError
  const blocks = assembler.blocks()
  if (blocks.some(block => block.type === 'tool-call')) throw new Error('quiz model output must contain text only')
  const text = blocks.filter(block => block.type === 'text').map(block => block.text).join('')
  const generated = parseGeneratedQuestions(text)
  if (generated.questions.length !== request.count) {
    throw new Error(`quiz model returned ${generated.questions.length} questions instead of ${request.count}`)
  }
  const createdAt = new Date().toISOString()
  return generated.questions.map(raw => {
    const question = normalizeQuestion({
      ...raw,
      difficulty: request.difficulty,
    }, randomUUID(), request.sessionId, createdAt)
    if (request.type !== 'mixed' && question.type !== request.type) {
      throw new Error(`quiz model returned ${question.type} instead of ${request.type}`)
    }
    store.addDraft(question)
    return question
  })
}
