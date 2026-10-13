import { createRouter, createWebHistory } from 'vue-router'
import { routes } from 'vue-router/auto-routes'
import { discardWizard, ui } from './state/ui'
import { session } from './state/session'
export const router = createRouter({ history: createWebHistory(), routes })
router.beforeEach(async () => {
  if (session.busy) return false
  if (ui.wizardOpen && !(await discardWizard())) return false
})
