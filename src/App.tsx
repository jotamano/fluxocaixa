import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { supabase } from '@/integrations/supabase/client'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Clients from './pages/Clients'
import ClientDetail from './pages/ClientDetail'
import Invoices from './pages/Invoices'
import InvoiceDetail from './pages/InvoiceDetail'
import NewInvoice from './pages/NewInvoice'
import Services from './pages/Services'
import ServiceDetail from './pages/ServiceDetail'
import Subscriptions from './pages/Subscriptions'
import SubscriptionDetail from './pages/SubscriptionDetail'
import Payments from './pages/Payments'
import PaymentDetail from './pages/PaymentDetail'
import ScheduledInvoices from './pages/ScheduledInvoices'
import Calendar from './pages/Calendar'
import Settings from './pages/Settings'
import Members from './pages/Members'
import Audit from './pages/Audit'
import Trash from './pages/Trash'
import Docs from './pages/Docs'
import NotFound from './pages/NotFound'
import GeorgiaInvoicing from './pages/GeorgiaInvoicing'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
    },
  },
})


function App() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null)

  useEffect(() => {
    // Check active sessions and sets the user
    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsAuthenticated(!!session)
    })

    // Listen for changes on auth state (sign in, sign out, etc.)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(!!session)
    })

    return () => subscription.unsubscribe()
  }, [])

  if (isAuthenticated === null) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Toaster position="top-right" />
        <Routes>
          <Route
            path="/login"
            element={!isAuthenticated ? <Login /> : <Navigate to="/dashboard" />}
          />
          <Route
            path="/dashboard"
            element={isAuthenticated ? <Dashboard /> : <Navigate to="/login" />}
          />
          <Route
            path="/clients"
            element={isAuthenticated ? <Clients /> : <Navigate to="/login" />}
          />
          <Route
            path="/clients/:id"
            element={isAuthenticated ? <ClientDetail /> : <Navigate to="/login" />}
          />
          <Route
            path="/invoices"
            element={isAuthenticated ? <Invoices /> : <Navigate to="/login" />}
          />
          <Route
            path="/invoices/:id"
            element={isAuthenticated ? <InvoiceDetail /> : <Navigate to="/login" />}
          />
          <Route
            path="/invoices/new"
            element={isAuthenticated ? <NewInvoice /> : <Navigate to="/login" />}
          />
          <Route
            path="/services"
            element={isAuthenticated ? <Services /> : <Navigate to="/login" />}
          />
          <Route
            path="/services/:id"
            element={isAuthenticated ? <ServiceDetail /> : <Navigate to="/login" />}
          />
          <Route
            path="/subscriptions"
            element={isAuthenticated ? <Subscriptions /> : <Navigate to="/login" />}
          />
          <Route
            path="/subscriptions/:id"
            element={isAuthenticated ? <SubscriptionDetail /> : <Navigate to="/login" />}
          />
          <Route
            path="/payments"
            element={isAuthenticated ? <Payments /> : <Navigate to="/login" />}
          />
          <Route
            path="/payments/:id"
            element={isAuthenticated ? <PaymentDetail /> : <Navigate to="/login" />}
          />
          <Route
            path="/scheduled-invoices"
            element={isAuthenticated ? <ScheduledInvoices /> : <Navigate to="/login" />}
          />
          <Route
            path="/calendar"
            element={isAuthenticated ? <Calendar /> : <Navigate to="/login" />}
          />
          <Route
            path="/georgia-invoices"
            element={isAuthenticated ? <GeorgiaInvoicing /> : <Navigate to="/login" />}
          />
          <Route
            path="/settings"
            element={isAuthenticated ? <Settings /> : <Navigate to="/login" />}
          />
          <Route
            path="/members"
            element={isAuthenticated ? <Members /> : <Navigate to="/login" />}
          />
          <Route
            path="/audit"
            element={isAuthenticated ? <Audit /> : <Navigate to="/login" />}
          />
          <Route
            path="/trash"
            element={isAuthenticated ? <Trash /> : <Navigate to="/login" />}
          />
          <Route
            path="/docs"
            element={isAuthenticated ? <Docs /> : <Navigate to="/login" />}
          />
          <Route
            path="/"
            element={<Navigate to="/dashboard" />}
          />
          <Route
            path="*"
            element={<NotFound />}
          />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}

export default App
