export interface ParsedSIE4 {
  meta: {
    flagga: number
    format: string
    sietyp: number
    program: string
    generated: string
    fortnox_number: string
    company_name: string
    org_number: string
    address: {
      contact: string
      street: string
      postal: string
      phone: string
    }
    balance_date: string
    account_plan_type: string
  }
  financial_years: Array<{
    year_index: number
    start_date: string
    end_date: string
  }>
  accounts: Array<{
    account_number: number
    name: string
    account_type: 'T' | 'S' | 'K' | 'I' | null
  }>
  sru_codes: Array<{
    account_number: number
    sru_code: string
  }>
  dimensions: Array<{
    dimension_number: number
    name: string
  }>
  objects: Array<{
    dimension_number: number
    object_number: string
    name: string
  }>
  opening_balances: Array<{
    year_index: number
    account_number: number
    amount: number
    quarter: number
  }>
  closing_balances: Array<{
    year_index: number
    account_number: number
    amount: number
    quarter: number
  }>
  period_results: Array<{
    year_index: number
    account_number: number
    amount: number
  }>
  period_balances: Array<{
    year_index: number
    period: number
    account_number: number
    amount: number
    quarter: number
  }>
  vouchers: Array<{
    series: string
    voucher_number: number
    date: string
    description: string
    registration_date: string
    rows: Array<{
      type: 'normal' | 'btrans' | 'rtrans'
      account_number: number
      dim_number: number | null
      object_number: string | null
      amount: number
      description: string
      quarter: number
      name: string | null
    }>
  }>
  parse_errors: Array<{
    line_number: number
    line: string
    error: string
  }>
}

export interface ImportResult {
  success: boolean
  stats: {
    company_info: number
    financial_years: number
    dimensions: number
    objects: number
    accounts: number
    sru_codes: number
    opening_balances: number
    closing_balances: number
    period_results: number
    period_balances: number
    vouchers: number
    voucher_rows: number
  }
  parse_errors: Array<{ line_number: number; line: string; error: string }>
  import_errors: Array<{ stage: string; error: string }>
  duration_ms: number
}

export interface ValidationReport {
  passed: boolean
  checks: Array<{
    name: string
    status: 'pass' | 'fail'
    expected: string | number
    actual: string | number
    details?: string
  }>
}
