import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'
import { useAuthStore } from '../stores/auth'

// Lazy load with prefetch hints and loading/error components
const lazyLoadView = (viewPath: string) => {
  return () => import(
    /* webpackChunkName: "[request]" */
    /* webpackPrefetch: true */
    `../views/${viewPath}.vue`
  )
}

// Define routes with lazy loading and meta information  
const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'home',
    component: lazyLoadView('HomeView'),
    meta: { 
      requiresAuth: false,
      preload: true // Preload critical routes
    }
  },
  {
    path: '/chat',
    name: 'chat',
    component: lazyLoadView('ChatView'),
    meta: { 
      requiresAuth: true,
      preload: true
    }
  },
  {
    path: '/chat/:id',
    name: 'conversation',
    component: lazyLoadView('ChatView'),
    meta: { 
      requiresAuth: true
    }
  },
  {
    path: '/documents',
    name: 'documents',
    component: lazyLoadView('DocumentsView'),
    meta: { 
      requiresAuth: true
    }
  },
  {
    path: '/login',
    name: 'login',
    component: lazyLoadView('LoginView'),
    meta: { 
      requiresAuth: false,
      redirectIfAuth: '/chat'
    }
  },
  {
    path: '/register',
    name: 'register',
    component: lazyLoadView('RegisterView'),
    meta: { 
      requiresAuth: false,
      redirectIfAuth: '/chat'
    }
  },
  {
    path: '/profile',
    name: 'profile',
    component: lazyLoadView('ProfileView'),
    meta: { 
      requiresAuth: true
    }
  },
  {
    path: '/admin',
    name: 'admin',
    component: lazyLoadView('AdminView'),
    meta: { 
      requiresAuth: true,
      requiresAdmin: true
    }
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) {
      return savedPosition
    } else {
      return { top: 0 }
    }
  }
})

// Navigation guards with authentication check
router.beforeEach((to, from, next) => {
  const authStore = useAuthStore()
  
  // Check if route requires authentication
  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    next('/login')
  } 
  // Redirect authenticated users away from login/register
  else if (to.meta.redirectIfAuth && authStore.isAuthenticated) {
    next(to.meta.redirectIfAuth as string)
  }
  // Check admin requirement
  else if (to.meta.requiresAdmin && authStore.user?.role !== 'admin') {
    next('/chat')
  }
  else {
    next()
  }
})

// Preload critical routes after initial load
router.afterEach((to) => {
  // Preload critical routes in the background
  if (to.name === 'home' || to.name === 'login') {
    setTimeout(() => {
      routes
        .filter(route => route.meta?.preload)
        .forEach(route => {
          if (route.component && typeof route.component === 'function') {
            (route.component as any)()
          }
        })
    }, 2000) // Delay preloading to avoid interfering with initial load
  }
})

export default router