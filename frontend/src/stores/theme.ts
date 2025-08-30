import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'

export type Theme = 'light' | 'dark' | 'system'

export const useThemeStore = defineStore('theme', () => {
  // State
  const theme = ref<Theme>('system')
  const systemTheme = ref<'light' | 'dark'>('light')

  // Computed
  const currentTheme = computed(() => {
    if (theme.value === 'system') {
      return systemTheme.value
    }
    return theme.value
  })

  const isDark = computed(() => currentTheme.value === 'dark')

  // Actions
  function setTheme(newTheme: Theme) {
    theme.value = newTheme
    localStorage.setItem('theme', newTheme)
    applyTheme()
  }

  function toggleTheme() {
    if (currentTheme.value === 'light') {
      setTheme('dark')
    } else {
      setTheme('light')
    }
  }

  function applyTheme() {
    const root = document.documentElement
    
    if (currentTheme.value === 'dark') {
      root.classList.add('dark')
    } else {
      root.classList.remove('dark')
    }
  }

  function initTheme() {
    // Get saved theme or default to system
    const savedTheme = localStorage.getItem('theme') as Theme
    if (savedTheme && ['light', 'dark', 'system'].includes(savedTheme)) {
      theme.value = savedTheme
    }

    // Set up system theme detection
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    systemTheme.value = mediaQuery.matches ? 'dark' : 'light'
    
    // Listen for system theme changes
    mediaQuery.addEventListener('change', (e) => {
      systemTheme.value = e.matches ? 'dark' : 'light'
    })

    // Watch for theme changes and apply them
    watch(currentTheme, applyTheme, { immediate: true })
  }

  return {
    // State
    theme,
    systemTheme,
    
    // Computed
    currentTheme,
    isDark,
    
    // Actions
    setTheme,
    toggleTheme,
    initTheme
  }
})