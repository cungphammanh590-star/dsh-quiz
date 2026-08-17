import type { Domain } from '@deepseek-ai/dsh-storage-domain'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import { questionSchema, type QuizQuestion } from './model.ts'

export const quizDomainSpec = defineDomain({
  name: 'dsh_quiz',
  version: 0,
  tables: {
    questions: domainTable<string, QuizQuestion>(questionSchema),
  },
} as const)

export type QuizDomain = Domain<typeof quizDomainSpec>

export class QuizStore {
  readonly drafts = new Map<string, QuizQuestion>()

  constructor(
    private readonly domain: QuizDomain,
    private readonly maxDrafts: number,
  ) {}

  addDraft(question: QuizQuestion): void {
    this.drafts.set(question.id, question)
    while (this.drafts.size > this.maxDrafts) {
      const oldest = this.drafts.keys().next().value as string | undefined
      if (oldest === undefined) break
      this.drafts.delete(oldest)
    }
  }

  get(id: string): QuizQuestion | undefined {
    return this.drafts.get(id) ?? this.domain.table('questions').get(id)
  }

  async save(id: string, reviewEnabled: boolean): Promise<QuizQuestion> {
    const question = this.get(id)
    if (question === undefined) throw new Error(`quiz question ${JSON.stringify(id)} was not found`)
    const saved = { ...question, reviewEnabled }
    await this.domain.table('questions').put(id, saved)
    this.drafts.delete(id)
    return saved
  }

  async recordAnswer(id: string, correct: boolean): Promise<QuizQuestion> {
    const question = this.get(id)
    if (question === undefined) throw new Error(`quiz question ${JSON.stringify(id)} was not found`)
    const updated = {
      ...question,
      attempts: question.attempts + 1,
      correctAttempts: question.correctAttempts + (correct ? 1 : 0),
    }
    if (this.drafts.has(id)) this.drafts.set(id, updated)
    else await this.domain.table('questions').put(id, updated)
    return updated
  }

  list(topic?: string, reviewOnly = false): QuizQuestion[] {
    const normalizedTopic = topic?.trim().toLocaleLowerCase()
    return [...this.domain.table('questions').entries()]
      .map(([, question]) => question)
      .filter(question => !reviewOnly || question.reviewEnabled)
      .filter(question => normalizedTopic === undefined || normalizedTopic === ''
        || question.topic.toLocaleLowerCase().includes(normalizedTopic))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }
}
