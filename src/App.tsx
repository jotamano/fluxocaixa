import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/AppLayout";
import { AuthGuard } from "@/components/AuthGuard";
import { AuthProvider } from "@/hooks/use-auth";
import Dashboard from "@/pages/Dashboard";
import Clients from "@/pages/Clients";
import Invoices from "@/pages/Invoices";
import NewInvoice from "@/pages/NewInvoice";
import Subscriptions from "@/pages/Subscriptions";
import SubscriptionDetail from "@/pages/SubscriptionDetail";
import ScheduledInvoices from "@/pages/ScheduledInvoices";
import Services from "@/pages/Services";
import ServiceDetail from "@/pages/ServiceDetail";
import Payments from "@/pages/Payments";
import CalendarPage from "@/pages/Calendar";
import ClientDetail from "@/pages/ClientDetail";
import InvoiceDetail from "@/pages/InvoiceDetail";
import PaymentDetail from "@/pages/PaymentDetail";
import Trash from "@/pages/Trash";
import Members from "@/pages/Members";
import Audit from "@/pages/Audit";
import Settings from "@/pages/Settings";
import Docs from "@/pages/Docs";
import Login from "@/pages/Login";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route element={<AuthGuard />}>
              <Route element={<AppLayout />}>
                <Route path="/" element={<Dashboard />} />
                <Route path="/clientes" element={<Clients />} />
                <Route path="/clientes/:id" element={<ClientDetail />} />
                <Route path="/faturas" element={<Invoices />} />
                <Route path="/faturas/nova" element={<NewInvoice />} />
                <Route path="/faturas/:id" element={<InvoiceDetail />} />
                <Route path="/pagamentos" element={<Payments />} />
                <Route path="/pagamentos/:id" element={<PaymentDetail />} />
                <Route path="/servicos" element={<Services />} />
                <Route path="/servicos/:id" element={<ServiceDetail />} />
                <Route path="/subscricoes" element={<Subscriptions />} />
                <Route path="/subscricoes/:id" element={<SubscriptionDetail />} />
                <Route path="/faturas-agendadas" element={<ScheduledInvoices />} />
                <Route path="/calendario" element={<CalendarPage />} />
                <Route path="/lixo" element={<Trash />} />
                <Route path="/membros" element={<Members />} />
                <Route path="/auditoria" element={<Audit />} />
                <Route path="/configuracoes" element={<Settings />} />
                <Route path="/docs" element={<Docs />} />
                <Route path="/docs/:slug" element={<Docs />} />
              </Route>
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
