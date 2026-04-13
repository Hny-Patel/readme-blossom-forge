const TIMEOUT_MS = 30 * 60 * 1000 // 30 minutes

export function startInactivityTimer(onTimeout: () => void): () => void {
  let timer: ReturnType<typeof setTimeout>
  const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'] as const

  const reset = () => {
    clearTimeout(timer)
    timer = setTimeout(onTimeout, TIMEOUT_MS)
  }

  events.forEach((e) => window.addEventListener(e, reset, { passive: true }))
  reset()

  return () => {
    clearTimeout(timer)
    events.forEach((e) => window.removeEventListener(e, reset))
  }
}
