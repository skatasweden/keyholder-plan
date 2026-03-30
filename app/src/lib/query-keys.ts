export const queryKeys = {
  companies: {
    all: () => ['companies'] as const,
    detail: (id: string) => ['companies', id] as const,
  },
  financialYears: {
    byCompany: (companyId: string) => ['financial-years', companyId] as const,
  },
  accounts: {
    byCompany: (companyId: string) => ['accounts', companyId] as const,
  },
  vouchers: {
    list: (fyId: string, page: number) => ['vouchers', fyId, page] as const,
    detail: (id: string) => ['vouchers', 'detail', id] as const,
    byFy: (fyId: string) => ['vouchers', fyId] as const,
  },
  reports: {
    balans: (fyId: string) => ['reports', 'balans', fyId] as const,
    resultat: (fyId: string) => ['reports', 'resultat', fyId] as const,
  },
  huvudbok: {
    byAccount: (fyId: string, accountNumber: number) =>
      ['huvudbok', fyId, accountNumber] as const,
  },
  dimensions: {
    byCompany: (companyId: string) => ['dimensions', companyId] as const,
    objects: (companyId: string, dimNumber: number) =>
      ['dimensions', companyId, 'objects', dimNumber] as const,
  },
  validation: {
    checks: (companyId: string, fyId: string) =>
      ['validation', companyId, fyId] as const,
  },
} as const
