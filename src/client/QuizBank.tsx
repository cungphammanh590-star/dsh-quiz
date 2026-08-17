import { useEffect, useState, type JSX } from 'react'
import type { QuizQuestion } from '../model.ts'
import type { QuizClient } from './api.ts'
import css from './quiz.module.css'

export function QuizBank({ client, version, onClose }: { client: QuizClient; version: number; onClose: () => void }): JSX.Element {
  const [items, setItems] = useState<QuizQuestion[]>([])
  const [query, setQuery] = useState('')
  const [reviewOnly, setReviewOnly] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()
  useEffect(() => {
    let alive = true
    setLoading(true); setError(undefined)
    client.list(query, reviewOnly).then(value => { if (alive) setItems(value) })
      .catch(reason => { if (alive) setError(reason instanceof Error ? reason.message : String(reason)) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [client, query, reviewOnly, version])
  return (
    <section className={css.bank} data-dsh-quiz-bank>
      <header className={css.bankHeader}><div><span>个人学习</span><h2>我的题库</h2></div><button type="button" aria-label="关闭题库" onClick={onClose}>×</button></header>
      <div className={css.bankFilters}>
        <input type="search" value={query} placeholder="搜索知识主题" onChange={event => setQuery(event.target.value)} />
        <label><input type="checkbox" checked={reviewOnly} onChange={event => setReviewOnly(event.target.checked)} /> 只看复习题</label>
      </div>
      {loading && <div className={css.empty}>正在加载题库…</div>}
      {error !== undefined && <div className={css.error}>{error}</div>}
      {!loading && error === undefined && items.length === 0 && <div className={css.empty}><strong>题库还是空的</strong><span>在回答下方点击“出题”，答完后选择加入题库。</span></div>}
      <div className={css.bankList}>
        {items.map(item => (
          <article key={item.id} className={css.bankItem}>
            <div><span className={css.topic}>{item.topic}</span>{item.reviewEnabled && <span className={css.reviewBadge}>待复习</span>}</div>
            <h3>{item.prompt}</h3>
            <p>{item.options.map((option, index) => `${String.fromCharCode(65 + index)}. ${option}`).join('　')}</p>
            <footer><span>{item.type === 'single' ? '单选' : item.type === 'multiple' ? '多选' : '判断'}</span><span>作答 {item.attempts} 次</span><span>正确 {item.correctAttempts} 次</span></footer>
          </article>
        ))}
      </div>
    </section>
  )
}
