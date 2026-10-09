import { reactive } from 'vue'
import type { Direction, Result } from '../domain/model'
export const filters = reactive({ owned: { search: '', tags: [] as string[], direction: 'desc' as Direction }, attempts: { search: '', results: [] as Result[], direction: 'desc' as Direction } })
export const ui = reactive({ wizardOpen: false, wizardQualificationId: '', wizardDirty: false, dialog: null as null | { message: string; confirm: boolean } })
let finish: ((value: boolean) => void) | undefined
export function ask(message: string, confirm = true): Promise<boolean> {
  if (finish) finish(false)
  ui.dialog = { message, confirm }
  return new Promise(resolve => { finish = resolve })
}
export function closeDialog(accepted = false) {
  const result = accepted || ui.dialog?.confirm === false
  ui.dialog = null; finish?.(result); finish = undefined
}
export function openWizard(id = '') { ui.wizardQualificationId = id; ui.wizardDirty = false; ui.wizardOpen = true }
export async function discardWizard() {
  if (ui.wizardDirty) await ask('入力途中の内容と進捗を破棄します。このダイアログを閉じると入力画面を終了します。', false)
  ui.wizardOpen = false; ui.wizardDirty = false; ui.wizardQualificationId = ''
}
