import type { Context } from '@deepseek-ai/cordis'
import type { QuizStore } from '../src/store.ts'
import { describe, expect, it } from 'vitest'
import { generateQuizDrafts, parseGeneratedQuestions } from '../src/generator.ts'

describe('parseGeneratedQuestions', () => {
  it('accepts the exact structured quiz response', () => {
    expect(parseGeneratedQuestions(JSON.stringify({
      questions: [{
        type: 'single',
        prompt: 'What does a closure retain?',
        options: ['Its lexical environment', 'Only global variables'],
        correctAnswers: [0],
        explanation: 'A closure retains access to its lexical environment.',
        topic: 'Closures',
        sourceExcerpt: 'retains access to its lexical environment',
      }],
    })).questions).toHaveLength(1)
  })

  it('rejects prose and incomplete responses', () => {
    expect(() => parseGeneratedQuestions('Here are your questions.')).toThrow('invalid JSON')
    expect(() => parseGeneratedQuestions('{"questions":[{"type":"single"}]}')).toThrow()
  })

  it('generates drafts without appending to the conversation session', async () => {
    const events = [
      {
        type: 'request/header',
        data: { header: { config: { provider: 'deepseek', model: 'deepseek-chat' } } },
      },
      {
        type: 'assistant/message',
        data: { message: { id: 'message-1', content: [{ type: 'text', text: 'A closure retains its lexical environment.' }] } },
      },
    ]
    const response = JSON.stringify({
      questions: [{
        type: 'single',
        prompt: 'What does a closure retain?',
        options: ['Its lexical environment', 'Only global variables'],
        correctAnswers: [0],
        explanation: 'It retains its lexical environment.',
        topic: 'Closures',
        sourceExcerpt: 'retains its lexical environment',
      }],
    })
    let requestMessages: unknown
    const ctx = {
      agents: { get: () => ({ session: { events } }) },
      llm: {
        async *stream(options: { messages: unknown }) {
          requestMessages = options.messages
          yield { type: 'text-delta', index: 0, text: response }
          yield { type: 'finish', reason: { kind: 'stop' } }
        },
      },
    } as unknown as Context
    const drafts: unknown[] = []
    const store = { addDraft: (question: unknown) => drafts.push(question) } as unknown as QuizStore
    const before = events.length

    const questions = await generateQuizDrafts(ctx, store, {
      sessionId: 'session-1',
      messageId: 'message-1',
      type: 'single',
      count: 1,
      difficulty: 'medium',
    }, new AbortController().signal, {
      maxQuestions: 10,
      maxSourceChars: 16000,
      maxOutputTokens: 4096,
      timeoutMs: 60000,
    })

    expect(questions).toHaveLength(1)
    expect(drafts).toHaveLength(1)
    expect(events).toHaveLength(before)
    expect(JSON.stringify(requestMessages)).toContain('A closure retains its lexical environment.')
  })
})
