// Labels and helpers only — data now comes from Supabase

export type ServiceType = 'social_media' | 'website' | 'marketing' | 'subscription';
export type InvoiceStatus = 'paid' | 'pending' | 'overdue' | 'draft';
export type SubscriptionFrequency = 'monthly' | 'quarterly' | 'yearly';
export type PaymentMethod = 'transfer' | 'mbway' | 'cash' | 'card';

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

export const methodLabels: Record<PaymentMethod, string> = {
  transfer: 'Transferência',
  mbway: 'MB WAY',
  cash: 'Numerário',
  card: 'Cartão',
};

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(value);
}

export function getInvoiceItemsTotal(items: { quantity: number; unit_price: number }[]): number {
  return items.reduce((sum, item) => sum + item.quantity * Number(item.unit_price), 0);
}
