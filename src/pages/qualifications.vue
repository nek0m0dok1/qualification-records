<script setup lang="ts">
import { computed, ref } from 'vue'
import { session } from '../state/session'
import { filters, openWizard } from '../state/ui'
import { ownedQualifications } from '../domain/records'

import { TAGS } from '../domain/model'
import QualificationDetail from '../components/QualificationDetail.vue'
const filter = filters.owned
const rows = computed(() =>
  ownedQualifications(session.records, filter.search, filter.tags, filter.direction),
)
const selected = ref('')
</script>
<template>
  <section>
    <div class="page-heading">
      <div>
        <p class="eyebrow">MY QUALIFICATIONS</p>
        <h1>あなたの資格</h1>
        <p>取得の記録を、ひと目で。</p>
      </div>
      <span class="count">{{ session.records.acquisitions.length }}<small>件の資格</small></span>
    </div>
    <div class="qualification-actions">
      <button :disabled="!session.writable || session.busy" @click="openWizard()">
        ＋ 記録を追加
      </button>
    </div>
    <div class="filter-panel">
      <label class="search-label"
        >資格名を検索<input
          v-model="filter.search"
          type="search"
          placeholder="資格名の一部を入力" /></label
      ><label
        >並び順<select v-model="filter.direction">
          <option value="desc">取得年月：新しい順</option>
          <option value="asc">取得年月：古い順</option>
        </select></label
      >
      <details class="filter-accordion">
        <summary>
          ジャンルで絞り込み
          <span v-if="filter.tags.length" class="filter-count">{{ filter.tags.length }}件選択</span>
        </summary>
        <p class="help">選択したすべてのタグに一致</p>
        <div class="tag-options">
          <button
            v-for="tag in TAGS"
            :key="tag.id"
            type="button"
            class="filter-chip"
            :aria-pressed="filter.tags.includes(tag.id)"
            @click="
              filter.tags = filter.tags.includes(tag.id)
                ? filter.tags.filter((id) => id !== tag.id)
                : [...filter.tags, tag.id]
            "
          >
            {{ tag.label }}
          </button>
        </div>
      </details>
    </div>
    <p class="result-count">{{ rows.length }}件を表示</p>
    <div class="card-grid">
      <button
        v-for="row in rows"
        :key="row.qualification.id"
        class="qualification-card"
        @click="selected = row.qualification.id"
      >
        <span class="card-number">QUALIFICATION</span>
        <h2>{{ row.qualification.name }}</h2>
        <span class="qualification-grade">{{
          row.qualification.gradeOrCategory || '級・区分なし'
        }}</span>
        <div class="tags">
          <span
            v-for="tag in TAGS.filter((t) => row.qualification.fixedTagIds.includes(t.id))"
            :key="tag.id"
            >{{ tag.label }}</span
          >
        </div>
        <span class="card-open" aria-hidden="true">詳細を見る ↗</span>
      </button>
    </div>
    <div v-if="!rows.length" class="empty">
      <h2>
        {{ session.loaded ? '該当するあなたの資格はありません' : '記録をまだ取得できていません' }}
      </h2>
      <p>
        {{
          session.loaded
            ? '資格を登録するか、検索条件を変更してください。'
            : 'オンラインで更新すると記録を表示できます。'
        }}
      </p>
      <button :disabled="!session.writable || session.busy" @click="openWizard()">
        資格を記録する
      </button>
    </div>
    <QualificationDetail v-if="selected" :id="selected" @close="selected = ''" />
  </section>
</template>
