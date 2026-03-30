# Anton Startup Guide — KEYHOLDER Accounting Frontend

> **Vad detta ar:** En guide som du ger till din Claude (eller annan AI-assistent) sa den kan satta upp hela KEYHOLDER-projektet pa din dator. Nar du ar klar kan du importera din SIE4-fil fran Fortnox och se Balansrapport + Resultatrapport direkt i browsern.

---

## Prompt till Claude

Kopiera allt nedan och klistra in som forsta meddelande till Claude i ett nytt projekt:

---

### START PROMPT

```
Jag vill satta upp KEYHOLDER-projektet lokalt. Det ar ett svenskt bokforingsprogram som importerar SIE4-filer och visar Balansrapport, Resultatrapport, Kontoplan, Huvudbok, Verifikationer mm i en webblasare.

Folj stegen nedan exakt. Fraga mig om nagot ar oklart.

## Forutsattningar

Jag behover foljande installerat:
- Node.js 20+ (kolla med: node -v)
- npm 10+ (kolla med: npm -v)
- Docker Desktop (maste kora for att Supabase ska funka)
- Git

Om nagot saknas, hjalp mig installera det forst.

## Steg 1: Klona repot

git clone https://github.com/skatasweden/keyholder-plan.git
cd keyholder-plan

## Steg 2: Installera dependencies (3 package.json-filer)

npm install              # rot-paketen (parser, importer, tester)
cd app && npm install    # frontend (React, Vite, Tailwind)
cd ../server && npm install  # import-server (Hono)
cd ..

## Steg 3: Starta Supabase (kraver Docker)

Docker Desktop maste kora. Sen:

npx supabase start

Forsta gangen tar det nagra minuter (laddar ner Docker-images).

Nar den ar klar, kor:

npx supabase status

Du far ut nagot som:

  Project URL    : http://127.0.0.1:54421
  Publishable    : sb_publishable_XXXXXXXX
  Secret         : sb_secret_YYYYYYYY

VIKTIGT: Spara bade "Publishable"-nyckeln och "Secret"-nyckeln. Du behover dem i nasta steg.

Om du INTE ser "Publishable"/"Secret" utan istallet ser "anon key"/"service_role key" som borjar med "eyJ..." — anvand de istallet (samma sak, aldre format).

## Steg 4: Skapa .env-filer

Skapa filen .env i ROTMAPPEN (keyholder-plan/.env):

SUPABASE_URL=http://127.0.0.1:54421
SUPABASE_SERVICE_KEY=<Secret-nyckeln fran steg 3>

Skapa filen app/.env:

VITE_SUPABASE_URL=http://127.0.0.1:54421
VITE_SUPABASE_ANON_KEY=<Publishable-nyckeln fran steg 3>

VIKTIGT: Porten ar 54421, INTE 54321. Projektet anvander en anpassad port.

## Steg 5: Kor databasmigrationer

npx supabase db reset

Detta skapar alla 13 tabeller + 2 SQL-funktioner + RLS-policys.
Output ska sluta med "Finished supabase db reset on branch main."

## Steg 6: Verifiera med tester

npm test

Forvantat: "104 passed". Om nagot failar, nagot gick fel i steg 3-5.

## Steg 7: Starta import-servern

Oppna en NY terminal (lat den kora):

cd server
npm run dev

Du ska se: "Import server running on http://localhost:3003"

Denna maste kora hela tiden medans du anvander appen. Den hanterar SIE4-import och Fortnox-jamforelse.

## Steg 8: Starta frontend

Oppna YTTERLIGARE en terminal (lat den kora):

cd app
npm run dev

Du ska se: "Local: http://localhost:5173/"

Om port 5173 ar upptagen anvander Vite 5174 istallet. Det gar bra — servern accepterar bada.

## Steg 9: Oppna i webblasaren

Ga till http://localhost:5173 (eller 5174)

Du ska se KEYHOLDER med en sidebar och en import-sida.

## Steg 10: Importera din SIE4-fil

1. Pa import-sidan: klicka "Valj fil" eller dra in din .se-fil
2. Vanta nagra sekunder — du ser "Import klar" med statistik
3. Du redirectas till foretagets oversiktssida

Testa garna med testfilerna i SIE/-mappen forst:
- SIE/RevILAB20260330_165333.se
- SIE/SkataSwedenAB20260330_170222.se

## Steg 11: Verifiera Balansrapport och Resultatrapport

Klicka "Balansrapport" i sidebaren. Kolla att:
- SUMMA TILLGANGAR visas langst ner i tillgangs-sektionen
- Alla konton har ratt belopp

Klicka "Resultatrapport". Kolla att:
- BERAKNAT RESULTAT visas langst ner
- Intakter ar positiva, kostnader negativa

Om du importerade testfilerna ska varden matcha:

| Foretag | SUMMA TILLGANGAR | BERAKNAT RESULTAT |
|---------|-----------------|-------------------|
| RevIL AB | 3 952 190,47 | 869 954,78 |
| Skata Sweden AB | 430 607,53 | 58 795,82 |

## Felsokningsguide

### "Import server running" syns inte
- Kolla att du ar i server/-mappen
- Kolla att Docker kor (Supabase maste vara uppe)
- Kolla att .env i rotmappen har ratt SUPABASE_SERVICE_KEY

### Frontend visar inga foretag i dropdownen
- 401-fel: Fel nyckel i app/.env. Kor "npx supabase status" och kopiera Publishable-nyckeln
- Tomt utan fel: Ingen data importerad an. Importera en SIE4-fil forst.
- Nyckelformatet: Om din supabase ger "anon key: eyJ..." anvand den. Om den ger "Publishable: sb_publishable_..." anvand den. Det beror pa vilken version av Supabase CLI du har.

### Import klickar men inget hander
- Kolla att import-servern kor pa port 3003
- Kolla browserns devtools (F12 > Network) for felmeddelanden
- Kolla att filen slutar pa .se (SIE4-format)

### npm test failar
- Kor "npx supabase db reset" forst (migrationer maste vara applicerade)
- Kolla att Supabase kor: "npx supabase status"

### "supabase start" failar
- Docker Desktop maste kora
- Om portar ar upptagna: "npx supabase stop" och sen "npx supabase start" igen
- Forsta starten laddar ~2 GB Docker images, kraver bra internet

## Ovrigt att veta

- All data lever lokalt i Docker — inget skickas ut
- Du kan importera flera foretag — vaxla med dropdownen i sidebaren
- "npx supabase db reset" rensar ALL data (du maste importera om)
- Supabase Studio: http://127.0.0.1:54423 — dar kan du se tabellerna direkt
- Testfiler i SIE/-mappen ar fran riktiga (anonymiserade) foretag
- Fullstandig teknisk docs i app/FRONTEND.md
```

### END PROMPT

---

## Sammanfattning av vad som hander

1. **Docker** kor en lokal Supabase (Postgres + REST API)
2. **Import-servern** (Node.js/Hono) tar emot SIE4-filer, parsar dem, och skriver till Supabase
3. **Frontend** (React) laser fran Supabase och visar data i 9 vyer
4. Allt ar lokalt — ingen molntjanst, ingen inloggning, ingen kostnad

## Krav pa datorn

- ~3 GB diskutrymme (Docker images + node_modules)
- 8 GB RAM (Docker + Node + browser)
- macOS, Linux, eller Windows med WSL2
- Docker Desktop installerat och startad
