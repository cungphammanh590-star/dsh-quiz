import { createRoot, type Root } from 'react-dom/client'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type { ClientContext, ISessions, SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-tool/client'
import { QuizClient } from './api.ts'
import { QuizAction, type QuizActionInjected } from './QuizAction.tsx'
import { QuizBank } from './QuizBank.tsx'
import { QuizToolView, type QuizCardInjected } from './QuizCard.tsx'
import css from './quiz.module.css'

export const inject = ['slots', 'sessions', 'connection', 'conversation']

type QuizContext = Omit<ClientContext, 'connection' | 'sessions'> & {
  connection: ConnectionHandle
  sessions: ISessions
}

interface ConversationSender { send(text: string): Promise<void> }

function questionPrompt(source: string, options: { type: 'single' | 'multiple' | 'true_false' | 'mixed'; count: number; difficulty: 'easy' | 'medium' | 'hard' }): string {
  const type = options.type === 'single' ? '单选题' : options.type === 'multiple' ? '多选题' : options.type === 'true_false' ? '判断题' : '混合题型'
  const difficulty = options.difficulty === 'easy' ? '简单' : options.difficulty === 'hard' ? '困难' : '适中'
  return `请只根据下面引用的助手回答，生成 ${options.count} 道${difficulty}${type}。必须调用 quiz_create_draft 创建题目；不要在正文中泄露答案。\n\n<quoted_assistant_answer>\n${source.slice(0, 16000)}\n</quoted_assistant_answer>`
}

class BankController {
  private open = false
  private version = 0
  private readonly listeners = new Set<() => void>()
  subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener) }
  snapshot(): { open: boolean; version: number } { return { open: this.open, version: this.version } }
  toggle(): void { this.open = !this.open; this.emit() }
  close(): void { if (this.open) { this.open = false; this.emit() } }
  changed(): void { this.version += 1; this.emit() }
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
    if (root !== undefined && state.open) root.render(<QuizBank client={client} version={state.version} onClose={() => controller.close()} />)
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
      createQuiz: async (messageId, options) => {
        const source = await client.assistantMessage(String(sessionId), String(messageId))
        if (source === null) throw new Error('无法读取这条回答，请刷新后重试。')
        const scoped = ctx.sessions.scope(sessionId)
        const conversation = scoped?.get('conversation') as ConversationSender | undefined
        if (conversation === undefined) throw new Error('当前会话尚未准备好。')
        await conversation.send(questionPrompt(source.text, options))
      },
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
