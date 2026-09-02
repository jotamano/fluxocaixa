import { useRef } from 'react';
import { useReactToPrint } from 'react-to-print';

interface GeorgiaInvoice {
  id: string;
  invoice_number: string;
  invoice_date: string;
  client_name: string;
  client_nif?: string;
  client_address?: string;
  service_description: string;
  amount: number;
  currency: string;
  exchange_rate?: number;
  amount_gel?: number;
}

interface Props {
  invoice: GeorgiaInvoice;
  onClose: () => void;
}

export default function GeorgiaInvoicePreview({ invoice, onClose }: Props) {
  const contentRef = useRef<HTMLDivElement>(null);
  const reactToPrintFn = useReactToPrint({
    contentRef,
    documentTitle: `Fatura-${invoice.invoice_number}`,
  });

  const handlePrint = () => {
    reactToPrintFn?.();
  };

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="p-4 border-b border-gray-200 flex justify-between items-center">
        <h2 className="text-xl font-semibold">Visualizar Fatura</h2>
        <div className="flex gap-3">
          <button
            onClick={handlePrint}
            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md font-medium"
          >
            Imprimir / PDF
          </button>
          <button
            onClick={onClose}
            className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded-md font-medium"
          >
            Fechar
          </button>
        </div>
      </div>

      <div ref={contentRef} className="p-8">
        {/* Header */}
        <div className="flex justify-between items-start mb-8">
          <div>
            <h1 className="text-2xl font-bold">INVOICE / FATURA</h1>
            <p className="text-gray-600">{invoice.invoice_number}</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-600">Data: {new Date(invoice.invoice_date).toLocaleDateString('pt-PT')}</p>
          </div>
        </div>

        {/* Supplier Info */}
        <div className="mb-8">
          <h3 className="font-semibold mb-2">Fornecedor:</h3>
          <p className="text-sm text-gray-700">[Seu Nome/Empresa]</p>
          <p className="text-sm text-gray-700">[Sua Morada na GeÃ³rgia]</p>
          <p className="text-sm text-gray-700">NIF: [Seu NIF Georgiano]</p>
        </div>

        {/* Client Info */}
        <div className="mb-8">
          <h3 className="font-semibold mb-2">Cliente:</h3>
          <p className="text-sm text-gray-700">{invoice.client_name}</p>
          {invoice.client_nif && (
            <p className="text-sm text-gray-700">NIF: {invoice.client_nif}</p>
          )}
          {invoice.client_address && (
            <p className="text-sm text-gray-700">{invoice.client_address}</p>
          )}
        </div>

        {/* Service Description */}
        <div className="mb-8">
          <h3 className="font-semibold mb-2">DescriÃ§Ã£o dos ServiÃ§os:</h3>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{invoice.service_description}</p>
        </div>

        {/* Amount */}
        <div className="mb-8">
          <table className="min-w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 text-sm font-medium text-gray-700">DescriÃ§Ã£o</th>
                <th className="text-right py-2 text-sm font-medium text-gray-700">Valor</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="py-3 text-sm text-gray-900">ServiÃ§os prestados</td>
                <td className="py-3 text-right text-sm font-medium text-gray-900">
                  {(invoice.amount / 100).toFixed(2)} {invoice.currency}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Reverse Charge Notice */}
        <div className="mt-8 p-4 bg-gray-50 border border-gray-200 rounded">
          <p className="text-sm text-gray-700 font-medium">IVA â€” AutoliquidaÃ§Ã£o (Reverse Charge)</p>
          <p className="text-xs text-gray-600 mt-1">
            ServiÃ§os prestados por empresa nÃ£o residente em Portugal, fora do ÃƒÂ¢mbito de aplicaÃ§Ã£o do IVA em Portugal.
            O IVA ÃƒÂ© devido pelo cliente nos termos do artigo 2Âº do Decreto-Lei n.Âº 198/90.
          </p>
        </div>

        {/* Footer */}
        <div className="mt-12 pt-4 border-t text-center text-xs text-gray-500">
          <p>Esta fatura nÃ£o inclui IVA ao abrigo do regime de reverse charge.</p>
        </div>
      </div>
    </div>
  );
}
