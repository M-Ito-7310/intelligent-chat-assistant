<template>
  <div ref="target" :style="placeholderStyle">
    <component 
      v-if="isIntersecting || forceLoad"
      :is="component" 
      v-bind="$attrs"
    />
    <div v-else class="lazy-placeholder">
      <div v-if="showSkeleton" class="skeleton-loader">
        <div class="skeleton-animation"></div>
      </div>
      <slot name="placeholder" v-else>
        <span class="loading-text">{{ loadingText }}</span>
      </slot>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, defineAsyncComponent, computed } from 'vue'
import type { Component } from 'vue'

interface Props {
  component: Component | (() => Promise<Component>)
  threshold?: number
  rootMargin?: string
  minHeight?: string
  loadingText?: string
  showSkeleton?: boolean
  forceLoad?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  threshold: 0.1,
  rootMargin: '100px',
  minHeight: '200px',
  loadingText: 'Loading...',
  showSkeleton: true,
  forceLoad: false
})

const target = ref<HTMLElement>()
const isIntersecting = ref(false)
let observer: IntersectionObserver | null = null

// Placeholder style to prevent layout shift
const placeholderStyle = computed(() => ({
  minHeight: !isIntersecting.value ? props.minHeight : 'auto',
  transition: 'min-height 0.3s ease'
}))

onMounted(() => {
  if (!target.value || props.forceLoad) {
    isIntersecting.value = true
    return
  }

  // Check if IntersectionObserver is supported
  if (!window.IntersectionObserver) {
    isIntersecting.value = true
    return
  }

  observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          isIntersecting.value = true
          // Stop observing once loaded
          observer?.disconnect()
        }
      })
    },
    {
      threshold: props.threshold,
      rootMargin: props.rootMargin
    }
  )

  observer.observe(target.value)
})

onUnmounted(() => {
  observer?.disconnect()
})
</script>

<style scoped>
.lazy-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  min-height: inherit;
}

.loading-text {
  color: #666;
  font-size: 14px;
}

.skeleton-loader {
  width: 100%;
  height: 100%;
  min-height: inherit;
  background: linear-gradient(
    90deg,
    #f0f0f0 25%,
    #e0e0e0 50%,
    #f0f0f0 75%
  );
  background-size: 200% 100%;
  animation: loading 1.5s infinite;
  border-radius: 8px;
}

@keyframes loading {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

.skeleton-animation {
  width: 100%;
  height: 100%;
  opacity: 0.7;
}

/* Dark mode support */
@media (prefers-color-scheme: dark) {
  .loading-text {
    color: #999;
  }
  
  .skeleton-loader {
    background: linear-gradient(
      90deg,
      #2a2a2a 25%,
      #3a3a3a 50%,
      #2a2a2a 75%
    );
  }
}
</style>