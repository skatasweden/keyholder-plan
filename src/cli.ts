import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'
import { parseSIE4 } from './sie4-parser.js'
import { importToSupabase } from './sie4-importer.js'
import { validateImport } from './sie4-validator.js'

const SUPABASE_URL = 'http://127.0.0.1:54421'
const SUPABASE_SERVICE_KEY = '$SUPABASE_SERVICE_KEY'

async function main() {
  const filePath = process.argv[2]
  if (!filePath) {
    console.error('Usage: npx tsx src/cli.ts <path-to-sie-file>')
    process.exit(1)
  }

  // 1. Read file
  console.log(`Reading ${filePath}...`)
  const buffer = readFileSync(filePath)

  // 2. Parse
  console.log('Parsing SIE4...')
  const parsed = parseSIE4(buffer)

  // 3. Print parse summary
  console.log(`\nCompany: ${parsed.meta.company_name}`)
  console.log(`Org number: ${parsed.meta.org_number}`)
  console.log(`Financial years: ${parsed.financial_years.length}`)
  console.log(`Accounts: ${parsed.accounts.length}`)
  console.log(`Vouchers: ${parsed.vouchers.length}`)
  console.log(`Voucher rows: ${parsed.vouchers.reduce((s, v) => s + v.rows.length, 0)}`)
  if (parsed.parse_errors.length > 0) {
    console.log(`\n⚠ ${parsed.parse_errors.length} parse error(s):`)
    for (const e of parsed.parse_errors) {
      console.log(`  Line ${e.line_number}: ${e.error}`)
    }
  }

  // 4. Connect to Supabase
  console.log('\nConnecting to local Supabase...')
  const client = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  // 5. Import
  console.log('Importing...\n')
  const result = await importToSupabase(parsed, client)

  if (!result.success) {
    console.error('\nImport errors:')
    for (const e of result.import_errors) {
      console.error(`  [${e.stage}] ${e.error}`)
    }
    process.exit(1)
  }

  console.log(`\nImport completed in ${result.duration_ms}ms`)

  // 6. Validate
  console.log('\nRunning validation...')
  const report = await validateImport(parsed, client)

  if (!report.passed) {
    process.exit(1)
  }
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
