<template>
  <div class="language-switcher">
    <!-- Debug: Show current props -->
    <!-- Compact: {{ compact }}, Available Locales: {{ availableLocales.length }} -->
    
    <button
      v-if="compact"
      @click="toggleDropdown"
      class="language-button compact"
      :class="{ active: isOpen }"
      :aria-label="$t('settings.language.title')"
    >
      <span class="flag">{{ currentLocale.flag }}</span>
      <svg class="chevron icon" :class="{ rotated: isOpen }" viewBox="0 0 20 20" fill="currentColor">
        <path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd" />
      </svg>
    </button>
    
    <div v-else class="language-selector-full">
      <label class="language-label">
        {{ $t('settings.language.title') }}
      </label>
      <button
        @click="toggleDropdown"
        class="language-button full"
        :class="{ active: isOpen }"
      >
        <span class="flag">{{ currentLocale.flag }}</span>
        <span class="name">{{ currentLocale.name }}</span>
        <svg class="chevron icon" :class="{ rotated: isOpen }" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd" />
        </svg>
      </button>
    </div>

    <!-- Dropdown Menu -->
    <Transition name="dropdown">
      <div
        v-if="isOpen"
        ref="dropdown"
        class="language-dropdown"
        :class="{ 'compact-dropdown': compact }"
      >
        <button
          v-for="locale in availableLocales"
          :key="locale.code"
          @click="selectLanguage(locale.code)"
          class="language-option"
          :class="{ active: locale.code === $i18n.locale }"
        >
          <span class="flag">{{ locale.flag }}</span>
          <span class="name">{{ locale.name }}</span>
          <svg v-if="locale.code === $i18n.locale" class="check-icon icon" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
          </svg>
        </button>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { availableLocales, setLocale, type LocaleCode } from '../i18n'

interface Props {
  compact?: boolean
  placement?: 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right'
}

const props = withDefaults(defineProps<Props>(), {
  compact: false,
  placement: 'bottom-left'
})

const { locale } = useI18n()
const isOpen = ref(false)
const dropdown = ref<HTMLElement>()

// Current locale info
const currentLocale = computed(() => {
  return availableLocales.find(l => l.code === locale.value) || availableLocales[0]
})

// Toggle dropdown
const toggleDropdown = () => {
  isOpen.value = !isOpen.value
}

// Close dropdown
const closeDropdown = () => {
  isOpen.value = false
}

// Select language
const selectLanguage = (localeCode: LocaleCode) => {
  setLocale(localeCode)
  closeDropdown()
  
  // Emit event for parent components
  emit('language-changed', localeCode)
}

// Emit events
const emit = defineEmits<{
  'language-changed': [locale: LocaleCode]
}>()

// Close dropdown when clicking outside
const handleClickOutside = (event: MouseEvent) => {
  const target = event.target as Element
  const languageSwitcher = target.closest('.language-switcher')
  
  if (!languageSwitcher) {
    closeDropdown()
  }
}

// Handle escape key
const handleEscape = (event: KeyboardEvent) => {
  if (event.key === 'Escape') {
    closeDropdown()
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
  document.addEventListener('keydown', handleEscape)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
  document.removeEventListener('keydown', handleEscape)
})

</script>

<style scoped>
.language-switcher {
  position: relative;
  display: inline-block;
}

.language-selector-full {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.language-label {
  font-size: 0.875rem;
  font-weight: 500;
  color: #374151;
  margin-bottom: 0.25rem;
}

.language-button {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem;
  background: white;
  border: 1px solid #d1d5db;
  border-radius: 0.5rem;
  cursor: pointer;
  transition: all 0.2s ease;
  font-size: 0.875rem;
}

.language-button:hover {
  border-color: #3b82f6;
  box-shadow: 0 0 0 1px #3b82f6;
}

.language-button.active {
  border-color: #3b82f6;
  box-shadow: 0 0 0 1px #3b82f6;
}

.language-button.compact {
  padding: 0.375rem;
  min-width: 3rem;
  justify-content: center;
}

.language-button.full {
  justify-content: space-between;
  min-width: 140px;
}

.flag {
  font-size: 1.125rem;
  line-height: 1;
}

.name {
  flex: 1;
  text-align: left;
  white-space: nowrap;
}

.chevron {
  width: 1rem;
  height: 1rem;
  color: #6b7280;
  transition: transform 0.2s ease;
}

.chevron.rotated {
  transform: rotate(180deg);
}

.language-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  z-index: 50;
  margin-top: 0.25rem;
  background: white;
  border: 1px solid #d1d5db;
  border-radius: 0.5rem;
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
  min-width: 140px;
  overflow: hidden;
}

.language-dropdown.compact-dropdown {
  min-width: 120px;
}

.language-option {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  width: 100%;
  padding: 0.75rem;
  background: none;
  border: none;
  text-align: left;
  cursor: pointer;
  transition: background-color 0.2s ease;
  font-size: 0.875rem;
}

.language-option:hover {
  background-color: #f3f4f6;
}

.language-option.active {
  background-color: #eff6ff;
  color: #1d4ed8;
}

.check-icon {
  width: 1rem;
  height: 1rem;
  margin-left: auto;
  color: #1d4ed8;
}

.icon {
  width: 1rem;
  height: 1rem;
}

/* Dropdown transition */
.dropdown-enter-active,
.dropdown-leave-active {
  transition: all 0.2s ease;
  transform-origin: top;
}

.dropdown-enter-from {
  opacity: 0;
  transform: scaleY(0.9) translateY(-0.5rem);
}

.dropdown-leave-to {
  opacity: 0;
  transform: scaleY(0.9) translateY(-0.5rem);
}

/* Dark mode support */
@media (prefers-color-scheme: dark) {
  .language-label {
    color: #d1d5db;
  }
  
  .language-button {
    background: #374151;
    border-color: #4b5563;
    color: #f3f4f6;
  }
  
  .language-button:hover {
    border-color: #60a5fa;
  }
  
  .language-button.active {
    border-color: #60a5fa;
  }
  
  .language-dropdown {
    background: #374151;
    border-color: #4b5563;
  }
  
  .language-option {
    color: #f3f4f6;
  }
  
  .language-option:hover {
    background-color: #4b5563;
  }
  
  .language-option.active {
    background-color: #1e3a8a;
    color: #93c5fd;
  }
  
  .check-icon {
    color: #93c5fd;
  }
  
  .chevron {
    color: #9ca3af;
  }
}
</style>