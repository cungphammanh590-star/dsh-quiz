import type { Context } from '@deepseek-ai/cordis'
import type { HostConnectionHandle } from '@deepseek-ai/dsh-client-connection'
import type { RpcResult } from '@deepseek-ai/dsh-host-apiproxy/api'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-agent'
import { answerIsCorrect } from './model.ts'
import { QUIZ_READ_CHANNEL, QUIZ_WRITE_CHANNEL } from './protocol.ts'
import { generateQuizDrafts, type QuizGenerationPolicy } from './generator.ts'
import type { QuizStore } from './store.ts'

function success(value: unknown): RpcResult<unknown> { return { ok: true, value } }
function failure(error: unknown): RpcResult<unknown> {
  return { ok: false, error: { code: 'internal', message: error instanceof Error ? error.message : String(error), details: {} } }
}
function payloadObject(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('payload must be an object')
  return value as Record<string, unknown>
}

function assistantMessageText(ctx: Context, sessionId: string, messageId: string): { messageId: string; text: string } | null {
  const agent = ctx.agents.get(sessionId as SessionId)
  if (agent === undefined) return null
  for (const event of agent.session.events) {
    if (event.type !== 'assistant/message' || event.data.message.id !== messageId) continue
    const text = event.data.message.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('\n\n')
      .trim()
    return text === '' ? null : { messageId, text }
  }
  return null
}

export function registerQuizRpc(ctx: Context, connection: HostConnectionHandle, store: QuizStore, generationPolicy: QuizGenerationPolicy): void {
  connection.rpc.handle(QUIZ_READ_CHANNEL, async (endpoint, rawPayload) => {
    try {
      const payload = payloadObject(rawPayload)
      if (endpoint === 'assistant-message') {
        return success(assistantMessageText(ctx, String(payload.sessionId ?? ''), String(payload.messageId ?? '')))
      }
      if (endpoint === 'list') {
        return success(store.list(
          payload.topic === undefined ? undefined : String(payload.topic),
          payload.reviewOnly === true,
        ))
      }
      if (endpoint === 'get') return success(store.get(String(payload.quizId ?? '')) ?? null)
      return { ok: false, error: { code: 'bad-request', message: `unknown quiz read endpoint: ${endpoint}`, details: { issues: [] } } }
    } catch (error) {
      return failure(error)
    }
  }, { authority: 'trusted-host' })

  connection.rpc.handle(QUIZ_WRITE_CHANNEL, async (endpoint, rawPayload, signal) => {
    try {
      const payload = payloadObject(rawPayload)
      const quizId = String(payload.quizId ?? '')
      if (endpoint === 'generate') {
        return success(await generateQuizDrafts(ctx, store, {
          sessionId: String(payload.sessionId ?? ''),
          messageId: String(payload.messageId ?? ''),
          type: String(payload.type ?? '') as 'single' | 'multiple' | 'true_false' | 'mixed',
          count: Number(payload.count),
          difficulty: String(payload.difficulty ?? '') as 'easy' | 'medium' | 'hard',
        }, signal, generationPolicy))
      }
      if (endpoint === 'answer') {
        const question = store.get(quizId)
        if (question === undefined) throw new Error(`quiz question ${JSON.stringify(quizId)} was not found`)
        if (!Array.isArray(payload.selectedAnswers) || !payload.selectedAnswers.every(Number.isInteger)) {
          throw new Error('selectedAnswers must be an integer array')
        }
        const selectedAnswers = payload.selectedAnswers as number[]
        if (selectedAnswers.some(index => index < 0 || index >= question.options.length)) {
          throw new Error('selected answer indexes must identify existing options')
        }
        const correct = answerIsCorrect(question, selectedAnswers)
        const updated = await store.recordAnswer(quizId, correct)
        return success({ correct, correctAnswers: updated.correctAnswers, explanation: updated.explanation, attempts: updated.attempts })
      }
      if (endpoint === 'save') return success(await store.save(quizId, payload.reviewEnabled === true))
      return { ok: false, error: { code: 'bad-request', message: `unknown quiz write endpoint: ${endpoint}`, details: { issues: [] } } }
    } catch (error) {
      return failure(error)
    }
  }, { authority: 'loopback' })
}
