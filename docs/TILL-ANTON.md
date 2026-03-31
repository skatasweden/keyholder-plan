Tja Anton!

Här är KEYHOLDER — det är ett bokföringsprogram som läser in SIE4-filer (den exporten du gör från Fortnox) och visar allt i en snygg webblösare: Balansrapport, Resultatrapport, Kontoplan, Huvudbok, Verifikationer — hela paketet.

Allt körs lokalt på din dator. Ingen molntjänst, inget konto, ingen kostnad. Du behöver bara Docker och Node.

## Hur du kör igång

1. Klona repot: `git clone https://github.com/skatasweden/keyholder-plan.git`
2. Öppna filen `docs/anton-startup-guide.md`
3. Kopiera hela promptblocket (mellan START PROMPT och END PROMPT)
4. Klistra in det i ett nytt Claude-samtal
5. Claude sätter upp allt åt dig steg för steg

Sen drar du bara in din SIE4-fil från Fortnox i browsern och kollar att Balansrapport och Resultatrapport ser rätt ut.

## Om det strular

- Docker måste köra (starta Docker Desktop först)
- Om frontend visar tomt: nyckeln i app/.env är fel — Claude fixar det
- Om import inte funkar: kolla att import-servern körs i en separat terminal

Hojta om du kör fast!

/Erik
