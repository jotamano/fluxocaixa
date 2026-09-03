const NBG_EUR_RATE_URL = 'https://nbg.gov.ge/gw/api/ct/monetarypolicy/currencies/en/json/?currencies=EUR';

export interface NbgEurRate {
  rate: number;
  quantity: number;
  effectiveDate: string | null;
}

type NbgCurrency = {
  code?: string;
  rate?: number | string;
  quantity?: number | string;
  validFromDate?: string;
};

type NbgResponse = Array<{
  date?: string;
  currencies?: NbgCurrency[];
}> | {
  date?: string;
  currencies?: NbgCurrency[];
};

export async function fetchNbgEurRate(signal?: AbortSignal): Promise<NbgEurRate> {
  const response = await fetch(NBG_EUR_RATE_URL, {
    signal,
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`NBG respondeu com HTTP ${response.status}`);
  }

  const payload = await response.json() as NbgResponse;
  const bulletin = Array.isArray(payload) ? payload[0] : payload;
  const currency = bulletin?.currencies?.find(item => item.code?.toUpperCase() === 'EUR');
  const rate = Number(currency?.rate);
  const quantity = Number(currency?.quantity || 1);

  if (!Number.isFinite(rate) || rate <= 0 || !Number.isFinite(quantity) || quantity <= 0) {
    throw new Error('A resposta do NBG não contém uma taxa EUR válida.');
  }

  return {
    rate: rate / quantity,
    quantity,
    effectiveDate: currency?.validFromDate ?? bulletin?.date ?? null,
  };
}
