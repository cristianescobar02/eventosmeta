import { useState } from 'react'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import ActivitiesPage from './pages/ActivitiesPage'
import ProjectsPage from './pages/ProjectsPage'
import ImportPage from './pages/ImportPage'
import type { NavPage } from './types'

export default function App() {
  const [page, setPage] = useState<NavPage>('dashboard')

  return (
    <Layout current={page} onChange={setPage}>
      {page === 'dashboard' && <Dashboard onNavigate={setPage} />}
      {page === 'activities' && <ActivitiesPage />}
      {page === 'projects' && <ProjectsPage />}
      {page === 'import' && <ImportPage />}
    </Layout>
  )
}
