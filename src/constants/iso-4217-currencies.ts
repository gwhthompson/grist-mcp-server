// Static list avoids locale-currency/map import errors (not in package.json exports)
// Extracted from locale-currency v1.0.0 + SSP (Grist addition)
// Update: node -e "const m=require('locale-currency/map.js');console.log(Object.values(m))"
const CURRENCY_CODES_ARRAY = [
  'AED',
  'AFN',
  'ALL',
  'AMD',
  'ANG',
  'AOA',
  'ARS',
  'AUD',
  'AWG',
  'AZN',
  'BAM',
  'BBD',
  'BDT',
  'BGN',
  'BHD',
  'BIF',
  'BMD',
  'BND',
  'BOB',
  'BRL',
  'BSD',
  'BTN',
  'BWP',
  'BYN',
  'BZD',
  'CAD',
  'CDF',
  'CHF',
  'CLP',
  'CNY',
  'COP',
  'CRC',
  'CUP',
  'CVE',
  'CZK',
  'DJF',
  'DKK',
  'DOP',
  'DZD',
  'EGP',
  'ERN',
  'ETB',
  'EUR',
  'FJD',
  'FKP',
  'GBP',
  'GEL',
  'GHS',
  'GIP',
  'GMD',
  'GNF',
  'GTQ',
  'GYD',
  'HKD',
  'HNL',
  'HTG',
  'HUF',
  'IDR',
  'ILS',
  'INR',
  'IQD',
  'IRR',
  'ISK',
  'JMD',
  'JOD',
  'JPY',
  'KES',
  'KGS',
  'KHR',
  'KMF',
  'KPW',
  'KRW',
  'KWD',
  'KYD',
  'KZT',
  'LAK',
  'LBP',
  'LKR',
  'LRD',
  'LSL',
  'LYD',
  'MAD',
  'MDL',
  'MGA',
  'MKD',
  'MMK',
  'MNT',
  'MOP',
  'MRU',
  'MUR',
  'MVR',
  'MWK',
  'MXN',
  'MYR',
  'MZN',
  'NAD',
  'NGN',
  'NIO',
  'NOK',
  'NPR',
  'NZD',
  'OMR',
  'PAB',
  'PEN',
  'PGK',
  'PHP',
  'PKR',
  'PLN',
  'PYG',
  'QAR',
  'RON',
  'RSD',
  'RUB',
  'RWF',
  'SAR',
  'SBD',
  'SCR',
  'SDG',
  'SEK',
  'SGD',
  'SHP',
  'SLE',
  'SOS',
  'SRD',
  'SSP',
  'STN',
  'SVC',
  'SYP',
  'SZL',
  'THB',
  'TJS',
  'TMT',
  'TND',
  'TOP',
  'TRY',
  'TTD',
  'TWD',
  'TZS',
  'UAH',
  'UGX',
  'USD',
  'UYU',
  'UZS',
  'VED',
  'VND',
  'VUV',
  'WST',
  'XAF',
  'XCD',
  'XOF',
  'XPF',
  'YER',
  'ZAR',
  'ZMW',
  'ZWG'
] as const

const validCurrencies = new Set<string>(CURRENCY_CODES_ARRAY)

export const isValidCurrency = (code?: string): boolean => {
  return code ? validCurrencies.has(code) : false
}

export function getCurrencyCodeCount(): number {
  return validCurrencies.size
}

export function getCurrencyCodeError(code: string): string {
  if (!code) {
    return 'Currency code is required when numMode is "currency"'
  }

  if (code.length !== 3) {
    return `Currency code must be exactly 3 characters (got: ${code.length})`
  }

  if (!/^[A-Z]{3}$/.test(code)) {
    if (code.toUpperCase() !== code) {
      const upper = code.toUpperCase()
      if (validCurrencies.has(upper)) {
        return `Currency code must be UPPERCASE (got: "${code}", should be: "${upper}")`
      }
      return `Currency code must be UPPERCASE (got: "${code}")`
    }
    return `Currency code must be 3 uppercase letters (got: "${code}")`
  }

  return (
    `Invalid currency code: "${code}". Must be valid ISO 4217 code. ` +
    `Total valid codes: ${validCurrencies.size}. Examples: USD, EUR, GBP, JPY, CHF`
  )
}

export type CurrencyCode = (typeof CURRENCY_CODES_ARRAY)[number]
