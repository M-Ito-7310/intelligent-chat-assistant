import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import LanguageSwitcher from '../../components/LanguageSwitcher.vue'

const mockUseI18n = {
  locale: { value: 'en' },
  availableLocales: ['en', 'ja'],
  t: (key: string) => key
}

vi.mock('vue-i18n', () => ({
  useI18n: () => mockUseI18n
}))

const mockUseThemeStore = {
  locale: 'en',
  setLocale: vi.fn()
}

vi.mock('../../stores/theme', () => ({
  useThemeStore: () => mockUseThemeStore
}))

describe('LanguageSwitcher', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('should render language options', () => {
    const wrapper = mount(LanguageSwitcher)
    
    expect(wrapper.find('select').exists()).toBe(true)
    
    const options = wrapper.findAll('option')
    expect(options).toHaveLength(2)
    expect(options[0].attributes('value')).toBe('en')
    expect(options[1].attributes('value')).toBe('ja')
  })

  it('should display current locale', () => {
    mockUseI18n.locale.value = 'ja'
    mockUseThemeStore.locale = 'ja'
    
    const wrapper = mount(LanguageSwitcher)
    const select = wrapper.find('select')
    
    expect(select.element.value).toBe('ja')
  })

  it('should call setLocale when language is changed', async () => {
    const wrapper = mount(LanguageSwitcher)
    const select = wrapper.find('select')
    
    await select.setValue('ja')
    
    expect(mockUseThemeStore.setLocale).toHaveBeenCalledWith('ja')
  })

  it('should show proper styling classes', () => {
    const wrapper = mount(LanguageSwitcher)
    const select = wrapper.find('select')
    
    expect(select.classes()).toContain('bg-white')
    expect(select.classes()).toContain('dark:bg-gray-800')
    expect(select.classes()).toContain('border')
    expect(select.classes()).toContain('rounded-md')
  })
})