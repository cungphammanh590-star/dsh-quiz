import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type { QuizQuestion } from '../model.ts'

const QUIZ_READ_CHANNEL = '/dsh-quiz/read'
const QUIZ_WRITE_CHANNEL = '/dsh-quiz/write'

export interface QuizAnswerResult {
  correct: boolean
  correctAnswers: number[]
  explanation: string
  attempts: number
}

export class QuizClient {
  constructor(private readonly connection: ConnectionHandle) {}

  private async call<T>(channel: string, endpoint: string, payload: unknown): Promise<T> {
    const response = await this.connection.rpc.call(channel, endpoint, payload)
    if (!response.ok) throw new Error(response.error.message)
    return response.value as T
  }

  assistantMessage(sessionId: string, messageId: string): Promise<{ messageId: string; text: string } | null> {
    return this.call(QUIZ_READ_CHANNEL, 'assistant-message', { sessionId, messageId })
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
