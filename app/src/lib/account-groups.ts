export interface AccountGroup {
  label: string
  range: [number, number]
  subgroups?: AccountGroup[]
}

export const balansGroups: AccountGroup[] = [
  {
    label: 'TILLGANGAR',
    range: [1000, 1999],
    subgroups: [
      { label: 'Immateriella anlaggningstillgangar', range: [1000, 1099] },
      { label: 'Byggnader och mark', range: [1100, 1199] },
      { label: 'Maskiner och inventarier', range: [1200, 1299] },
      { label: 'Finansiella anlaggningstillgangar', range: [1300, 1399] },
      { label: 'Varulager', range: [1400, 1499] },
      { label: 'Kundfordringar', range: [1500, 1599] },
      { label: 'Ovriga kortfristiga fordringar', range: [1600, 1799] },
      { label: 'Kortfristiga placeringar', range: [1800, 1899] },
      { label: 'Kassa och bank', range: [1900, 1999] },
    ],
  },
  {
    label: 'EGET KAPITAL, AVSATTNINGAR OCH SKULDER',
    range: [2000, 2999],
    subgroups: [
      { label: 'Eget kapital', range: [2000, 2099] },
      { label: 'Obeskattade reserver', range: [2100, 2199] },
      { label: 'Avsattningar', range: [2200, 2299] },
      { label: 'Langfristiga skulder', range: [2300, 2399] },
      { label: 'Kortfristiga skulder', range: [2400, 2999] },
    ],
  },
]

export const resultatGroups: AccountGroup[] = [
  {
    label: 'Rorelsens intakter',
    range: [3000, 3999],
  },
  {
    label: 'Rorelsens kostnader',
    range: [4000, 6999],
    subgroups: [
      { label: 'Ravaror och fornodenheter', range: [4000, 4999] },
      { label: 'Ovriga externa kostnader', range: [5000, 5999] },
      { label: 'Personalkostnader', range: [6000, 6999] },
    ],
  },
  {
    label: 'Avskrivningar',
    range: [7000, 7799],
  },
  {
    label: 'Finansiella poster',
    range: [7800, 7999],
    subgroups: [
      { label: 'Finansiella intakter', range: [7800, 7899] },
      { label: 'Finansiella kostnader', range: [7900, 7999] },
    ],
  },
  {
    label: 'Extraordinara poster & skatt',
    range: [8000, 8999],
  },
]

/** Get all accounts in a range from a flat row array */
export function accountsInRange<T extends { account_number: number }>(
  rows: T[],
  min: number,
  max: number
): T[] {
  return rows.filter(r => r.account_number >= min && r.account_number <= max)
}

/** Sum a numeric field for accounts in a range */
export function sumRange<T extends { account_number: number }>(
  rows: T[],
  min: number,
  max: number,
  field: keyof T
): number {
  return accountsInRange(rows, min, max).reduce(
    (sum, r) => sum + (parseFloat(String(r[field])) || 0),
    0
  )
}
