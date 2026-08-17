import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type { QuizQuestion } from '../model.ts'
import { QUIZ_READ_CHANNEL, QUIZ_WRITE_CHANNEL } from '../protocol.ts'

export interface QuizAnswerResult {
  correct: boolean
  correctAnswers: number[]
  explanation: string
  attempts: number
}

export interface QuizGenerationOptions {
  type: 'single' | 'multiple' | 'true_false' | 'mixed'
  count: number
  difficulty: 'easy' | 'medium' | 'hard'
}

export class QuizClient {
  constructor(private readonly connection: ConnectionHandle) {}

  private async call<T>(channel: string, endpoint: string, payload: unknown, signal?: AbortSignal): Promise<T> {
    const response = signal === undefined
      ? await this.connection.rpc.call(channel, endpoint, payload)
      : await this.connection.rpc.call(channel, endpoint, payload, signal)
    if (!response.ok) throw new Error(response.error.message)
    return response.value as T
  }

  assistantMessage(sessionId: string, messageId: string): Promise<{ messageId: string; text: string } | null> {
    return this.call(QUIZ_READ_CHANNEL, 'assistant-message', { sessionId, messageId })
  }

  generate(sessionId: string, messageId: string, options: QuizGenerationOptions, signal?: AbortSignal): Promise<QuizQuestion[]> {
    return this.call(QUIZ_WRITE_CHANNEL, 'generate', { sessionId, messageId, ...options }, signal)
  }

  list(topic?: string, reviewOnly = false): Promise<QuizQuestion[]> {
    return this.call(QUIZ_READ_CHANNEL, 'list', { topic, reviewOnly })
  }

  answer(quizId: string, selectedAnswers: number[]): Promise<QuizAnswerResult> {
    return this.call(QUIZ_WRITE_CHANNEL, 'answer', { quizId, selectedAnswers })
  }

  save(quizId: string, reviewEnabled: boolean): Promise<QuizQuestion> {
    return this.call(QUIZ_WRITE_CHANNEL, 'save', { quizId, reviewEnabled })
  }
}
