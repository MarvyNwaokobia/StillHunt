'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'

/**
 * "Install StillHunt" affordance — and, crucially, guidance so users don't create a
 * BROKEN install.
 *
 * The iPhone trap: on iOS, only **Safari** turns "Add to Home Screen" into a real
 * full-screen app. If the user opens the link in an in-app browser (Instagram,
 * WhatsApp, Telegram, X, Facebook…) or in Chrome/Firefox for iOS, "Add to Home
 * Screen" just saves a browser bookmark that opens WITH the browser bar. So when
 * we detect a non-Safari context we tell them to open in Safari first.
 *
 * Platforms:
 *  - Android/desktop Chrome/Edge fire `beforeinstallprompt` → we show an Install button.
 *  - iOS Safari → manual "Share → Add to Home Screen" hint.
 *  - iOS in-app / Chrome-iOS → "Open in Safari to install".
 *  - Android in-app browser → "Open in Chrome to install".
 *
 * Never shows when already installed (standalone), and a dismissal is remembered.
 */

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISS_KEY = 'stillhunt:install-dismissed'

// Major in-app browsers (their WebViews can't make a standalone iOS PWA, and don't
// fire beforeinstallprompt on Android). `; wv)` is the generic Android WebView tell.
const IN_APP_RE =
  /FBAN|FBAV|FB_IAB|Instagram|Line\/|MicroMessenger|WhatsApp|Telegram|TikTok|musical_ly|Snapchat|LinkedInApp|Pinterest|GSA\/|Twitter|; ?wv\)/i
// Non-Safari browsers on iOS (Chrome, Firefox, Edge, Opera) — also can't make a PWA.
const IOS_OTHER_BROWSER_RE = /CriOS|FxiOS|EdgiOS|OPiOS|Opera Touch/i

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  )
}

function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false
  return (
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    // iPadOS 13+ masquerades as Mac; detect a touch screen to catch it
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  )
}

type Ctx = { ios: boolean; android: boolean; inApp: boolean; iosOther: boolean }

export function InstallPrompt() {
  const pathname = usePathname()
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [ctx, setCtx] = useState<Ctx | null>(null)
  // Start hidden until the client effect decides — avoids an SSR flash.
  const [hidden, setHidden] = useState(true)
  // Android Chrome fires `beforeinstallprompt` on its own schedule (engagement
  // heuristics) — often not at all on first visit. Give it a moment, then fall
  // back to a manual "tap ⋮ → Install app" hint so guidance ALWAYS shows.
  const [late, setLate] = useState(false)

  useEffect(() => {
    if (isStandalone()) return
    try {
      if (localStorage.getItem(DISMISS_KEY)) return
    } catch {
      /* private mode — just proceed */
    }
    setHidden(false)

    const ua = navigator.userAgent
    setCtx({
      ios: isIOS(),
      android: /Android/i.test(ua),
      inApp: IN_APP_RE.test(ua),
      iosOther: IOS_OTHER_BROWSER_RE.test(ua),
    })

    const onBeforeInstall = (e: Event) => {
      e.preventDefault() // stop Chrome's mini-infobar; we drive it ourselves
      setDeferred(e as BeforeInstallPromptEvent)
    }
    const onInstalled = () => dismiss()

    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    window.addEventListener('appinstalled', onInstalled)

    const t = setTimeout(() => setLate(true), 2500)

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
      window.removeEventListener('appinstalled', onInstalled)
      clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const dismiss = () => {
    setHidden(true)
    setDeferred(null)
    try {
      localStorage.setItem(DISMISS_KEY, '1')
    } catch {
      /* ignore */
    }
  }

  const install = async () => {
    if (!deferred) return
    await deferred.prompt()
    await deferred.userChoice
    dismiss()
  }

  // Landing page only — never over the hub sub-pages or mid-fight.
  if (pathname !== '/') return null
  if (hidden || !ctx) return null

  // Decide what to show. `native` = a real install prompt is available.
  const mode:
    | 'native'
    | 'ios-safari'
    | 'ios-open-in-safari'
    | 'android-open-in-chrome'
    | 'android-manual'
    | null = deferred
    ? 'native'
    : ctx.ios && (ctx.inApp || ctx.iosOther)
      ? 'ios-open-in-safari'
      : ctx.ios
        ? 'ios-safari'
        : ctx.android && ctx.inApp
          ? 'android-open-in-chrome'
          : // Android Chrome that never fired the auto-prompt → manual hint (after a beat)
            ctx.android && late
            ? 'android-manual'
            : null

  if (!mode) return null

  const copy: Record<Exclude<typeof mode, null>, { title: string; body: string }> = {
    native: {
      title: 'Install StillHunt',
      body: 'Add it to your home screen for a full-screen app.',
    },
    'ios-safari': {
      title: 'Install StillHunt',
      body: 'Tap the Share icon, then “Add to Home Screen”.',
    },
    'ios-open-in-safari': {
      title: 'Open in Safari to install',
      body: 'You’re in an in-app browser. Tap ••• (or the share icon) → “Open in Safari”, then Share → Add to Home Screen.',
    },
    'android-open-in-chrome': {
      title: 'Open in Chrome to install',
      body: 'You’re in an in-app browser. Tap ⋮ → “Open in Chrome” to install StillHunt.',
    },
    'android-manual': {
      title: 'Install StillHunt',
      body: 'Tap ⋮ (top-right), then “Install app” or “Add to home screen”.',
    },
  }

  const { title: cardTitle, body } = copy[mode]

  return (
    <div style={wrap}>
      <div style={card}>
        <img src="/hunt-icon-192.png" alt="" width={40} height={40} style={icon} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={title}>{cardTitle}</div>
          <div style={subtitle}>{body}</div>
        </div>
        {mode === 'native' ? (
          <button onClick={install} style={cta}>
            Install
          </button>
        ) : null}
        <button onClick={dismiss} aria-label="Dismiss" style={closeBtn}>
          ×
        </button>
      </div>
    </div>
  )
}

const wrap: React.CSSProperties = {
  position: 'fixed',
  left: 0,
  right: 0,
  bottom: 'max(16px, env(safe-area-inset-bottom))',
  display: 'flex',
  justifyContent: 'center',
  padding: '0 12px',
  zIndex: 9999,
  pointerEvents: 'none',
}

const card: React.CSSProperties = {
  pointerEvents: 'auto',
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  width: '100%',
  maxWidth: 420,
  padding: '10px 12px',
  borderRadius: 14,
  background: 'rgba(10, 8, 20, 0.92)',
  border: '1px solid rgba(217, 178, 90, 0.35)',
  boxShadow: '0 10px 30px rgba(0, 0, 0, 0.5)',
  backdropFilter: 'blur(8px)',
  color: '#f4efe6',
  fontFamily: 'Inter, system-ui, sans-serif',
}

const icon: React.CSSProperties = { borderRadius: 8, flexShrink: 0, alignSelf: 'flex-start' }

const title: React.CSSProperties = { fontWeight: 700, fontSize: 14, lineHeight: 1.25 }

const subtitle: React.CSSProperties = {
  fontSize: 12,
  color: 'rgba(244, 239, 230, 0.7)',
  lineHeight: 1.35,
  marginTop: 2,
}

const cta: React.CSSProperties = {
  flexShrink: 0,
  padding: '8px 14px',
  borderRadius: 10,
  border: 'none',
  background: 'linear-gradient(180deg, #e6c877, #d9b25a)',
  color: '#1a1204',
  fontWeight: 700,
  fontSize: 13,
  cursor: 'pointer',
}

const closeBtn: React.CSSProperties = {
  flexShrink: 0,
  alignSelf: 'flex-start',
  width: 28,
  height: 28,
  borderRadius: 8,
  border: 'none',
  background: 'transparent',
  color: 'rgba(244, 239, 230, 0.55)',
  fontSize: 20,
  lineHeight: 1,
  cursor: 'pointer',
}
