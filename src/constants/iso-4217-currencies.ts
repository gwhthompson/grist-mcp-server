/**
 * ISO 4217 Currency Codes - Matches Grist's Exact Implementation
 *
 * **Why Static List?**
 * Grist's source uses locale-currency dynamically, but that package doesn't export /map
 * in its package.json "exports" field, causing runtime import errors in Vite/Vitest.
 *
 * This static list was extracted from locale-currency v1.0.0 + SSP (Grist's addition).
 * Since currency codes change very rarely (maybe once per year), a static list is acceptable.
 *
 * **How to Update:**
 * Run: node -e "const m=require('locale-currency/map.js');console.log(Object.values(m))"
 * Then add 'SSP' and sort.
 *
 * Source: Grist source code (app/common/NumberFormat.ts) + locale-currency package
 * Last updated: 2025-11-06
 * Total: 165 unique currency codes
 */

/**
 * Valid currency codes matching Grist's implementation
 * Extracted from locale-currency map (country code → currency code) + SSP
 */
const CURRENCY_CODES_ARRAY = [
  'AED', 'AFN', 'ALL', 'AMD', 'ANG', 'AOA', 'ARS', 'AUD', 'AWG', 'AZN',
  'BAM', 'BBD', 'BDT', 'BGN', 'BHD', 'BIF', 'BMD', 'BND', 'BOB', 'BRL',
  'BSD', 'BTN', 'BWP', 'BYN', 'BZD', 'CAD', 'CDF', 'CHF', 'CLP', 'CNY',
  'COP', 'CRC', 'CUP', 'CVE', 'CZK', 'DJF', 'DKK', 'DOP', 'DZD', 'EGP',
  'ERN', 'ETB', 'EUR', 'FJD', 'FKP', 'GBP', 'GEL', 'GHS', 'GIP', 'GMD',
  'GNF', 'GTQ', 'GYD', 'HKD', 'HNL', 'HTG', 'HUF', 'IDR', 'ILS', 'INR',
  'IQD', 'IRR', 'ISK', 'JMD', 'JOD', 'JPY', 'KES', 'KGS', 'KHR', 'KMF',
  'KPW', 'KRW', 'KWD', 'KYD', 'KZT', 'LAK', 'LBP', 'LKR', 'LRD', 'LSL',
  'LYD', 'MAD', 'MDL', 'MGA', 'MKD', 'MMK', 'MNT', 'MOP', 'MRU', 'MUR',
  'MVR', 'MWK', 'MXN', 'MYR', 'MZN', 'NAD', 'NGN', 'NIO', 'NOK', 'NPR',
  'NZD', 'OMR', 'PAB', 'PEN', 'PGK', 'PHP', 'PKR', 'PLN', 'PYG', 'QAR',
  'RON', 'RSD', 'RUB', 'RWF', 'SAR', 'SBD', 'SCR', 'SDG', 'SEK', 'SGD',
  'SHP', 'SLE', 'SOS', 'SRD', 'SSP', 'STN', 'SVC', 'SYP', 'SZL', 'THB',
  'TJS', 'TMT', 'TND', 'TOP', 'TRY', 'TTD', 'TWD', 'TZS', 'UAH', 'UGX',
  'USD', 'UYU', 'UZS', 'VED', 'VND', 'VUV', 'WST', 'XAF', 'XCD', 'XOF',
  'XPF', 'YER', 'ZAR', 'ZMW', 'ZWG'
] as const

/**
 * Set for O(1) lookup - matches Grist's implementation
 */
const validCurrencies = new Set<string>(CURRENCY_CODES_ARRAY)

/**
 * Check if a string is a valid currency code
 * Matches Grist's exact validation logic
 *
 * @param code - Currency code to validate
 * @returns True if valid currency code
 *
 * @example
 * isValidCurrency('USD')  // ✅ true
 * isValidCurrency('EUR')  // ✅ true
 * isValidCurrency('SSP')  // ✅ true (Grist addition)
 * isValidCurrency('FAKE') // ❌ false
 */
export const isValidCurrency = (code?: string): boolean => {
  return code ? validCurrencies.has(code) : false
}

/**
 * Get count of valid currency codes
 */
export function getCurrencyCodeCount(): number {
  return validCurrencies.size
}

/**
 * Get validation error message for invalid currency code
 */
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

  return `Invalid currency code: "${code}". Must be valid ISO 4217 code. ` +
    `Total valid codes: ${validCurrencies.size}. Examples: USD, EUR, GBP, JPY, CHF`
}

/**
 * TypeScript type for valid currency codes
 */
export type CurrencyCode = (typeof CURRENCY_CODES_ARRAY)[number]
