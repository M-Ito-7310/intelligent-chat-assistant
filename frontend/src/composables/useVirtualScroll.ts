import { ref, computed, nextTick, onMounted, onUnmounted } from 'vue'

/**
 * Virtual scroll composable for handling large lists efficiently
 * Implements viewport-based rendering to optimize performance
 */
export function useVirtualScroll(options: {
  items: any[]
  itemHeight: number
  containerHeight: number
  overscan?: number
}) {
  const { items, itemHeight, containerHeight, overscan = 5 } = options
  
  const scrollTop = ref(0)
  const containerRef = ref<HTMLElement>()
  
  // Calculate visible range
  const visibleRange = computed(() => {
    const visibleCount = Math.ceil(containerHeight / itemHeight)
    const startIndex = Math.max(0, Math.floor(scrollTop.value / itemHeight) - overscan)
    const endIndex = Math.min(items.length - 1, startIndex + visibleCount + overscan * 2)
    
    return { startIndex, endIndex, visibleCount }
  })
  
  // Get visible items
  const visibleItems = computed(() => {
    const { startIndex, endIndex } = visibleRange.value
    return items.slice(startIndex, endIndex + 1).map((item, index) => ({
      ...item,
      index: startIndex + index,
      offsetY: (startIndex + index) * itemHeight
    }))
  })
  
  // Calculate total height
  const totalHeight = computed(() => items.length * itemHeight)
  
  // Handle scroll events
  const handleScroll = (event: Event) => {
    const target = event.target as HTMLElement
    scrollTop.value = target.scrollTop
  }
  
  // Scroll to specific item
  const scrollToIndex = async (index: number) => {
    if (!containerRef.value) return
    
    const scrollPosition = index * itemHeight
    containerRef.value.scrollTop = scrollPosition
    scrollTop.value = scrollPosition
    
    await nextTick()
  }
  
  // Scroll to bottom (useful for chat)
  const scrollToBottom = async () => {
    if (!containerRef.value) return
    
    const scrollPosition = totalHeight.value - containerHeight
    containerRef.value.scrollTop = Math.max(0, scrollPosition)
    scrollTop.value = Math.max(0, scrollPosition)
    
    await nextTick()
  }
  
  // Auto-scroll setup for new messages
  const setupAutoScroll = () => {
    if (!containerRef.value) return
    
    const container = containerRef.value
    const isNearBottom = container.scrollTop + container.clientHeight >= container.scrollHeight - 100
    
    return isNearBottom
  }
  
  return {
    containerRef,
    visibleItems,
    visibleRange,
    totalHeight,
    scrollTop,
    handleScroll,
    scrollToIndex,
    scrollToBottom,
    setupAutoScroll
  }
}

/**
 * Intersection observer for lazy loading images and components
 */
export function useLazyLoading(options: {
  threshold?: number
  rootMargin?: string
} = {}) {
  const { threshold = 0.1, rootMargin = '50px' } = options
  
  const observedElements = ref(new Set<Element>())
  const loadedElements = ref(new Set<Element>())
  
  let observer: IntersectionObserver | null = null
  
  const createObserver = () => {
    observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            loadedElements.value.add(entry.target)
            observer?.unobserve(entry.target)
            observedElements.value.delete(entry.target)
          }
        })
      },
      { threshold, rootMargin }
    )
  }
  
  const observe = (element: Element) => {
    if (!observer) createObserver()
    if (!observedElements.value.has(element) && !loadedElements.value.has(element)) {
      observer?.observe(element)
      observedElements.value.add(element)
    }
  }
  
  const unobserve = (element: Element) => {
    observer?.unobserve(element)
    observedElements.value.delete(element)
  }
  
  const isLoaded = (element: Element) => {
    return loadedElements.value.has(element)
  }
  
  onMounted(() => {
    createObserver()
  })
  
  onUnmounted(() => {
    observer?.disconnect()
  })
  
  return {
    observe,
    unobserve,
    isLoaded
  }
}