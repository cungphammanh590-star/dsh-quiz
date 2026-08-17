import { useEffect, useState, type JSX } from 'react'
import type { QuizQuestion } from '../model.ts'
import type { QuizClient } from './api.ts'
import type { PracticeState } from './index.tsx'
import { QuizPractice } from './QuizCard.tsx'
import css from './quiz.module.css'

export function QuizBank({ client, version, practice, onBankChanged, onClose }: { client: QuizClient; version: number; practice: PracticeState; onBankChanged: () => void; onClose: () => void }): JSX.Element {
  const [items, setItems] = useState<QuizQuestion[]>([])
  const [query, setQuery] = useState('')
  const [reviewOnly, setReviewOnly] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    let alive = true
    setLoading(true); setError(undefined)
    client.list(query, reviewOnly).then(value => { if (alive) setItems(value) })
      .catch(reason => { if (alive) setError(reason instanceof Error ? reason.message : String(reason)) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [client, query, reviewOnly, retry, version])
  return (
    <>
      <button className={css.bankBackdrop} type="button" aria-label="关闭题库" onClick={onClose} />
      <aside className={css.bank} data-dsh-quiz-bank aria-labelledby="dsh-quiz-bank-title">
        <header className={css.bankHeader}>
          <div><span>个人学习</span><h2 id="dsh-quiz-bank-title">我的题库</h2><p>保存对话中的知识检查，按需复习。</p></div>
          <button type="button" aria-label="关闭题库" onClick={onClose}>×</button>
        </header>
        <div className={css.bankFilters}>
          <label className={css.searchField}><span aria-hidden="true">⌕</span><input aria-label="搜索知识主题" type="search" value={query} placeholder="搜索知识主题" onChange={event => setQuery(event.target.value)} /></label>
          <label className={css.reviewFilter}><input type="checkbox" checked={reviewOnly} onChange={event => setReviewOnly(event.target.checked)} /><span>只看复习题</span></label>
        </div>
        <div className={css.bankBody}>
          {practice.status !== 'idle' && (
            <section className={css.practiceSection} aria-label="本次练习">
              <div className={css.sectionHeading}><span>本次练习</span>{practice.status === 'ready' && <small>{practice.questions.length} 题</small>}</div>
              {practice.status === 'loading' && <div className={css.practiceLoading}><span>✦</span><div><strong>正在生成题目</strong><p>你可以继续当前对话，题目会显示在这里。</p></div></div>}
              {practice.status === 'error' && <div className={css.errorState}><strong>题目生成失败</strong><span>{practice.error}</span><span>请回到回答下方重新点击“出题”。</span></div>}
              {practice.status === 'ready' && <QuizPractice questions={practice.questions} answer={(quizId, selected) => client.answer(quizId, selected)} save={async (quizId, reviewEnabled) => { await client.save(quizId, reviewEnabled) }} bankChanged={onBankChanged} />}
            </section>
          )}
          <div className={css.sectionHeading}><span>已保存题目</span>{!loading && error === undefined && <small>{items.length} 题</small>}</div>
          {loading && <div className={css.empty}><span className={css.emptyIcon}>◌</span><strong>正在加载题库</strong></div>}
          {error !== undefined && <div className={css.errorState}><strong>题库暂时无法加载</strong><span>{error}</span><button type="button" className={css.secondaryButton} onClick={() => setRetry(value => value + 1)}>重新加载</button></div>}
          {!loading && error === undefined && items.length === 0 && <div className={css.empty}><span className={css.emptyIcon}>◇</span><strong>{reviewOnly ? '没有待复习的题目' : '题库还是空的'}</strong><span>{reviewOnly ? '关闭筛选即可查看全部题目。' : '在回答下方点击“出题”，答完后选择加入题库。'}</span></div>}
          <div className={css.bankList}>
            {items.map(item => (
              <article key={item.id} className={css.bankItem}>
                <div><span className={css.topic}>{item.topic}</span>{item.reviewEnabled && <span className={css.reviewBadge}>待复习</span>}</div>
                <h3>{item.prompt}</h3>
                <ol>{item.options.map(option => <li key={option}>{option}</li>)}</ol>
                <footer><span>{item.type === 'single' ? '单选' : item.type === 'multiple' ? '多选' : '判断'}</span><span>作答 {item.attempts} 次</span><span>正确 {item.correctAttempts} 次</span></footer>
              </article>
            ))}
          </div>
        </div>
      </aside>
    </>
  )
}
