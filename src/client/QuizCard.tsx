import { useMemo, useState, type JSX } from 'react'
import type { InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import type { ToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool/client'
import type { QuizAnswerResult } from './api.ts'
import css from './quiz.module.css'

export interface QuizCardQuestion {
  id: string
  type: 'single' | 'multiple' | 'true_false'
  prompt: string
  options: string[]
  topic: string
  difficulty: 'easy' | 'medium' | 'hard'
  sourceSessionId: string
  reviewEnabled: boolean
  attempts: number
  correctAttempts: number
}

export interface QuizCardInjected {
  answer: (quizId: string, selected: number[]) => Promise<QuizAnswerResult>
  save: (quizId: string, reviewEnabled: boolean) => Promise<void>
  bankChanged: () => void
}

type Props = ToolCallViewProps & InjectFace<QuizCardInjected>

function questionsFrom(block: Props['block']): QuizCardQuestion[] | null {
  if (!('kind' in block)) return null
  const meta = block.meta
  if (typeof meta !== 'object' || meta === null || Array.isArray(meta)) return []
  const questions = (meta as { kind?: unknown; questions?: unknown }).questions
  return (meta as { kind?: unknown }).kind === 'quiz-drafts' && Array.isArray(questions)
    ? questions as QuizCardQuestion[] : []
}

function QuestionCard({ question, answer, save, bankChanged }: { question: QuizCardQuestion } & QuizCardInjected): JSX.Element {
  const [selected, setSelected] = useState<number[]>([])
  const [result, setResult] = useState<QuizAnswerResult>()
  const [review, setReview] = useState(false)
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const multiple = question.type === 'multiple'

  const toggle = (index: number): void => {
    if (result !== undefined) return
    setSelected(current => multiple
      ? current.includes(index) ? current.filter(value => value !== index) : [...current, index]
      : [index])
  }
  const grade = (): void => {
    if (selected.length === 0 || busy) return
    setBusy(true); setError(undefined)
    answer(question.id, selected).then(setResult)
      .catch(reason => setError(reason instanceof Error ? reason.message : String(reason)))
      .finally(() => setBusy(false))
  }
  const persist = (): void => {
    if (busy || saved) return
    setBusy(true); setError(undefined)
    save(question.id, review).then(() => { setSaved(true); bankChanged() })
      .catch(reason => setError(reason instanceof Error ? reason.message : String(reason)))
      .finally(() => setBusy(false))
  }

  return (
    <article className={css.quizCard} data-dsh-quiz-card>
      <header><span className={css.topic}>{question.topic}</span><span className={css.difficulty}>{question.difficulty}</span></header>
      <h3>{question.prompt}</h3>
      <div className={css.options} role={multiple ? 'group' : 'radiogroup'}>
        {question.options.map((option, index) => {
          const checked = selected.includes(index)
          const isCorrect = result?.correctAnswers.includes(index) === true
          const isWrong = result !== undefined && checked && !isCorrect
          return (
            <label key={index} className={`${css.option} ${isCorrect ? css.correctOption : ''} ${isWrong ? css.wrongOption : ''}`}>
              <input type={multiple ? 'checkbox' : 'radio'} name={question.id} checked={checked} disabled={result !== undefined} onChange={() => toggle(index)} />
              <span className={css.optionKey}>{String.fromCharCode(65 + index)}</span><span>{option}</span>
            </label>
          )
        })}
      </div>
      {result === undefined ? (
        <button type="button" className={css.primaryButton} disabled={selected.length === 0 || busy} onClick={grade}>提交答案</button>
      ) : (
        <div className={result.correct ? css.correctResult : css.wrongResult} role="status">
          <strong>{result.correct ? '回答正确' : '再想一想'}</strong><p>{result.explanation}</p>
          <div className={css.saveRow}>
            <label><input type="checkbox" checked={review} disabled={saved} onChange={event => setReview(event.target.checked)} /> 加入复习</label>
            <button type="button" className={css.secondaryButton} disabled={saved || busy} onClick={persist}>{saved ? '已加入题库' : '加入题库'}</button>
          </div>
        </div>
      )}
      {error !== undefined && <div className={css.error} role="alert">{error}</div>}
    </article>
  )
}

export function QuizToolView({ block, answer, save, bankChanged }: Props): JSX.Element {
  const questions = useMemo(() => questionsFrom(block), [block])
  if (questions === null) return <div className={css.quizLoading}>正在生成练习题…</div>
  if (questions.length === 0) return <div className={css.error}>题目生成失败，无法读取题目数据。</div>
  return <div className={css.quizStack}>{questions.map(question => <QuestionCard key={question.id} question={question} answer={answer} save={save} bankChanged={bankChanged} />)}</div>
}
