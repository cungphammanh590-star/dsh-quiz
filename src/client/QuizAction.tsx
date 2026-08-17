import { useState, type JSX } from 'react'
import type { InjectFace, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import css from './quiz.module.css'

type QuizType = 'single' | 'multiple' | 'true_false' | 'mixed'
type Difficulty = 'easy' | 'medium' | 'hard'

export interface QuizActionInjected {
  createQuiz: (messageId: string, options: { type: QuizType; count: number; difficulty: Difficulty }) => Promise<void>
}

type Props = PropsRuntime<'conversation.chat.assistant-actions'> & InjectFace<QuizActionInjected>

const TYPE_LABELS: Record<QuizType, string> = {
  single: '单选题', multiple: '多选题', true_false: '判断题', mixed: '混合题型',
}

export function QuizAction({ messageId, createQuiz }: Props): JSX.Element {
  const [open, setOpen] = useState(false)
  const [type, setType] = useState<QuizType>('single')
  const [count, setCount] = useState(1)
  const [difficulty, setDifficulty] = useState<Difficulty>('medium')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  const submit = (): void => {
    if (busy) return
    setBusy(true)
    setError(undefined)
    createQuiz(messageId, { type, count, difficulty })
      .then(() => { setOpen(false) })
      .catch(reason => { setError(reason instanceof Error ? reason.message : String(reason)) })
      .finally(() => { setBusy(false) })
  }

  return (
    <div className={css.actionWrap}>
      <button type="button" className={css.actionButton} aria-label="根据这条回答出题" onClick={() => setOpen(value => !value)}>
        <span aria-hidden="true">✦</span><span>出题</span>
      </button>
      {open && (
        <div className={css.actionPopover} role="dialog" aria-label="出题设置">
          <strong>根据这条回答练习</strong>
          <label>题型
            <select value={type} onChange={event => setType(event.target.value as QuizType)}>
              {Object.entries(TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label>数量
            <select value={count} onChange={event => setCount(Number(event.target.value))}>
              {[1, 2, 3, 5].map(value => <option key={value} value={value}>{value} 题</option>)}
            </select>
          </label>
          <label>难度
            <select value={difficulty} onChange={event => setDifficulty(event.target.value as Difficulty)}>
              <option value="easy">简单</option><option value="medium">适中</option><option value="hard">困难</option>
            </select>
          </label>
          {error !== undefined && <div className={css.error} role="alert">{error}</div>}
          <div className={css.actionFooter}>
            <button type="button" className={css.secondaryButton} onClick={() => setOpen(false)}>取消</button>
            <button type="button" className={css.primaryButton} disabled={busy} onClick={submit}>{busy ? '正在发起…' : '开始出题'}</button>
          </div>
        </div>
      )}
    </div>
  )
}
