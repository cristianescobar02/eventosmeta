import { useState } from 'react'
import { HardHat, Eye, EyeOff } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

type Mode = 'login' | 'register'

export default function LoginPage() {
  const { signIn, signUp } = useAuth()
  const [mode, setMode] = useState<Mode>('login')
  const [form, setForm] = useState({ email: '', password: '', fullName: '', confirmPassword: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPass, setShowPass] = useState(false)
  const [successMsg, setSuccessMsg] = useState('')

  function field(key: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm(f => ({ ...f, [key]: e.target.value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSuccessMsg('')

    if (mode === 'register') {
      if (!form.fullName.trim()) { setError('Ingresa tu nombre completo.'); return }
      if (form.password.length < 8) { setError('La contraseña debe tener mínimo 8 caracteres.'); return }
      if (form.password !== form.confirmPassword) { setError('Las contraseñas no coinciden.'); return }
    }

    setLoading(true)
    let err: string | null = null

    if (mode === 'login') {
      err = await signIn(form.email, form.password)
    } else {
      err = await signUp(form.email, form.password, form.fullName)
      if (!err) {
        setSuccessMsg('¡Cuenta creada! Revisa tu correo para confirmar tu email antes de iniciar sesión.')
        setMode('login')
        setForm(f => ({ ...f, password: '', confirmPassword: '' }))
      }
    }

    if (err) {
      if (err.includes('Invalid login')) setError('Email o contraseña incorrectos.')
      else if (err.includes('already registered')) setError('Este email ya está registrado. Inicia sesión.')
      else setError(err)
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-800 to-indigo-900 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-white/10 backdrop-blur rounded-2xl mb-4">
            <HardHat size={32} className="text-yellow-400" />
          </div>
          <h1 className="text-2xl font-bold text-white">PresupuestosObra</h1>
          <p className="text-blue-200 text-sm mt-1">Ingeniería y Arquitectura · Colombia</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-2xl p-6">
          {/* Tabs */}
          <div className="flex rounded-xl bg-gray-100 p-1 mb-6">
            {(['login', 'register'] as Mode[]).map(m => (
              <button
                key={m}
                onClick={() => { setMode(m); setError(''); setSuccessMsg('') }}
                className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
                  mode === m ? 'bg-white text-blue-700 shadow' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {m === 'login' ? 'Iniciar sesión' : 'Registrarme'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <Input
                label="Nombre completo"
                type="text"
                value={form.fullName}
                onChange={field('fullName')}
                placeholder="Juan Pérez"
                required
              />
            )}

            <Input
              label="Correo electrónico"
              type="email"
              value={form.email}
              onChange={field('email')}
              placeholder="tu@email.com"
              required
            />

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Contraseña</label>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  value={form.password}
                  onChange={field('password')}
                  placeholder={mode === 'register' ? 'Mínimo 8 caracteres' : '••••••••'}
                  required
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
                >
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {mode === 'register' && (
              <Input
                label="Confirmar contraseña"
                type="password"
                value={form.confirmPassword}
                onChange={field('confirmPassword')}
                placeholder="••••••••"
                required
              />
            )}

            {error && (
              <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
            )}
            {successMsg && (
              <p className="text-sm text-green-700 bg-green-50 rounded-lg px-3 py-2">{successMsg}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-60 transition-colors"
            >
              {loading
                ? 'Cargando...'
                : mode === 'login' ? 'Iniciar sesión' : 'Crear cuenta gratis'}
            </button>
          </form>

          {mode === 'login' && (
            <p className="text-center text-xs text-gray-400 mt-4">
              ¿No tienes cuenta?{' '}
              <button onClick={() => setMode('register')} className="text-blue-600 font-medium hover:underline">
                Regístrate gratis
              </button>
            </p>
          )}
        </div>

        <p className="text-center text-blue-300 text-xs mt-6">
          Al registrarte aceptas los términos de uso.
        </p>
      </div>
    </div>
  )
}

function Input({ label, ...props }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <input
        {...props}
        className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
      />
    </div>
  )
}
