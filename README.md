# Sjakkanalyse

Analyser sjakkpartier lokalt med Stockfish. Lim inn en PGN, og appen evaluerer hver stilling, klassifiserer trekkene og beregner accuracy for begge spillere. Alt kjører på din egen maskin: Stockfish går som WebAssembly i en Web Worker, uten eksterne API-er.

Finnes både som web-app (Vite + React + TypeScript) og som Windows desktop-app (Electron).

## Funksjoner

- **Analyse av hele partiet** med Stockfish 19 (lite, single-threaded) på dybde 16.
- **Klassifisering** av hvert trekk etter hvor mye vinnersjansen faller:

  | Kategori     | Fall i vinnersjanse            | Symbol |
  | ------------ | ------------------------------ | ------ |
  | Beste        | motorens trekk eller under 2 % | ★      |
  | Bra          | under 10 %                     |        |
  | Unøyaktighet | 10–20 %                        | ?!     |
  | Feil         | 20–30 %                        | ?      |
  | Blunder      | 30 % eller mer                 | ??     |

- **Merker:**
  - 🦁 **Beast** når du spiller nøyaktig motorens beste trekk.
  - 🫏 **Donkey** ved feil og blunder.

  Merkene vises i trekklisten og på brettet.
- **Accuracy per spiller**, beregnet med Lichess-formelen.
- **Eval-bar**, **evalueringsgraf** (klikk for å hoppe dit) og en **pil** for beste trekk.
- **Interaktiv analyse:** dra brikker fra hvilken som helst stilling for å utforske en variant. Stockfish evaluerer den nye stillingen fortløpende, og varianten vises som en sidelinje.

## Installasjon

### Windows-installer

1. Bygg installeren (se [Bygge Windows-installeren](#bygge-windows-installeren)), eller bruk en ferdig bygget `Sjakkanalyse-Setup-<versjon>.exe`.
2. Kjør installeren og velg installasjonsmappe.
   - Den legger inn snarveier i Startmenyen og på skrivebordet.
   - Den installeres per bruker og trenger ikke administratorrettigheter.
3. Installeren er ikke kodesignert, så Windows SmartScreen kan advare første gang. Velg **Mer info → Kjør likevel**.

### Fra kildekoden

Krever [Node.js](https://nodejs.org/) 20 eller nyere.

```bash
git clone https://github.com/Carl-swex/Sjakk_analyse-.git
cd Sjakk_analyse-
npm install
```

`npm install` kopierer også Stockfish-filene fra `node_modules/stockfish` til `public/stockfish/`.

## Bruk

### Starte appen

| Kommando           | Hva den gjør                                                  |
| ------------------ | ------------------------------------------------------------- |
| `npm run dev`      | Starter dev-serveren (http://localhost:5173)                  |
| `start.bat`        | Dobbeltklikk på Windows: installerer ved behov, starter dev-serveren og åpner nettleseren |
| `npm run electron` | Bygger og åpner desktop-appen uten installer                  |
| `npm run build`    | Typesjekker og bygger web-appen til `dist/`                   |
| `npm run preview`  | Serverer det ferdige bygget fra `dist/`                       |

### Analysere et parti

1. Lim inn en PGN i tekstfeltet. Et eksempelparti (Morphys operaparti) ligger der fra start.
2. Klikk **Analyser**. Fremdriften vises mens hver stilling analyseres, vanligvis rundt 0,25 sekunder per stilling.
3. Bla gjennom partiet med trekklisten, grafen eller tastaturet.

### Utforske varianter

- **Lage en variant:** dra en brikke for siden som er i trekket. Ulovlige trekk avvises, og bønder forfremmes automatisk til dronning.
- **Følge partiet:** drar du partiets eget neste trekk, går appen bare videre i partiet.
- **Avvike:** et annet trekk lager en variant. Den evalueres fortløpende til dybde 18, med oppdatert eval-bar, beste trekk og pil.
- **Tilbake til partiet:** klikk **↩ Tilbake til partiet**, trykk **Esc** eller klikk et trekk i trekklisten.

### Tastatursnarveier

| Tast          | Handling                                            |
| ------------- | --------------------------------------------------- |
| ← / →         | Forrige / neste trekk (også i en variant)           |
| ↑ / Home      | Til start                                           |
| ↓ / End       | Til slutt                                           |
| Esc           | Forlat varianten og gå tilbake til partiet          |
| F             | Snu brettet                                         |

## Bygge Windows-installeren

```bash
npm run dist:win
```

Installeren havner i `release/Sjakkanalyse-Setup-<versjon>.exe`, og en utpakket versjon ligger i `release/win-unpacked/`.

Hvis du vil bruke et eget ikon, legg en `build/icon.ico` (256×256) i prosjektet før du bygger.

## Slik fungerer analysen

**Vinnersjanse.** Centipawn-verdien (cp) gjøres om til vinnersjanse med Lichess-formelen. cp begrenses til ±1000, og matt regnes som full seier:

```
win% = 50 + 50 · (2 / (1 + e^(−0.00368208 · cp)) − 1)
```

**Klassifisering.** Hvert trekk vurderes etter hvor mye vinnersjansen faller for spilleren som trakk, fra stillingen før trekket til stillingen etter.

**Accuracy.** Per trekk brukes Lichess-formelen `103.1668 · e^(−0.04354 · fall) − 3.1669`. Accuracy for en spiller er gjennomsnittet over alle trekkene spilleren gjorde. Lichess bruker i tillegg vekting, så tallene kan avvike noe fra deres.

## Prosjektstruktur

```
electron/main.cjs        Electron-hovedprosess: serverer dist/ via app:// med COOP/COEP
scripts/                 Kopierer Stockfish-filene til public/ ved npm install
src/
  App.tsx                Hovedkomponent: PGN, brett, navigasjon og varianter
  analysis.ts            PGN-parsing, vinnersjanse, klassifisering og accuracy
  engine.ts              UCI-wrapper rundt Stockfish i en Web Worker
  useLiveEval.ts         Fortløpende evaluering av varianter
  tags.ts                Beast/Donkey-merker
  components/            EvalBar, EvalGraph og MoveList
start.bat                Starter dev-serveren og åpner nettleseren
```

## Teknologi

- [Vite](https://vite.dev/), [React](https://react.dev/) og TypeScript
- [chess.js](https://github.com/jhlywa/chess.js): PGN-parsing og trekkvalidering
- [react-chessboard](https://github.com/Clariity/react-chessboard): brettet
- [Stockfish.js](https://github.com/nmrugg/stockfish.js): Stockfish 19 kompilert til WebAssembly
- [Electron](https://www.electronjs.org/) og [electron-builder](https://www.electron.build/): desktop-app og NSIS-installer

## Lisens

Stockfish er lisensiert under [GPL-3.0](https://github.com/official-stockfish/Stockfish/blob/master/Copying.txt). Både web-appen og installeren distribuerer Stockfish-motoren.
