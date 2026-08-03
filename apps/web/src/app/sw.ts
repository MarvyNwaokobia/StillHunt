/// <reference lib="webworker" />
// StillHunt service worker (Serwist). Its only job here is to make the app
// *installable* (Android/Chrome + desktop need a SW with a fetch handler) and
// to load the app shell fast. StillHunt is an online game — there is no offline
// mode — so navigations/API stay network-first via Serwist's defaultCache.
import { defaultCache } from '@serwist/next/worker'
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist'
import { Serwist } from 'serwist'

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    // Injected at build time by @serwist/next with the app-shell asset list.
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined
  }
}

declare const self: ServiceWorkerGlobalScope

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
})

serwist.addEventListeners()
