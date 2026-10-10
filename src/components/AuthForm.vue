<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, sendEmailVerification, sendPasswordResetEmail } from 'firebase/auth'
import { auth, storageSet, rememberDevice } from '../services/firebase'
import { session, checkVerification, errorMessage, logout } from '../state/session'
const route = useRoute(), router = useRouter()
const mode = computed(() => route.path === '/register' ? 'register' : route.path === '/reset-password' ? 'reset' : 'login')
const email = ref(''), password = ref(''), remember = ref(rememberDevice), busy = ref(false), message = ref(''), error = ref('')
async function submit() {
  if (!auth) return
  busy.value = true; error.value = ''; message.value = ''
  storageSet('qr:remember', String(remember.value))
  try {
    if (mode.value === 'reset') { await sendPasswordResetEmail(auth, email.value); message.value = '登録されている場合、再設定メールが届きます。受信メールをご確認ください。' }
    else if (mode.value === 'register') { const credential = await createUserWithEmailAndPassword(auth, email.value, password.value); await sendEmailVerification(credential.user); message.value = '確認メールを送りました。メールのリンクを開いてください。' }
    else { await signInWithEmailAndPassword(auth, email.value, password.value); await router.push('/qualifications') }
    password.value = ''
  } catch (err) { error.value = errorMessage(err) }
  finally { busy.value = false }
}
async function verify() { try { busy.value = true; await checkVerification(); if (!session.user?.emailVerified) message.value = 'まだメール確認が完了していません。受信メールのリンクを開いてください。' } catch (err) { error.value = errorMessage(err) } finally { busy.value = false } }
async function resend() { try { await sendEmailVerification(auth!.currentUser!); message.value = '確認メールを再送しました。' } catch (err) { error.value = errorMessage(err) } }
</script>
<template>
  <section class="auth-copy"><p class="eyebrow">YOUR QUALIFICATIONS, ORGANIZED</p><h1>「いつ取った？」を、<br>すぐに確認。</h1><p>資格と受験の記録をひとつに。<br>履歴書を書くときも、次の受験を振り返るときも。</p><div class="auth-decoration"><span>取得年月</span><strong>記録が、次につながる。</strong><span>資格・受験履歴・メモ</span></div></section>
  <section class="auth-panel">
    <template v-if="session.user && !session.user.emailVerified"><h2>メールをご確認ください</h2><p>{{ session.user.email }} に届いた確認リンクを開いてから、確認完了ボタンを押してください。</p><button :disabled="busy" @click="verify">メール確認の完了を確認</button><button class="secondary" :disabled="busy" @click="resend">確認メールを再送</button><button class="text-button" :disabled="busy" @click="logout">ログアウト</button></template>
    <form v-else @submit.prevent="submit"><h2>{{ mode === 'register' ? 'アカウント登録' : mode === 'reset' ? 'パスワード再設定' : 'ログイン' }}</h2><label>メールアドレス<span class="required-marker" aria-hidden="true">*</span><input v-model="email" type="email" autocomplete="email" required maxlength="254"></label><label v-if="mode !== 'reset'">パスワード<span class="required-marker" aria-hidden="true">*</span><input v-model="password" type="password" :autocomplete="mode === 'register' ? 'new-password' : 'current-password'" required minlength="6"></label><label v-if="mode !== 'reset'" class="check"><input v-model="remember" type="checkbox">この端末に記録を保存する</label><p v-if="mode !== 'reset'" class="help">共用端末では選択しないでください。保存済みの記録は通信できない場所でも閲覧できます。</p><button class="wide" :disabled="busy">{{ busy ? '処理中…' : mode === 'register' ? '登録して確認メールを送る' : mode === 'reset' ? '再設定メールを送る' : 'ログイン' }}</button><div class="auth-links"><RouterLink v-if="mode !== 'login'" to="/login">ログインへ</RouterLink><RouterLink v-if="mode !== 'register'" to="/register">アカウント登録</RouterLink><RouterLink v-if="mode === 'login'" to="/reset-password">パスワードを忘れた場合</RouterLink></div></form>
    <p v-if="error" class="notice error" role="alert">{{ error }}</p><p v-if="message" class="notice success" role="status">{{ message }}</p>
  </section>
</template>
