import { collection, doc, getDocFromServer, getDocFromCache, getDocsFromServer, getDocsFromCache, runTransaction, type DocumentData } from 'firebase/firestore'
import { database } from './firebase'
import { emptyRecords, fail, type Records } from '../domain/model'
import { validateRecords } from '../domain/validation'
export interface Head { activeDatasetId: string; revision: number }
export interface Loaded { records: Records; head: Head; cached: boolean }
const kinds = ['qualifications', 'examAttempts', 'acquisitions'] as const
const equal = (a: Head, b: Head) => a.activeDatasetId === b.activeDatasetId && a.revision === b.revision
const clean = (value: unknown): DocumentData => JSON.parse(JSON.stringify(value))
export class Repository {
  constructor(readonly uid: string) {}
  private user() { return doc(database(), 'users', this.uid) }
  private set(id: string) { return doc(database(), 'users', this.uid, 'datasets', id) }
  private rows(id: string, kind: typeof kinds[number]) { return collection(this.set(id), kind) }
  private counts(r: Records) { return { qualifications: r.qualifications.length, acquisitions: r.acquisitions.length, examAttempts: r.examAttempts.length } }
  async initialize() {
    const id = crypto.randomUUID()
    await runTransaction(database(), async tx => {
      if ((await tx.get(this.user())).exists()) return
      tx.set(this.set(id), { status: 'ready', createdAt: new Date().toISOString(), counts: this.counts(emptyRecords()) })
      tx.set(this.user(), { activeDatasetId: id, revision: 0 })
    })
  }
  async load(cached = false): Promise<Loaded> {
    const get = cached ? getDocFromCache : getDocFromServer
    const list = cached ? getDocsFromCache : getDocsFromServer
    for (let retry = 0; retry < 3; retry++) {
      const root = await get(this.user())
      if (!root.exists()) fail('この端末には取得済みの記録がありません。オンラインで一度ログインしてください。')
      const head = root.data() as Head
      const meta = await get(this.set(head.activeDatasetId))
      if (!meta.exists()) fail('保存領域の情報が揃っていません。オンラインで更新してください。')
      const records = emptyRecords()
      await Promise.all(kinds.map(async kind => {
        const rows = await list(this.rows(head.activeDatasetId, kind))
        ;(records[kind] as unknown[]) = rows.docs.map(row => ({ ...row.data(), id: row.id }))
      }))
      const after = await get(this.user())
      if (!after.exists() || !equal(head, after.data() as Head)) continue
      if (kinds.some(kind => records[kind].length !== meta.data().counts[kind])) {
        if (!cached) continue
        fail('キャッシュに全記録が揃っていません。オンラインで更新してください。')
      }
      validateRecords(records)
      return { records, head, cached }
    }
    return fail('別の端末で更新されました。もう一度更新してください。')
  }
  async save(before: Loaded, next: Records) {
    validateRecords(next)
    const changes: { kind: typeof kinds[number]; id: string; value?: unknown }[] = []
    for (const kind of kinds) {
      const old = new Map<string, unknown>(before.records[kind].map(row => [row.id, row]))
      const after = new Map<string, unknown>(next[kind].map(row => [row.id, row]))
      for (const [id, value] of after) if (JSON.stringify(value) !== JSON.stringify(old.get(id))) changes.push({ kind, id, value })
      for (const id of old.keys()) if (!after.has(id)) changes.push({ kind, id })
    }
    if (!changes.length) return
    // Large cascades use prepare-and-switch to avoid transaction/rules access limits.
    if (changes.length > 6) { await this.replace(before.head, next); return }
    await runTransaction(database(), async tx => {
      const root = await tx.get(this.user())
      const meta = await tx.get(this.set(before.head.activeDatasetId))
      if (!root.exists() || !equal(before.head, root.data() as Head)) fail('別の端末で更新されました。画面を更新して変更内容を再確認してください。')
      if (!meta.exists() || meta.data().status !== 'ready') fail('保存領域を利用できません。')
      for (const change of changes) {
        const ref = doc(this.rows(before.head.activeDatasetId, change.kind), change.id)
        if (change.value) { const { id: _id, ...body } = clean(change.value); tx.set(ref, body) }
        else tx.delete(ref)
      }
      tx.update(this.set(before.head.activeDatasetId), { counts: this.counts(next) })
      tx.update(this.user(), { revision: before.head.revision + 1 })
    })
  }
  async replace(expected: Head, records: Records, progress: (message: string) => void = () => {}) {
    validateRecords(records)
    const id = crypto.randomUUID()
    await runTransaction(database(), async tx => {
      const root = await tx.get(this.user())
      if (!root.exists() || !equal(expected, root.data() as Head)) fail('既存記録が変更されています。更新して復元をやり直してください。')
      tx.set(this.set(id), { status: 'building', createdAt: new Date().toISOString(), counts: this.counts(records) })
    })
    for (const kind of kinds) for (let offset = 0; offset < records[kind].length; offset += 4) {
      const batch = records[kind].slice(offset, offset + 4)
      progress(`${kind}：${Math.min(offset + 4, records[kind].length)} / ${records[kind].length}件を準備中`)
      await runTransaction(database(), async tx => {
        const meta = await tx.get(this.set(id))
        if (!meta.exists() || meta.data().status !== 'building') fail('復元準備が中断されました。')
        for (const row of batch) { const { id: _id, ...body } = clean(row); tx.set(doc(this.rows(id, kind), row.id), body) }
      })
    }
    progress('保存内容を確認しています。')
    const verified = emptyRecords()
    for (const kind of kinds) {
      const rows = await getDocsFromServer(this.rows(id, kind))
      ;(verified[kind] as unknown[]) = rows.docs.map(row => ({ ...row.data(), id: row.id }))
    }
    validateRecords(verified)
    const normalize = (data: unknown): string => {
      if (Array.isArray(data)) return '[' + data.map(normalize).sort().join(',') + ']'
      if (data && typeof data === 'object') return '{' + Object.entries(data).sort(([a], [b]) => a.localeCompare(b)).map(([key, val]) => JSON.stringify(key) + ':' + normalize(val)).join(',') + '}'
      return JSON.stringify(data)
    }
    if (normalize(verified) !== normalize(records)) fail('保存した内容が一致しません。既存記録は切り替えていません。')
    progress('記録を切り替えています。')
    try {
      await runTransaction(database(), async tx => {
        const root = await tx.get(this.user())
        const meta = await tx.get(this.set(id))
        if (!root.exists() || !equal(expected, root.data() as Head)) fail('復元準備中に既存記録が変更されました。既存記録を維持しています。')
        if (!meta.exists() || meta.data().status !== 'building') fail('復元準備が中断されました。')
        tx.update(this.set(id), { status: 'ready' })
        tx.update(this.set(expected.activeDatasetId), { status: 'retired' })
        tx.update(this.user(), { activeDatasetId: id, revision: expected.revision + 1 })
      })
    } catch (error) {
      let confirmed
      try { confirmed = await getDocFromServer(this.user()) }
      catch { fail('復元の切り替え結果を確認できません。オンラインに戻って更新し、内容を確認してください。再実行はまだ行わないでください。') }
      if (confirmed.exists() && confirmed.data().activeDatasetId === id) return
      if (confirmed.exists() && confirmed.data().activeDatasetId !== expected.activeDatasetId) fail('別の操作で保存領域が切り替わりました。再取得して確認してください。')
      throw error
    }
  }
  async cleanup() {
    const sets = await getDocsFromServer(collection(this.user(), 'datasets'))
    const root = await getDocFromServer(this.user())
    if (!root.exists()) return
    for (const item of sets.docs) {
      if (item.id === root.data().activeDatasetId || (item.data().status !== 'retired' && Date.parse(item.data().createdAt) >= Date.now() - 86400000)) continue
      await runTransaction(database(), async tx => {
        const current = await tx.get(this.user())
        if (current.data()?.activeDatasetId === item.id) fail('有効な保存領域は削除できません。')
        tx.update(item.ref, { status: 'retired' })
      })
      for (const kind of ['acquisitions', 'examAttempts', 'qualifications'] as const) {
        const rows = await getDocsFromServer(this.rows(item.id, kind))
        for (let offset = 0; offset < rows.docs.length; offset += 6) await runTransaction(database(), async tx => {
          const current = await tx.get(this.user())
          if (current.data()?.activeDatasetId === item.id) fail('有効な保存領域は削除できません。')
          rows.docs.slice(offset, offset + 6).forEach(row => tx.delete(row.ref))
        })
      }
      await runTransaction(database(), async tx => {
        const current = await tx.get(this.user())
        if (current.data()?.activeDatasetId === item.id) fail('有効な保存領域は削除できません。')
        tx.delete(item.ref)
      })
    }
  }
}
