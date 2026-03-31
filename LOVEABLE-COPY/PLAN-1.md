  1. Hur Lovable är byggt

  Tre-stegs AI-pipeline

  ┌───────────────┬───────────────────┬─────────────────────────────────────────────────────────────────────┐
  │     Steg      │      Modell       │                                Syfte                                │
  ├───────────────┼───────────────────┼─────────────────────────────────────────────────────────────────────┤
  │ Triage        │ GPT-4 Mini        │ Snabbt avgör intent + väljer relevanta filer ur kodbasen            │
  ├───────────────┼───────────────────┼─────────────────────────────────────────────────────────────────────┤
  │ Kodgenerering │ Claude 3.5 Sonnet │ Genererar React/TypeScript, Supabase-queries, edge functions        │
  ├───────────────┼───────────────────┼─────────────────────────────────────────────────────────────────────┤
  │ Verifiering   │ Live compile      │ Kod pushas till Fly.io container, Vite kompilerar, preview serveras │
  └───────────────┴───────────────────┴─────────────────────────────────────────────────────────────────────┘

  Tech stack (genererade appar)

  - Frontend: React 18 + TypeScript + Vite + Tailwind CSS + shadcn/ui
  - Backend: Supabase (PostgreSQL, Auth, Storage, Edge Functions)
  - Preview: Fly.io Machines (Firecracker MicroVMs) — 4,000+ instanser, <125ms startup
  - Version control: GitHub/GitLab (bidirektionell sync)
  - Deploy: Lovable Cloud (Supabase-infra), Netlify, eller Vercel

  Supabase-integration

  - 1:1 mapping — varje Lovable-projekt kopplas till ett Supabase-projekt
  - AI genererar SQL DDL, RLS policies, Auth-flöden, Storage-uploads automatiskt
  - Edge functions deployas via Supabase CLI som körs bakom kulisserna
  - En custom "context layer" ger LLM:en optimalt strukturerad info om schema, relationer, secrets

  Visual Edits (deras killer feature)

  - Custom Vite-plugin som tilldelar unika ID:n till varje JSX-komponent vid compile-time
  - Hela AST synkas till browsern via Babel/SWC
  - Klick på DOM-element → exakt JSX-källa. Ändring i JSX → instant HMR-uppdatering

  Affärsmodell

  - $200M+ ARR, $6.6B valuation (dec 2025)
  - Free: 5 credits/dag | Pro: $25/mo, 100 credits | Business: $50/mo | Enterprise: custom

  ---
  2. Så bygger du "Lovable för Redovisning"

  Arkitektur: Control Plane + Tenant Instances

  ┌─────────────────────────────────────────────────────────┐
  │                    KEYHOLDER PLATFORM                     │
  │                   (din "control plane")                   │
  ├─────────────────────────────────────────────────────────┤
  │                                                          │
  │  ┌──────────┐  ┌──────────────┐  ┌───────────────────┐  │
  │  │ Next.js  │  │ Claude Chat  │  │ Tenant Provisioner │  │
  │  │ Frontend │  │ Interface    │  │ (Mgmt API)         │  │
  │  └────┬─────┘  └──────┬───────┘  └────────┬──────────┘  │
  │       │               │                    │             │
  ├───────┼───────────────┼────────────────────┼─────────────┤
  │       │               │                    │             │
  │  ┌────▼───────────────▼────────────────────▼──────────┐  │
  │  │          Supabase Management API                    │  │
  │  │    POST /v1/projects  (skapa ny tenant)             │  │
  │  │    POST /v1/projects/{ref}/functions (deploy EF)    │  │
  │  │    POST /v1/projects/{ref}/database/query           │  │
  │  └────────────────────┬───────────────────────────────┘  │
  │                       │                                  │
  └───────────────────────┼──────────────────────────────────┘
                          │
           ┌──────────────┼──────────────────┐
           │              │                  │
      ┌────▼────┐   ┌─────▼─────┐   ┌───────▼───────┐
      │ Tenant A│   │ Tenant B  │   │  Tenant C     │
      │ Supabase│   │ Supabase  │   │  Supabase     │
      │ Project │   │ Project   │   │  Project      │
      │         │   │           │   │               │
      │ • DB    │   │ • DB      │   │ • DB          │
      │ • Auth  │   │ • Auth    │   │ • Auth        │
      │ • EF    │   │ • EF      │   │ • EF          │
      │ • MCP   │   │ • MCP     │   │ • MCP         │
      └─────────┘   └───────────┘   └───────────────┘

  Steg-för-steg

  1. Tenant Provisioning via Supabase Management API
  POST https://api.supabase.com/v1/projects
  Authorization: Bearer <access_token>

  {
    "organization_id": "your-org-id",
    "name": "keyholder-tenant-{company_org_nr}",
    "db_pass": "<generated>",
    "region": "eu-central-1",
    "plan": "free"  // eller "pro" — Pico instances med partnership
  }
  - Varje kund får ett helt eget Supabase-projekt — fullständig dataisolering (kritiskt för bokföringsdata)
  - Rate limit: 120 req/min. Auth via Personal Access Token eller OAuth 2.0

  2. Automatisk schema-deploy efter skapande
  - Använd Management API eller Supabase CLI (supabase db push --project-ref <ref>)
  - Deploya dina 14 SIE-tabeller + nya redovisnings-/revisionstabeller
  - Deploya standard edge functions (SIE-import, rapportgenerering, validering)

  3. Claude Chat-integration
  - Varje tenant-projekt exponeras via Supabase MCP Server (https://mcp.supabase.com/mcp)
  - Användaren chattar med Claude som har full access till deras databas via MCP
  - Claude kan köra SQL, skapa migrationer, deploya edge functions, generera rapporter

  4. Edge Functions som "app builder"
  - Användaren beskriver vad de vill: "Skapa en månadscheck som verifierar att alla leverantörsfakturor över 10K SEK har matchande inköpsorder"
  - Claude genererar en TypeScript edge function och deployer den via Management API
  - Funktionen triggas på schedule (cron) eller database webhook

  5. Kostnad per tenant

  ┌─────────────────────────────┬───────────────────────────────────────────┐
  │          Scenario           │                  Kostnad                  │
  ├─────────────────────────────┼───────────────────────────────────────────┤
  │ Supabase Free tier          │ $0 (2 projekt max per org)                │
  ├─────────────────────────────┼───────────────────────────────────────────┤
  │ Pro plan                    │ $25/mo per org (inte per projekt)         │
  ├─────────────────────────────┼───────────────────────────────────────────┤
  │ Micro instance per tenant   │ ~$12/mo extra per projekt                 │
  ├─────────────────────────────┼───────────────────────────────────────────┤
  │ Pico instance (partnership) │ Scale-to-zero, betala bara vid användning │
  ├─────────────────────────────┼───────────────────────────────────────────┤
  │ 100 tenants på Micro        │ ~$1,225/mo                                │
  ├─────────────────────────────┼───────────────────────────────────────────┤
  │ 100 tenants på Pico         │ Betydligt billigare                       │
  └─────────────────────────────┴───────────────────────────────────────────┘

  Kritiskt: Ansök om Supabase Platform Partnership — detta ger dig Pico instances (scale-to-zero), avancerade Management API-endpoints, och volympriser. Lovable har detta.

  ---
  3. Varför detta revolutionerar svensk redovisning

  Marknadsläget är perfekt

  ┌───────────────────────────────────────────────────────┬───────────────────────────────────────────────┐
  │                        Faktor                         │                    Status                     │
  ├───────────────────────────────────────────────────────┼───────────────────────────────────────────────┤
  │ AI-native redovisningsplattform för Sverige           │ Existerar inte                                │
  ├───────────────────────────────────────────────────────┼───────────────────────────────────────────────┤
  │ Alla globala AI-plattformar (Rillet, Numeric, Puzzle) │ Byggda för US GAAP                            │
  ├───────────────────────────────────────────────────────┼───────────────────────────────────────────────┤
  │ Fortnox                                               │ 612K kunder, $5.5B bud, men traditionell SaaS │
  ├───────────────────────────────────────────────────────┼───────────────────────────────────────────────┤
  │ Bokio/Dooer/Wint                                      │ Små, fokus på mikro-företag                   │
  ├───────────────────────────────────────────────────────┼───────────────────────────────────────────────┤
  │ Svenska företag som outsourcar bokföring              │ 58% (högst i Europa)                          │
  ├───────────────────────────────────────────────────────┼───────────────────────────────────────────────┤
  │ AI adoption i redovisning                             │ Bara 16% har implementerat                    │
  └───────────────────────────────────────────────────────┴───────────────────────────────────────────────┘

  Din unika position

  1. SIE4 som data-onramp — du har redan en komplett SIE4-parser (14 tabeller, 69 tester, öre-precision). Varje svenskt företag kan exportera sin hela bokföring till dig direkt.
  2. Fortnox-spegeln först, sedan ersätt — din long-term vision matchar perfekt. Importera allt via SIE4, visa att du kan allt Fortnox kan, lägg sedan till det de inte kan.
  3. Edge functions = oändlig anpassningsbarhet — revisorer kan bygga egna valideringsregler, controllers kan skapa custom dashboards, alla via naturligt språk.

  Konkreta use cases

  För redovisning:
  - "Visa alla transaktioner över 50K SEK i december utan matchande fakturor"
  - Automatisk momsdeklaration via Skatteverkets nya API (dec 2025)
  - Realtids-validering mot BAS/K2/K3 vid varje verifikation
  - Automatiska periodavstämningar och bokslutsförslag

  För revision:
  - Kontinuerlig 100%-granskning (inte stickprov) via AI-anomalidetektion
  - Automatisk korsreferering av verifikationer mot underlag
  - PwC förutspår end-to-end AI-revision inom 2026

  Anpassade verktyg via chat:
  - "Bygg en edge function som varje måndag checkar att alla lönetransaktioner stämmer mot Hogia-exporten"
  - "Skapa en rapport som visar likviditetsprognos 90 dagar framåt baserat på historiska mönster"
  - "Gör en integration med Tink som automatiskt kategoriserar banktransaktioner"

  Essentiella integrationer

  ┌───────────┬─────────────────────┬─────────────────────────┐
  │ Prioritet │     Integration     │         Varför          │
  ├───────────┼─────────────────────┼─────────────────────────┤
  │ Must      │ SIE4 import/export  │ Universell datautbyte   │
  ├───────────┼─────────────────────┼─────────────────────────┤
  │ Must      │ BAS kontoplan       │ Standard kontoplan      │
  ├───────────┼─────────────────────┼─────────────────────────┤
  │ Must      │ Skatteverket API    │ Momsdeklaration         │
  ├───────────┼─────────────────────┼─────────────────────────┤
  │ Must      │ Open Banking (Tink) │ Banktransaktioner       │
  ├───────────┼─────────────────────┼─────────────────────────┤
  │ Hög       │ Fortnox API         │ 612K potentiella kunder │
  ├───────────┼─────────────────────┼─────────────────────────┤
  │ Hög       │ Bankgiro/Plusgiro   │ B2B-betalningar         │
  ├───────────┼─────────────────────┼─────────────────────────┤
  │ Medel     │ Bolagsverket        │ Årsredovisning          │
  ├───────────┼─────────────────────┼─────────────────────────┤
  │ Medel     │ Peppol/SFTI         │ E-faktura               │
  └───────────┴─────────────────────┴─────────────────────────┘

  ---
  Sammanfattning: Vad du behöver bygga

  1. Control Plane — Next.js app med användarregistrering, prenumerationshantering, tenant-provisioning
  2. Tenant Provisioner — Service som anropar Supabase Management API för att skapa/konfigurera projekt
  3. Schema Templates — Standardmigrationer (dina 14 SIE-tabeller + redovisningsschema) som deployas till varje ny tenant
  4. Claude Chat UI — Chattgränssnitt som kopplar Claude till kundens Supabase via MCP
  5. Edge Function Library — Förbyggda funktioner (SIE-import, rapporter, validering) + möjlighet att skapa custom via chat
  6. Supabase Platform Partnership — Ansök om Pico instances och volympriser

  Vill du att jag gör en implementationsplan för detta?