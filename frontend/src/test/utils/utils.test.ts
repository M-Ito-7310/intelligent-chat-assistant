import { describe, it, expect } from 'vitest'

// Simple utility functions to test
export function formatDate(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  
  if (diffDays === 0) {
    return 'Today'
  } else if (diffDays === 1) {
    return 'Yesterday'
  } else if (diffDays < 7) {
    return `${diffDays} days ago`
  } else {
    return date.toLocaleDateString()
  }
}

export function formatTime(dateString: string): string {
  return new Date(dateString).toLocaleTimeString([], { 
    hour: '2-digit', 
    minute: '2-digit' 
  })
}

export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.substring(0, maxLength) + '...'
}

export function validateEmail(email: string): boolean {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return re.test(email)
}

describe('Utility Functions', () => {
  describe('formatDate', () => {
    it('should return "Today" for current date', () => {
      const today = new Date().toISOString()
      expect(formatDate(today)).toBe('Today')
    })

    it('should return "Yesterday" for yesterday', () => {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      expect(formatDate(yesterday)).toBe('Yesterday')
    })

    it('should return days ago for recent dates', () => {
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
      expect(formatDate(threeDaysAgo)).toBe('3 days ago')
    })

    it('should return formatted date for older dates', () => {
      const oldDate = '2023-01-01T00:00:00Z'
      const result = formatDate(oldDate)
      expect(result).toMatch(/\d{1,2}\/\d{1,2}\/\d{4}/)
    })
  })

  describe('formatTime', () => {
    it('should format time correctly', () => {
      const dateString = '2024-08-30T14:30:00Z'
      const result = formatTime(dateString)
      expect(result).toMatch(/\d{1,2}:\d{2}/)
    })
  })

  describe('truncateText', () => {
    it('should return original text if shorter than max length', () => {
      const text = 'Short text'
      expect(truncateText(text, 20)).toBe('Short text')
    })

    it('should truncate text if longer than max length', () => {
      const text = 'This is a very long text that should be truncated'
      expect(truncateText(text, 20)).toBe('This is a very long ...')
    })

    it('should handle empty text', () => {
      expect(truncateText('', 10)).toBe('')
    })
  })

  describe('validateEmail', () => {
    it('should validate correct email addresses', () => {
      expect(validateEmail('test@example.com')).toBe(true)
      expect(validateEmail('user.name@domain.co.uk')).toBe(true)
      expect(validateEmail('user+tag@example.org')).toBe(true)
    })

    it('should reject invalid email addresses', () => {
      expect(validateEmail('invalid-email')).toBe(false)
      expect(validateEmail('@example.com')).toBe(false)
      expect(validateEmail('user@')).toBe(false)
      expect(validateEmail('user@.com')).toBe(false)
      expect(validateEmail('')).toBe(false)
    })
  })
})