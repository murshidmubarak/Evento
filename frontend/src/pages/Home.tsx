import { useEffect, useState } from 'react'
import api from '../services/api'

interface HealthResponse {
  success: boolean
  message: string
}

type ApiStatus = 'checking' | 'online' | 'offline'

export default function Home() {
  const [apiStatus, setApiStatus] = useState<ApiStatus>('checking')
  const [apiMessage, setApiMessage] = useState<string>('')

  useEffect(() => {
    const checkHealth = async () => {
      try {
        const res = await api.get<HealthResponse>('/health')
        if (res.data.success) {
          setApiStatus('online')
          setApiMessage(res.data.message)
        } else {
          setApiStatus('offline')
        }
      } catch {
        setApiStatus('offline')
        setApiMessage('Cannot reach backend')
      }
    }

    void checkHealth()
  }, [])

  const statusConfig: Record<ApiStatus, { color: string; dot: string; label: string }> = {
    checking: {
      color: 'text-yellow-400',
      dot: 'bg-yellow-400 animate-pulse',
      label: 'Checking…',
    },
    online: {
      color: 'text-emerald-400',
      dot: 'bg-emerald-400',
      label: 'Online',
    },
    offline: {
      color: 'text-red-400',
      dot: 'bg-red-400',
      label: 'Offline',
    },
  }

  const status = statusConfig[apiStatus]

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 relative overflow-hidden">

      {/* Background gradient orbs */}
      <div
        className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] rounded-full opacity-20 blur-3xl pointer-events-none"
        style={{ background: 'radial-gradient(circle, #6366f1, transparent 70%)' }}
      />
      <div
        className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] rounded-full opacity-15 blur-3xl pointer-events-none"
        style={{ background: 'radial-gradient(circle, #8b5cf6, transparent 70%)' }}
      />

      {/* Card */}
      <div
        className="relative z-10 w-full max-w-lg rounded-2xl p-8 border"
        style={{
          background: 'rgba(26, 26, 46, 0.8)',
          borderColor: 'var(--color-border)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          boxShadow: '0 8px 48px rgba(99, 102, 241, 0.15)',
        }}
      >
        {/* Logo mark */}
        <div className="flex items-center gap-3 mb-8">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-lg"
            style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}
          >
            E
          </div>
          <div>
            <p className="text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--color-muted)' }}>
              EventOps
            </p>
            <p className="text-xs" style={{ color: 'var(--color-muted)' }}>ERP Platform</p>
          </div>
        </div>

        {/* Heading */}
        <h1 className="text-3xl font-bold leading-tight mb-2" style={{ color: 'var(--color-text)' }}>
          Phase 1 — Foundation
        </h1>
        <p className="text-sm mb-8" style={{ color: 'var(--color-muted)' }}>
          React + Vite + TypeScript frontend is up and running.
        </p>

        {/* Status card */}
        <div
          className="rounded-xl p-4 border mb-6"
          style={{ background: 'rgba(15, 15, 26, 0.6)', borderColor: 'var(--color-border)' }}
        >
          <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--color-muted)' }}>
            Backend API Status
          </p>
          <div className="flex items-center gap-3">
            <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${status.dot}`} />
            <span className={`text-sm font-semibold ${status.color}`}>{status.label}</span>
            {apiMessage && (
              <span className="text-sm ml-auto" style={{ color: 'var(--color-muted)' }}>
                {apiMessage}
              </span>
            )}
          </div>
          <p className="mt-2 text-xs font-mono" style={{ color: 'var(--color-muted)' }}>
            GET {import.meta.env.VITE_API_URL}/health
          </p>
        </div>

        {/* Stack badges */}
        <div className="flex flex-wrap gap-2">
          {['React 19', 'Vite 8', 'TypeScript', 'Tailwind CSS v3', 'React Router v7', 'Axios'].map((tech) => (
            <span
              key={tech}
              className="px-2.5 py-1 rounded-md text-xs font-medium"
              style={{
                background: 'rgba(99, 102, 241, 0.12)',
                color: '#a5b4fc',
                border: '1px solid rgba(99, 102, 241, 0.25)',
              }}
            >
              {tech}
            </span>
          ))}
        </div>
      </div>

      {/* Footer */}
      <p className="mt-6 text-xs z-10" style={{ color: 'var(--color-muted)' }}>
        EventOps ERP · Phase 1 Foundation ·{' '}
        <span style={{ color: 'var(--color-primary)' }}>Ready for development</span>
      </p>
    </div>
  )
}
