<template>
  <div ref="container" class="virtual-list-container" @scroll="onScroll">
    <div class="virtual-list-spacer" :style="spacerStyle"></div>
    <div class="virtual-list-content" :style="contentStyle">
      <div
        v-for="item in visibleItems"
        :key="getItemKey(item)"
        class="virtual-list-item"
        :style="getItemStyle(item)"
      >
        <slot name="item" :item="item" :index="getItemIndex(item)">
          {{ item }}
        </slot>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'

interface Props {
  items: any[]
  itemHeight?: number | ((item: any, index: number) => number)
  buffer?: number // Number of items to render outside visible area
  keyField?: string
  threshold?: number // Pixels from bottom to trigger load more
  onLoadMore?: () => void | Promise<void>
  loading?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  itemHeight: 50,
  buffer: 5,
  keyField: 'id',
  threshold: 200,
  loading: false
})

const container = ref<HTMLElement>()
const scrollTop = ref(0)
const containerHeight = ref(0)
const isLoadingMore = ref(false)

// Calculate item heights
const itemHeights = computed(() => {
  if (typeof props.itemHeight === 'number') {
    return props.items.map(() => props.itemHeight as number)
  }
  return props.items.map((item, index) => 
    (props.itemHeight as Function)(item, index)
  )
})

// Calculate total height
const totalHeight = computed(() => {
  return itemHeights.value.reduce((sum, height) => sum + height, 0)
})

// Calculate item positions
const itemPositions = computed(() => {
  const positions: number[] = []
  let currentPos = 0
  
  itemHeights.value.forEach((height) => {
    positions.push(currentPos)
    currentPos += height
  })
  
  return positions
})

// Calculate visible range
const visibleRange = computed(() => {
  const start = scrollTop.value
  const end = scrollTop.value + containerHeight.value
  
  let startIndex = 0
  let endIndex = props.items.length - 1
  
  // Binary search for start index
  let left = 0
  let right = itemPositions.value.length - 1
  
  while (left <= right) {
    const mid = Math.floor((left + right) / 2)
    const pos = itemPositions.value[mid]
    
    if (pos < start) {
      startIndex = mid
      left = mid + 1
    } else {
      right = mid - 1
    }
  }
  
  // Find end index
  for (let i = startIndex; i < itemPositions.value.length; i++) {
    if (itemPositions.value[i] > end) {
      endIndex = i
      break
    }
  }
  
  // Add buffer
  startIndex = Math.max(0, startIndex - props.buffer)
  endIndex = Math.min(props.items.length - 1, endIndex + props.buffer)
  
  return { startIndex, endIndex }
})

// Get visible items
const visibleItems = computed(() => {
  const { startIndex, endIndex } = visibleRange.value
  return props.items.slice(startIndex, endIndex + 1)
})

// Spacer style to maintain scroll position
const spacerStyle = computed(() => ({
  height: `${totalHeight.value}px`
}))

// Content style to position visible items
const contentStyle = computed(() => {
  const { startIndex } = visibleRange.value
  const offset = startIndex > 0 ? itemPositions.value[startIndex] : 0
  
  return {
    transform: `translateY(${offset}px)`
  }
})

// Get item key
const getItemKey = (item: any) => {
  if (props.keyField && typeof item === 'object') {
    return item[props.keyField]
  }
  return props.items.indexOf(item)
}

// Get item index
const getItemIndex = (item: any) => {
  return props.items.indexOf(item)
}

// Get item style
const getItemStyle = (item: any) => {
  const index = getItemIndex(item)
  return {
    height: `${itemHeights.value[index]}px`
  }
}

// Handle scroll event
const onScroll = () => {
  if (!container.value) return
  
  scrollTop.value = container.value.scrollTop
  
  // Check if should load more
  if (props.onLoadMore && !isLoadingMore.value && !props.loading) {
    const scrollBottom = scrollTop.value + containerHeight.value
    const shouldLoadMore = totalHeight.value - scrollBottom < props.threshold
    
    if (shouldLoadMore) {
      loadMore()
    }
  }
}

// Load more items
const loadMore = async () => {
  if (isLoadingMore.value || !props.onLoadMore) return
  
  isLoadingMore.value = true
  
  try {
    await props.onLoadMore()
  } finally {
    isLoadingMore.value = false
  }
}

// Update container height
const updateContainerHeight = () => {
  if (container.value) {
    containerHeight.value = container.value.clientHeight
  }
}

// Scroll to item
const scrollToItem = (index: number, behavior: ScrollBehavior = 'smooth') => {
  if (!container.value || index < 0 || index >= props.items.length) return
  
  const position = itemPositions.value[index]
  
  container.value.scrollTo({
    top: position,
    behavior
  })
}

// Expose scroll methods
defineExpose({
  scrollToItem,
  scrollToTop: () => scrollToItem(0),
  scrollToBottom: () => scrollToItem(props.items.length - 1)
})

// Watch for container resize
let resizeObserver: ResizeObserver | null = null

onMounted(() => {
  updateContainerHeight()
  
  if (container.value && window.ResizeObserver) {
    resizeObserver = new ResizeObserver(() => {
      updateContainerHeight()
    })
    
    resizeObserver.observe(container.value)
  }
  
  // Fallback for browsers without ResizeObserver
  window.addEventListener('resize', updateContainerHeight)
})

onUnmounted(() => {
  resizeObserver?.disconnect()
  window.removeEventListener('resize', updateContainerHeight)
})

// Watch for items change
watch(() => props.items.length, async () => {
  await nextTick()
  onScroll()
})
</script>

<style scoped>
.virtual-list-container {
  position: relative;
  overflow-y: auto;
  height: 100%;
}

.virtual-list-spacer {
  position: absolute;
  top: 0;
  left: 0;
  width: 1px;
  pointer-events: none;
}

.virtual-list-content {
  position: relative;
  width: 100%;
}

.virtual-list-item {
  width: 100%;
}

/* Custom scrollbar */
.virtual-list-container::-webkit-scrollbar {
  width: 8px;
}

.virtual-list-container::-webkit-scrollbar-track {
  background: #f1f1f1;
  border-radius: 4px;
}

.virtual-list-container::-webkit-scrollbar-thumb {
  background: #888;
  border-radius: 4px;
}

.virtual-list-container::-webkit-scrollbar-thumb:hover {
  background: #555;
}

/* Dark mode support */
@media (prefers-color-scheme: dark) {
  .virtual-list-container::-webkit-scrollbar-track {
    background: #2a2a2a;
  }
  
  .virtual-list-container::-webkit-scrollbar-thumb {
    background: #555;
  }
  
  .virtual-list-container::-webkit-scrollbar-thumb:hover {
    background: #777;
  }
}
</style>