<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-900">
    <div class="container mx-auto px-4 py-8">
      <div class="text-center">
        <h1 class="text-4xl font-bold text-gray-900 dark:text-white mb-4">
          {{ $t('home.title') }}
        </h1>
        <p class="text-xl text-gray-600 dark:text-gray-300 mb-8">
          {{ $t('home.subtitle') }}
        </p>
        
        <div class="flex flex-col sm:flex-row gap-4 justify-center">
          <router-link
            to="/chat"
            class="bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-6 rounded-lg transition-colors"
          >
            {{ $t('home.startChat') }}
          </router-link>
          
          <router-link
            to="/documents"
            class="bg-gray-200 hover:bg-gray-300 text-gray-800 font-medium py-3 px-6 rounded-lg transition-colors"
          >
            {{ $t('home.manageDocuments') }}
          </router-link>
        </div>
      </div>
      
      <div class="mt-16 grid md:grid-cols-3 gap-8">
        <div class="text-center p-6">
          <div class="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <MessageCircle class="w-8 h-8 text-blue-600" />
          </div>
          <h3 class="text-lg font-semibold mb-2">{{ $t('home.features.chat.title') }}</h3>
          <p class="text-gray-600">{{ $t('home.features.chat.description') }}</p>
        </div>
        
        <div class="text-center p-6">
          <div class="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <FileText class="w-8 h-8 text-green-600" />
          </div>
          <h3 class="text-lg font-semibold mb-2">{{ $t('home.features.documents.title') }}</h3>
          <p class="text-gray-600">{{ $t('home.features.documents.description') }}</p>
        </div>
        
        <div class="text-center p-6">
          <div class="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Search class="w-8 h-8 text-purple-600" />
          </div>
          <h3 class="text-lg font-semibold mb-2">{{ $t('home.features.search.title') }}</h3>
          <p class="text-gray-600">{{ $t('home.features.search.description') }}</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { MessageCircle, FileText, Search } from 'lucide-vue-next'
</script>