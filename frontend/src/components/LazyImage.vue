<template>
  <div ref="container" class="lazy-image-container" :style="containerStyle">
    <img
      v-if="isLoaded"
      :src="src"
      :alt="alt"
      :class="imageClass"
      @load="onImageLoad"
      @error="onImageError"
    />
    <div v-else-if="isLoading" class="image-loading">
      <div class="spinner"></div>
    </div>
    <div v-else-if="hasError" class="image-error">
      <svg class="error-icon" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
        <line x1="9" y1="9" x2="15" y2="15"/>
        <line x1="15" y1="9" x2="9" y2="15"/>
      </svg>
      <span class="error-text">Failed to load image</span>
    </div>
    <div v-else ref="placeholder" class="image-placeholder" :style="placeholderStyle">
      <div v-if="showBlurredPreview && preview" class="blurred-preview">
        <img :src="preview" alt="" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch } from 'vue'

interface Props {
  src: string
  alt?: string
  preview?: string // Low-quality preview for blur-up effect
  width?: number | string
  height?: number | string
  aspectRatio?: string // e.g., "16/9"
  imageClass?: string
  threshold?: number
  rootMargin?: string
  showBlurredPreview?: boolean
  eager?: boolean // Load immediately without lazy loading
}

const props = withDefaults(defineProps<Props>(), {
  alt: '',
  threshold: 0.1,
  rootMargin: '50px',
  showBlurredPreview: true,
  eager: false
})

const container = ref<HTMLElement>()
const placeholder = ref<HTMLElement>()
const isIntersecting = ref(false)
const isLoading = ref(false)
const isLoaded = ref(false)
const hasError = ref(false)
let observer: IntersectionObserver | null = null

// Container style to maintain aspect ratio
const containerStyle = computed(() => {
  const style: any = {}
  
  if (props.width) {
    style.width = typeof props.width === 'number' ? `${props.width}px` : props.width
  }
  
  if (props.height) {
    style.height = typeof props.height === 'number' ? `${props.height}px` : props.height
  }
  
  if (props.aspectRatio && !props.height) {
    style.aspectRatio = props.aspectRatio
  }
  
  return style
})

// Placeholder style
const placeholderStyle = computed(() => ({
  backgroundColor: '#f0f0f0',
  width: '100%',
  height: '100%'
}))

// Start loading the image
const loadImage = () => {
  if (isLoading.value || isLoaded.value) return
  
  isLoading.value = true
  hasError.value = false
  
  const img = new Image()
  
  img.onload = () => {
    isLoaded.value = true
    isLoading.value = false
  }
  
  img.onerror = () => {
    hasError.value = true
    isLoading.value = false
  }
  
  img.src = props.src
}

// Handle image load event
const onImageLoad = () => {
  isLoaded.value = true
  isLoading.value = false
}

// Handle image error event
const onImageError = () => {
  hasError.value = true
  isLoading.value = false
}

// Watch for src changes
watch(() => props.src, (newSrc, oldSrc) => {
  if (newSrc !== oldSrc) {
    isLoaded.value = false
    hasError.value = false
    if (isIntersecting.value || props.eager) {
      loadImage()
    }
  }
})

onMounted(() => {
  if (props.eager) {
    loadImage()
    return
  }

  if (!container.value) return

  // Check if IntersectionObserver is supported
  if (!window.IntersectionObserver) {
    loadImage()
    return
  }

  observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting && !isIntersecting.value) {
          isIntersecting.value = true
          loadImage()
          observer?.disconnect()
        }
      })
    },
    {
      threshold: props.threshold,
      rootMargin: props.rootMargin
    }
  )

  observer.observe(container.value)
})

onUnmounted(() => {
  observer?.disconnect()
})
</script>

<style scoped>
.lazy-image-container {
  position: relative;
  overflow: hidden;
  background-color: #f5f5f5;
  border-radius: 8px;
}

.lazy-image-container img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.image-placeholder {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
}

.blurred-preview {
  width: 100%;
  height: 100%;
  filter: blur(20px);
  transform: scale(1.1);
  overflow: hidden;
}

.blurred-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.image-loading {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
}

.spinner {
  width: 40px;
  height: 40px;
  border: 3px solid #f3f3f3;
  border-top: 3px solid #3498db;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.image-error {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
  color: #999;
}

.error-icon {
  margin-bottom: 8px;
}

.error-text {
  display: block;
  font-size: 12px;
}

/* Fade in animation */
.lazy-image-container img {
  animation: fadeIn 0.3s ease-in;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

/* Dark mode support */
@media (prefers-color-scheme: dark) {
  .lazy-image-container {
    background-color: #2a2a2a;
  }
  
  .image-placeholder {
    background-color: #2a2a2a;
  }
  
  .spinner {
    border-color: #333;
    border-top-color: #4a9eff;
  }
  
  .image-error {
    color: #666;
  }
}
</style>