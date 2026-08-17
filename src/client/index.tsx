import { createRoot, type Root } from 'react-dom/client'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type { ClientContext, SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-tool/client'
import { QuizClient } from './api.ts'
import { QuizAction, type QuizActionInjected } from './QuizAction.tsx'
import { QuizBank } from './QuizBank.tsx'
import { QuizToolView, type QuizCardInjected } from './QuizCard.tsx'
import css from './quiz.module.css'

export const inject = ['slots', 'connection']

type QuizContext = Omit<ClientContext, 'connection'> & {
  connection: ConnectionHandle
}

export interface PracticeState {
  status: 'idle' | 'loading' | 'ready' | 'error'
  questions: import('./QuizCard.tsx').QuizCardQuestion[]
  error?: string
}

class BankController {
  private open = false
  private version = 0
  private practice: PracticeState = { status: 'idle', questions: [] }
  private generation: AbortController | undefined
  private readonly listeners = new Set<() => void>()
  subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener) }
  snapshot(): { open: boolean; version: number; practice: PracticeState } { return { open: this.open, version: this.version, practice: this.practice } }
  toggle(): void { this.open = !this.open; this.emit() }
  close(): void {
    this.generation?.abort()
    this.generation = undefined
    if (this.open) { this.open = false; this.emit() }
  }
  changed(): void { this.version += 1; this.emit() }
  async generate(client: QuizClient, sessionId: string, messageId: string, options: Parameters<QuizClient['generate']>[2]): Promise<void> {
    this.generation?.abort()
    const controller = new AbortController()
    this.generation = controller
    this.open = true
    this.practice = { status: 'loading', questions: [] }
    this.emit()
    try {
      const questions = await client.generate(sessionId, messageId, options, controller.signal)
      if (this.generation !== controller) return
      this.practice = { status: 'ready', questions }
    } catch (reason) {
      if (this.generation !== controller || controller.signal.aborted) return
      this.practice = { status: 'error', questions: [], error: reason instanceof Error ? reason.message : String(reason) }
      throw reason
    } finally {
      if (this.generation === controller) {
        this.generation = undefined
        this.emit()
      }
    }
  }
  private emit(): void { for (const listener of this.listeners) listener() }
}

function mountBank(ctx: QuizContext, client: QuizClient, controller: BankController): () => void {
  let root: Root | undefined
  let panel: HTMLDivElement | undefined
  let entry: HTMLButtonElement | undefined
  const ensure = (): void => {
    let changed = false
    if (entry !== undefined && !entry.isConnected) { entry = undefined }
    if (panel !== undefined && !panel.isConnected) { root?.unmount(); root = undefined; panel = undefined }
    const sidebar = document.querySelector<HTMLElement>('[data-pane="sidebar"], [class*="sidebarCol"]')
    const conversation = document.querySelector<HTMLElement>('[data-pane="conversation"], [class*="centerCol"]')
    if (sidebar !== null && entry === undefined) {
      const base = sidebar.querySelector<HTMLElement>('[class*="logoRow"]')?.parentElement ?? sidebar.firstElementChild
      if (base !== null) {
        entry = document.createElement('button'); entry.type = 'button'; entry.className = css.bankEntry ?? ''
        entry.dataset.dshQuizEntry = ''; entry.innerHTML = '<span aria-hidden="true">◫</span><span>题库</span>'
        entry.addEventListener('click', () => controller.toggle())
        const newSession = base.querySelector('button[class*="newSession"]')
        base.insertBefore(entry, newSession?.nextSibling ?? base.firstChild)
        changed = true
      }
    }
    if (conversation !== null && panel === undefined) {
      panel = document.createElement('div'); panel.className = css.bankPanel ?? ''; panel.dataset.dshQuizPanel = ''
      conversation.append(panel); root = createRoot(panel)
      changed = true
    }
    if (changed) render()
  }
  const render = (): void => {
    const state = controller.snapshot()
    if (entry !== undefined) entry.dataset.active = state.open ? 'true' : 'false'
    if (panel !== undefined) panel.style.display = state.open ? 'block' : 'none'
    if (root !== undefined && state.open) root.render(<QuizBank client={client} version={state.version} practice={state.practice} onBankChanged={() => controller.changed()} onClose={() => controller.close()} />)
  }
  const observer = new MutationObserver(ensure); observer.observe(document.body, { childList: true, subtree: true })
  const unsubscribe = controller.subscribe(render); ensure()
  return () => { observer.disconnect(); unsubscribe(); root?.unmount(); panel?.remove(); entry?.remove() }
}

export function apply(rawContext: unknown): void {
  const ctx = rawContext as QuizContext
  const client = new QuizClient(ctx.connection)
  const bank = new BankController()

  ctx.slots.inject('conversation.chat.assistant-actions', () => ctx.slots.register({
    name: 'conversation.chat.assistant-actions', id: 'quiz-create', order: 70,
    inject: (sessionId: SessionId): QuizActionInjected => ({
      createQuiz: (messageId, options) => bank.generate(client, String(sessionId), messageId, options),
    }),
  }, QuizAction))

  ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({
    name: 'tool.call.toolview', key: 'quiz_create_draft',
    inject: (): QuizCardInjected => ({
      answer: (quizId, selected) => client.answer(quizId, selected),
      save: async (quizId, reviewEnabled) => { await client.save(quizId, reviewEnabled) },
      bankChanged: () => bank.changed(),
    }),
  }, QuizToolView))

  if (typeof document !== 'undefined') ctx.effect(() => mountBank(ctx, client, bank), 'dsh-quiz: question bank workspace')
}
