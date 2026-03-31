export type ServiceType = 'social_media' | 'website' | 'marketing' | 'subscription';

export interface Client {
  id: string;
  name: string;
  email: string;
  company: string;
  phone: string;
  nif: string;
}

export interface InvoiceItem {
  description: string;
  serviceType: ServiceType;
  quantity: number;
  unitPrice: number;
}

export type InvoiceStatus = 'paid' | 'pending' | 'overdue' | 'draft';

export interface Invoice {
  id: string;
  number: string;
  clientId: string;
  items: InvoiceItem[];
  status: InvoiceStatus;
  issueDate: string;
  dueDate: string;
  notes?: string;
}

export type SubscriptionFrequency = 'monthly' | 'quarterly' | 'yearly';

export interface Subscription {
  id: string;
  clientId: string;
  name: string;
  serviceType: ServiceType;
  amount: number;
  frequency: SubscriptionFrequency;
  startDate: string;
  nextBillingDate: string;
  active: boolean;
}

export const serviceLabels: Record<ServiceType, string> = {
  social_media: 'Gestão de Redes Sociais',
  website: 'Criação de Sites',
  marketing: 'Marketing Digital',
  subscription: 'Subscrição',
};

export const statusLabels: Record<InvoiceStatus, string> = {
  paid: 'Paga',
  pending: 'Pendente',
  overdue: 'Vencida',
  draft: 'Rascunho',
};

export const frequencyLabels: Record<SubscriptionFrequency, string> = {
  monthly: 'Mensal',
  quarterly: 'Trimestral',
  yearly: 'Anual',
};

// Sample data
export const sampleClients: Client[] = [
  { id: '1', name: 'Ana Silva', email: 'ana@empresa.pt', company: 'TechStart Lda', phone: '+351 912 345 678', nif: '509123456' },
  { id: '2', name: 'Carlos Mendes', email: 'carlos@restaurante.pt', company: 'Sabores do Mar', phone: '+351 923 456 789', nif: '509234567' },
  { id: '3', name: 'Maria Santos', email: 'maria@clinica.pt', company: 'Clínica Bem-Estar', phone: '+351 934 567 890', nif: '509345678' },
  { id: '4', name: 'João Ferreira', email: 'joao@imobiliaria.pt', company: 'Casa Nova Imobiliária', phone: '+351 945 678 901', nif: '509456789' },
];

export const sampleInvoices: Invoice[] = [
  {
    id: '1', number: 'FT 2024/001', clientId: '1', status: 'paid', issueDate: '2024-01-15', dueDate: '2024-02-15',
    items: [
      { description: 'Gestão Instagram + Facebook - Janeiro', serviceType: 'social_media', quantity: 1, unitPrice: 450 },
      { description: 'Campanha Google Ads', serviceType: 'marketing', quantity: 1, unitPrice: 300 },
    ],
  },
  {
    id: '2', number: 'FT 2024/002', clientId: '2', status: 'pending', issueDate: '2024-02-01', dueDate: '2024-03-01',
    items: [
      { description: 'Criação de Website com reservas online', serviceType: 'website', quantity: 1, unitPrice: 1500 },
    ],
  },
  {
    id: '3', number: 'FT 2024/003', clientId: '3', status: 'overdue', issueDate: '2024-01-01', dueDate: '2024-01-31',
    items: [
      { description: 'Gestão Redes Sociais - Dezembro', serviceType: 'social_media', quantity: 1, unitPrice: 350 },
      { description: 'Criação de conteúdo fotográfico', serviceType: 'marketing', quantity: 1, unitPrice: 200 },
    ],
  },
  {
    id: '4', number: 'FT 2024/004', clientId: '4', status: 'draft', issueDate: '2024-02-15', dueDate: '2024-03-15',
    items: [
      { description: 'Redesign do website', serviceType: 'website', quantity: 1, unitPrice: 2000 },
      { description: 'Setup SEO', serviceType: 'marketing', quantity: 1, unitPrice: 500 },
    ],
  },
];

export const sampleSubscriptions: Subscription[] = [
  { id: '1', clientId: '1', name: 'Pack Redes Sociais Pro', serviceType: 'social_media', amount: 450, frequency: 'monthly', startDate: '2023-06-01', nextBillingDate: '2024-03-01', active: true },
  { id: '2', clientId: '3', name: 'Gestão Redes Sociais Basic', serviceType: 'social_media', amount: 350, frequency: 'monthly', startDate: '2023-09-01', nextBillingDate: '2024-03-01', active: true },
  { id: '3', clientId: '4', name: 'Manutenção Website + SEO', serviceType: 'website', amount: 200, frequency: 'monthly', startDate: '2024-01-01', nextBillingDate: '2024-03-01', active: true },
  { id: '4', clientId: '2', name: 'Pack Marketing Anual', serviceType: 'marketing', amount: 3600, frequency: 'yearly', startDate: '2024-01-01', nextBillingDate: '2025-01-01', active: false },
];

export function getInvoiceTotal(invoice: Invoice): number {
  return invoice.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(value);
}
