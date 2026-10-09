import { createApp } from 'vue'
import App from './App.vue'
import { router } from './router'
import { startSession } from './state/session'
import './style.css'
startSession()
createApp(App).use(router).mount('#app')
