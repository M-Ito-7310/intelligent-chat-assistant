import { createI18n } from 'vue-i18n'
import en from '../locales/en.json'
import ja from '../locales/ja.json'

// Type definition for message schema
export type MessageSchema = typeof en

// Available locales
export const availableLocales = [
  { code: 'en', name: 'English', flag: '🇺🇸' },
  { code: 'ja', name: '日本語', flag: '🇯🇵' }
] as const

export type LocaleCode = typeof availableLocales[number]['code']

// Default locale
export const defaultLocale: LocaleCode = 'en'

// Detect browser locale
export const getBrowserLocale = (): LocaleCode => {
  const browserLang = navigator.language.split('-')[0] as LocaleCode
  return availableLocales.some(locale => locale.code === browserLang) 
    ? browserLang 
    : defaultLocale
}

// Get saved locale from localStorage
export const getSavedLocale = (): LocaleCode => {
  const saved = localStorage.getItem('locale') as LocaleCode
  return saved && availableLocales.some(locale => locale.code === saved) 
    ? saved 
    : getBrowserLocale()
}

// Save locale to localStorage
export const saveLocale = (locale: LocaleCode): void => {
  localStorage.setItem('locale', locale)
}

// Create i18n instance
const i18n = createI18n({
  legacy: false,
  locale: getSavedLocale(),
  fallbackLocale: defaultLocale,
  messages: {
    en,
    ja
  },
  // Global injection
  globalInjection: true,
  // Warn when fallback is used
  fallbackWarn: import.meta.env.DEV,
  // Warn when missing translation
  missingWarn: import.meta.env.DEV
})

// Helper function to change locale
export const setLocale = (locale: LocaleCode): void => {
  i18n.global.locale.value = locale
  saveLocale(locale)
  
  // Update document direction for RTL languages (if needed in future)
  document.documentElement.setAttribute('lang', locale)
  
  // Update page title if needed
  updatePageTitle()
}

// Update page title based on current route and locale
const updatePageTitle = (): void => {
  const { t } = i18n.global
  const baseTitle = 'AI Chatbot'
  
  // Get current route name if router is available
  if (window.location.pathname === '/') {
    document.title = baseTitle
  } else if (window.location.pathname.includes('chat')) {
    document.title = `${t('navigation.chat')} - ${baseTitle}`
  } else if (window.location.pathname.includes('documents')) {
    document.title = `${t('navigation.documents')} - ${baseTitle}`
  } else if (window.location.pathname.includes('profile')) {
    document.title = `${t('navigation.profile')} - ${baseTitle}`
  } else if (window.location.pathname.includes('admin')) {
    document.title = `${t('navigation.admin')} - ${baseTitle}`
  } else {
    document.title = baseTitle
  }
}

// Number formatting
export const formatNumber = (value: number, locale?: LocaleCode): string => {
  const currentLocale = locale || i18n.global.locale.value
  return new Intl.NumberFormat(currentLocale === 'ja' ? 'ja-JP' : 'en-US').format(value)
}

// Date formatting
export const formatDate = (date: Date | string, locale?: LocaleCode, options?: Intl.DateTimeFormatOptions): string => {
  const currentLocale = locale || i18n.global.locale.value
  const dateObj = typeof date === 'string' ? new Date(date) : date
  
  const defaultOptions: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }
  
  return new Intl.DateTimeFormat(
    currentLocale === 'ja' ? 'ja-JP' : 'en-US',
    { ...defaultOptions, ...options }
  ).format(dateObj)
}

// Relative time formatting
export const formatRelativeTime = (date: Date | string, locale?: LocaleCode): string => {
  const currentLocale = locale || i18n.global.locale.value
  const dateObj = typeof date === 'string' ? new Date(date) : date
  const now = new Date()
  const diffInSeconds = Math.floor((now.getTime() - dateObj.getTime()) / 1000)
  
  try {
    const rtf = new Intl.RelativeTimeFormat(
      currentLocale === 'ja' ? 'ja-JP' : 'en-US',
      { numeric: 'auto' }
    )
    
    // Calculate appropriate unit
    if (diffInSeconds < 60) {
      return rtf.format(-diffInSeconds, 'second')
    } else if (diffInSeconds < 3600) {
      return rtf.format(-Math.floor(diffInSeconds / 60), 'minute')
    } else if (diffInSeconds < 86400) {
      return rtf.format(-Math.floor(diffInSeconds / 3600), 'hour')
    } else if (diffInSeconds < 2592000) {
      return rtf.format(-Math.floor(diffInSeconds / 86400), 'day')
    } else if (diffInSeconds < 31536000) {
      return rtf.format(-Math.floor(diffInSeconds / 2592000), 'month')
    } else {
      return rtf.format(-Math.floor(diffInSeconds / 31536000), 'year')
    }
  } catch {
    // Fallback for unsupported browsers
    return formatDate(dateObj, locale, { 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }
}

// Currency formatting (for potential premium features)
export const formatCurrency = (amount: number, currency = 'USD', locale?: LocaleCode): string => {
  const currentLocale = locale || i18n.global.locale.value
  
  return new Intl.NumberFormat(
    currentLocale === 'ja' ? 'ja-JP' : 'en-US',
    {
      style: 'currency',
      currency: currentLocale === 'ja' ? 'JPY' : currency,
      minimumFractionDigits: currency === 'JPY' ? 0 : 2
    }
  ).format(amount)
}

// Pluralization helper
export const pluralize = (count: number, singular: string, plural?: string, locale?: LocaleCode): string => {
  const currentLocale = locale || i18n.global.locale.value
  
  // Japanese doesn't have plural forms
  if (currentLocale === 'ja') {
    return singular
  }
  
  // English pluralization
  if (count === 1) {
    return singular
  }
  
  return plural || `${singular}s`
}

// File size formatting
export const formatFileSize = (bytes: number, locale?: LocaleCode): string => {
  const currentLocale = locale || i18n.global.locale.value
  const { t } = i18n.global
  
  if (bytes === 0) return '0 B'
  
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  
  const value = parseFloat((bytes / Math.pow(k, i)).toFixed(1))
  const formattedValue = formatNumber(value, locale)
  
  return `${formattedValue} ${sizes[i]}`
}

export default i18n