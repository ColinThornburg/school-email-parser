import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle2, AlertTriangle, Info } from 'lucide-react'

type ToastVariant = 'success' | 'error' | 'info'

interface ToastOptions {
  id?: string
  title?: string
  description?: string
  variant?: ToastVariant
  durationMs?: number
}

interface Toast extends Required<Omit<ToastOptions, 'durationMs'>> {
  durationMs: number
}

interface GlassToastContextValue {
  addToast: (options: ToastOptions) => string
}

const GlassToastContext = createContext<GlassToastContextValue | undefined>(undefined)

const VARIANT_STYLES: Record<ToastVariant, { icon: JSX.Element; accent: string }> = {
  success: {
    icon: <CheckCircle2 className="h-5 w-5 text-emerald-200" />,
    accent: 'from-emerald-400/30 via-emerald-400/15 to-transparent'
  },
  error: {
    icon: <AlertTriangle className="h-5 w-5 text-rose-300" />,
    accent: 'from-rose-500/35 via-rose-500/15 to-transparent'
  },
  info: {
    icon: <Info className="h-5 w-5 text-sky-200" />,
    accent: 'from-sky-400/30 via-sky-400/10 to-transparent'
  }
}

const DEFAULT_DURATION = 5000

export function GlassToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  const removeToast = useCallback((id: string) => {
    setToasts(current => current.filter(toast => toast.id !== id))
    const timer = timers.current[id]
    if (timer) {
      clearTimeout(timer)
      delete timers.current[id]
    }
  }, [])

  const addToast = useCallback(
    ({ id, title, description, variant = 'info', durationMs = DEFAULT_DURATION }: ToastOptions) => {
      const toastId = id ?? crypto.randomUUID()
      const toast: Toast = {
        id: toastId,
        title: title ?? '',
        description: description ?? '',
        variant,
        durationMs
      }

      setToasts(current => {
        const existing = current.find(item => item.id === toastId)
        if (existing) {
          return current.map(item => (item.id === toastId ? toast : item))
        }
        return [...current, toast]
      })

      if (durationMs > 0) {
        const timer = setTimeout(() => removeToast(toastId), durationMs)
        timers.current[toastId] = timer
      }

      return toastId
    },
    [removeToast]
  )

  const value = useMemo<GlassToastContextValue>(() => ({ addToast }), [addToast])

  return (
    <GlassToastContext.Provider value={value}>
      {children}
      <GlassToastViewport toasts={toasts} onDismiss={removeToast} />
    </GlassToastContext.Provider>
  )
}

export function useGlassToast() {
  const context = useContext(GlassToastContext)
  if (!context) {
    throw new Error('useGlassToast must be used within a GlassToastProvider')
  }
  return context
}

function GlassToastViewport({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: string) => void }) {
  return (
    <div className="pointer-events-none fixed inset-0 z-[999] flex flex-col items-end gap-3 px-4 py-6 md:px-8">
      <AnimatePresence>
        {toasts.map((toast, index) => {
          const { icon, accent } = VARIANT_STYLES[toast.variant]
          const offset = index * 8
          return (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: 20, scale: 0.96, filter: 'blur(6px)' }}
              animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -15, scale: 0.94, filter: 'blur(4px)' }}
              transition={{ type: 'spring', stiffness: 240, damping: 22, mass: 0.8 }}
              className="pointer-events-auto w-full max-w-sm overflow-hidden rounded-2xl border border-white/12 bg-white/10 shadow-[0_30px_80px_-40px_rgba(4,33,41,0.95)] backdrop-blur-2xl"
              style={{ marginTop: offset }}
            >
              <div className={`h-1 w-full bg-gradient-to-r ${accent}`} />
              <div className="flex items-start gap-3 px-4 py-3">
                <div className="mt-1 flex-shrink-0">{icon}</div>
                <div className="flex-1">
                  {toast.title && <p className="font-medium text-slate-100">{toast.title}</p>}
                  {toast.description && (
                    <p className="text-sm text-slate-300/90">
                      {toast.description}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => onDismiss(toast.id)}
                  className="flex h-6 w-6 items-center justify-center rounded-full bg-white/10 text-slate-200 transition hover:bg-white/20"
                  aria-label="Dismiss notification"
                >
                  ×
                </button>
              </div>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
