import { useState } from 'react'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Layout from './components/Layout'
import LoginPage from './pages/LoginPage'
import Dashboard from './pages/Dashboard'
import ActivitiesPage from './pages/ActivitiesPage'
import ProjectsPage from './pages/ProjectsPage'
import PricingPage from './pages/PricingPage'
import MaterialsPage from './pages/MaterialsPage'
import AdminPage from './pages/AdminPage'
import type { NavPage } from './types'

function AppContent() {
  const { user, loading } = useAuth()
  const [page, setPage] = useState<NavPage>('dashboard')

  if (loading) {
    return (
      <div className="min-h-screen bg-blue-900 flex items-center justify-center">
        <div className="w-8 h-8 border-3 border-white/30 border-t-white rounded-full animate-spin" />
      </div>
    )
  }

  if (!user) return <LoginPage />

  return (
    <Layout current={page} onChange={setPage}>
      {page === 'dashboard'  && <Dashboard onNavigate={setPage} />}
      {page === 'activities' && <ActivitiesPage />}
      {page === 'projects'   && <ProjectsPage onNavigate={setPage} />}
      {page === 'pricing'    && <PricingPage />}
      {page === 'materials'  && <MaterialsPage onNavigate={setPage} />}
      {page === 'admin'      && <AdminPage />}
    </Layout>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}
