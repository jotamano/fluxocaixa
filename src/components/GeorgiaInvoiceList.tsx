import { useState } from 'react';

interface GeorgiaInvoice {
  id?: string;
  invoice_number: string;
  invoice_date: string;
  client_name: string;
  client_nif?: string;
  amount: number;
  currency: string;
  amount_gel?: number;
  status: string;
}

interface Props {
  invoices: GeorgiaInvoice[];
  loading: boolean;
  onEdit: (invoice: GeorgiaInvoice) => void;
  onPreview: (invoice: GeorgiaInvoice) => void;
  onDelete: (id: string) => void;
}

export default function GeorgiaInvoiceList({ invoices, loading, onEdit, onPreview, onDelete }: Props) {
  const [filterMonth, setFilterMonth] = useState('');
  const [filterYear, setFilterYear] = useState(new Date().getFullYear().toString());

  const filteredInvoices = invoices.filter(inv => {
    const invDate = new Date(inv.invoice_date);
    const monthMatch = !filterMonth || (invDate.getMonth() + 1).toString() === filterMonth;
    const yearMatch = !filterYear || invDate.getFullYear().toString() === filterYear;
    return monthMatch && yearMatch;
  });

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-8 text-center">
        <div className="text-gray-600">A carregar faturas...</div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow">
      {/* Filters */}
      <div className="p-4 border-b border-gray-200 flex gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Mêªªs</label>
          <select
            value={filterMonth}
            onChange={(e) => setFilterMonth(e.target.value)}
            className="border border-gray-300 rounded-md px-3 py-2 text-sm"
          >
            <option value="">Todos</option>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(m => (
              <option key={m} value={m.toString()}>{m.toString().padStart(2, '0')}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Ano</label>
          <select
            value={filterYear}
            onChange={(e) => setFilterYear(e.target.value)}
            className="border border-gray-300 rounded-md px-3 py-2 text-sm"
          >
            {[2024, 2025, 2026, 2027].map(y => (
              <option key={y} value={y.toString()}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">NÂº Fatura</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Data</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cliente</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Valor</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Estado</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Aç§µes</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredInvoices.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                  Sem faturas encontradas
                </td>
              </tr>
            ) : (
              filteredInvoices.map((invoice) => (
                <tr key={invoice.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {invoice.invoice_number}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(invoice.invoice_date).toLocaleDateString('pt-PT')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    <div>{invoice.client_name}</div>
                    {invoice.client_nif && (
                      <div className="text-xs text-gray-500">NIF: {invoice.client_nif}</div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    <div>{(invoice.amount / 100).toFixed(2)} {invoice.currency}</div>
                    {invoice.amount_gel && (
                      <div className="text-xs text-gray-500">≈ {(invoice.amount_gel / 100).toFixed(2)} GEL</div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs rounded-full ${
                      invoice.status === 'issued' ? 'bg-green-100 text-green-800' :
                      invoice.status === 'sent' ? 'bg-blue-100 text-blue-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {invoice.status === 'issued' ? 'Emitida' :
                       invoice.status === 'sent' ? 'Enviada' : 'Rascunho'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button onClick={() => onPreview(invoice)} className="text-blue-600 hover:text-blue-900 mr-3">
                      Ver
                    </button>
                    <button onClick={() => onEdit(invoice)} className="text-indigo-600 hover:text-indigo-900 mr-3">
                      Editar
                    </button>
                    <button onClick={() => invoice.id && onDelete(invoice.id)} className="text-red-600 hover:text-red-900">
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
