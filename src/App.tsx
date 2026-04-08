import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/AppLayout";
import Dashboard from "@/pages/Dashboard";
import Clients from "@/pages/Clients";
import Invoices from "@/pages/Invoices";
import NewInvoice from "@/pages/NewInvoice";
import Subscriptions from "@/pages/Subscriptions";
import Services from "@/pages/Services";
import Payments from "@/pages/Payments";
import CalendarPage from "@/pages/Calendar";
import ClientDetail from "@/pages/ClientDetail";
import InvoiceDetail from "@/pages/InvoiceDetail";
import PaymentDetail from "@/pages/PaymentDetail";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/clientes" element={<Clients />} />
            <Route path="/clientes/:id" element={<ClientDetail />} />
            <Route path="/faturas" element={<Invoices />} />
            <Route path="/faturas/nova" element={<NewInvoice />} />
            <Route path="/faturas/:id" element={<InvoiceDetail />} />
            <Route path="/pagamentos" element={<Payments />} />
            <Route path="/pagamentos/:id" element={<PaymentDetail />} />
            <Route path="/subscricoes" element={<Subscriptions />} />
            <Route path="/calendario" element={<CalendarPage />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
