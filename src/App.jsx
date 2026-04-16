import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './hooks/useAuth'
import { Suspense, lazy } from 'react'
import './index.css'

import Login from './pages/Login'
import SetPassword from './pages/SetPassword'
import AppShell from './components/AppShell'
import Dashboard from './pages/admin/Dashboard'
import AgentDashboard from './pages/agent/AgentDashboard'

const Transactions           = lazy(() => import('./pages/admin/Transactions'))
const TransactionDetail      = lazy(() => import('./pages/admin/TransactionDetail'))
const Agents                 = lazy(() => import('./pages/admin/Agents'))
const AgentDetail            = lazy(() => import('./pages/admin/AgentDetail'))
const Plans                  = lazy(() => import('./pages/admin/Plans'))
const Money                  = lazy(() => import('./pages/admin/Money'))
const Billing                = lazy(() => import('./pages/admin/Billing'))
const Onboarding             = lazy(() => import('./pages/admin/Onboarding'))
const Reports                = lazy(() => import('./pages/admin/Reports'))
const Settings               = lazy(() => import('./pages/admin/Settings'))
const AgentTransactions      = lazy(() => import('./pages/agent/AgentTransactions'))
const AgentTransactionDetail = lazy(() => import('./pages/agent/AgentTransactionDetail'))
const AgentDisbursements     = lazy(() => import('./pages/agent/AgentDisbursements'))
const AgentOnboarding        = lazy(() => import('./pages/agent/AgentOnboarding'))
const AgentReports           = lazy(() => import('./pages/agent/AgentReports'))

function Loading() {
  return <div className="loading"><div className="spinner" />Loading…</div>
}

function ProtectedRoute({ children, adminOnly }) {
  const { session, profile, loading } = useAuth()
  if (loading) return <Loading />
  if (!session) return <Navigate to="/login" replace />
  // If user has no password set yet (came from invite link), keep them on set-password
  if (window.location.pathname === '/set-password') return children
  if (adminOnly && profile?.role === 'agent') return <Navigate to="/my-dashboard" replace />
  if (!adminOnly && profile?.role !== 'agent') return <Navigate to="/dashboard" replace />
  return children
}

function RootRedirect() {
  const { session, profile, loading } = useAuth()
  if (loading) return <Loading />
  if (!session) return <Navigate to="/login" replace />
  return <Navigate to={profile?.role === 'agent' ? '/my-dashboard' : '/dashboard'} replace />
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/set-password" element={<SetPassword />} />
      <Route path="/set-password/*" element={<SetPassword />} />
      <Route path="/" element={<RootRedirect />} />

      {/* Admin routes */}
      <Route element={<ProtectedRoute adminOnly><AppShell /></ProtectedRoute>}>
        <Route path="/dashboard"           element={<Dashboard />} />
        <Route path="/transactions"        element={<Suspense fallback={<Loading />}><Transactions /></Suspense>} />
        <Route path="/transactions/new"    element={<Suspense fallback={<Loading />}><TransactionDetail /></Suspense>} />
        <Route path="/transactions/:id"    element={<Suspense fallback={<Loading />}><TransactionDetail /></Suspense>} />
        <Route path="/agents"              element={<Suspense fallback={<Loading />}><Agents /></Suspense>} />
        <Route path="/agents/new"          element={<Suspense fallback={<Loading />}><AgentDetail /></Suspense>} />
        <Route path="/agents/:id"          element={<Suspense fallback={<Loading />}><AgentDetail /></Suspense>} />
        <Route path="/plans"               element={<Suspense fallback={<Loading />}><Plans /></Suspense>} />
        <Route path="/money"               element={<Suspense fallback={<Loading />}><Money /></Suspense>} />
        <Route path="/billing"             element={<Suspense fallback={<Loading />}><Billing /></Suspense>} />
        <Route path="/onboarding"          element={<Suspense fallback={<Loading />}><Onboarding /></Suspense>} />
        <Route path="/reports"             element={<Suspense fallback={<Loading />}><Reports /></Suspense>} />
        <Route path="/settings"            element={<Suspense fallback={<Loading />}><Settings /></Suspense>} />
      </Route>

      {/* Agent routes */}
      <Route element={<ProtectedRoute adminOnly={false}><AppShell /></ProtectedRoute>}>
        <Route path="/my-dashboard"        element={<AgentDashboard />} />
        <Route path="/my-transactions"     element={<Suspense fallback={<Loading />}><AgentTransactions /></Suspense>} />
        <Route path="/my-transactions/:id" element={<Suspense fallback={<Loading />}><AgentTransactionDetail /></Suspense>} />
        <Route path="/my-disbursements"    element={<Suspense fallback={<Loading />}><AgentDisbursements /></Suspense>} />
        <Route path="/my-onboarding"       element={<Suspense fallback={<Loading />}><AgentOnboarding /></Suspense>} />
        <Route path="/my-reports"          element={<Suspense fallback={<Loading />}><AgentReports /></Suspense>} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}
