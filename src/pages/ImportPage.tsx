import { Shield } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import AdminPage from './AdminPage'

// La importación de datos en la versión con Supabase es exclusiva del admin.
// Los clientes no importan datos — el admin sube una vez y todos ven los cambios.
export default function ImportPage() {
  const { isAdmin } = useAuth()

  if (isAdmin) return <AdminPage />

  return (
    <div className="flex flex-col items-center justify-center py-24 text-gray-400 max-w-md mx-auto text-center">
      <Shield size={40} className="mb-3 opacity-40" />
      <p className="font-semibold text-gray-600">Datos gestionados por el administrador</p>
      <p className="text-sm mt-2">
        Las actividades, APU y precios son actualizados por el administrador.
        Los cambios se reflejan automáticamente para todos los usuarios.
      </p>
    </div>
  )
}
