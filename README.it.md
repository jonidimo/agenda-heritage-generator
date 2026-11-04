<div align="center">

# Heritage Studio

**Progetta, visualizza e stampa agende artigianali: qualsiasi anno, lingua e Paese,
in segnature piegate e cucite a mano.**

[![English](https://img.shields.io/badge/-English-8a9a7b?style=for-the-badge)](README.md)
[![Español](https://img.shields.io/badge/-Espa%C3%B1ol-8a9a7b?style=for-the-badge)](README.es.md)
[![Português](https://img.shields.io/badge/-Portugu%C3%AAs-8a9a7b?style=for-the-badge)](README.pt.md)
[![Italiano](https://img.shields.io/badge/-Italiano-2f5d3a?style=for-the-badge)](README.it.md)

<img src="docs/images/tapa.jpg" alt="L’agenda Heritage 2026, stampata al laser e cucita a mano" width="560">

</div>

Heritage Studio è nato come un’unica agenda artigianale per il 2026. Oggi è un’app che
costruisce il libro completo per qualsiasi anno: calendario, festività, registri delle
abitudini e pagine di pianificazione basate sulle scienze comportamentali. Dispone le
pagine su fogli pronti per una stampante fronte-retro, così puoi piegarli, cucirli e
rilegarli.

Funziona interamente nel browser, anche offline, su Linux, Windows e Android. Non viene
caricato nulla da nessuna parte.

![Modifica di una doppia pagina settimanale](docs/images/editor-spread.png)

## Cosa fa

### Vedi tutto esattamente come verrà stampato

- Quattro viste, aggiornate mentre modifichi: **pagina**, **doppia pagina**,
  **foglio stampato** (come esce dalla stampante, fronte e retro) e il **libro intero**.
- L’anteprima disegna gli stessi contorni delle lettere che finiscono nel PDF, quindi non
  dipende dai caratteri installati sul tuo computer.
- La **verifica preliminare** trova testi che non entrano, testi sovrapposti, ciò che esce
  dalla pagina o finisce nel margine che la stampante non stampa, segni mancanti in un
  carattere e immagini con poca risoluzione.

### Modifica con il mouse

- Trascina, sposta a piccoli passi, ridimensiona, ruota, attenua o nascondi qualsiasi
  elemento. Applica la modifica a tutte le pagine di quel tipo, riflessa nelle pagine di
  sinistra, o a una sola pagina. Calamita, guide dei margini, annulla e ripeti.
- **Filigrane per persona**: il colibrì o un tuo SVG o PNG, ancorati al bordo esterno o
  interno, con dimensioni e opacità.
- **Pagine personalizzate dove vuoi**: un’immagine, un SVG vettoriale o una pagina di un
  PDF (che resta vettoriale nel PDF finale), oppure una pagina a righe, a puntini o a
  quadretti. Il resto del libro si riorganizza da solo.
- Aggiungi testi, immagini, righe e cornici a qualsiasi tipo di pagina.

### Qualsiasi anno, lingua e Paese

- Testi stampati in spagnolo (Argentina, Uruguay, Cile, Messico, Colombia, Perù,
  Spagna), inglese (Stati Uniti, Regno Unito), portoghese (Brasile, Portogallo) e
  italiano. L’interfaccia parla le stesse quattro lingue.
- Festività di **207 Paesi** e delle loro regioni, dal 2016 al 2061. Aggiungi ponti,
  rinomina o rimuovi festività.
- Compleanni e date importanti, fasi lunari, ed equinozi e solstizi calcolati per il tuo
  fuso orario e il tuo emisfero.
- Numerazione ISO delle settimane, settimane che iniziano di lunedì, di domenica o di
  sabato, da 1 a 24 mesi, a partire da qualsiasi mese.

### Pensata per la carta

- 5 temi (Heritage, Chiara, Classica, Minimale, Quaderno) e 4 modelli.
- Cambia caratteri, dimensioni, spessore e interlinea delle righe; scegli righe, puntini o
  quadretti; regola l’ombreggiatura del fine settimana e un livello di comodità per chi
  ha la vista stanca. Tutto si aggiorna in tempo reale.
- 5 famiglie di caratteri open source incluse, incorporate nel PDF come sottoinsiemi.
  Carica i tuoi caratteri TTF, OTF, WOFF o WOFF2: l’app controlla che contengano tutti i
  segni che servono alla tua lingua.

### Metodi basati sulle evidenze

- **30 metodi**: settimana Alastair, piani se-allora, WOOP, monitoraggio dei progressi, un
  registro delle abitudini che conta i giorni fatti invece delle serie, revisione
  settimanale, tre cose belle, diario del sonno, memoria esterna e altro ancora.
- Ogni metodo modifica le pagine su cui agisce ed è spiegato in una **guida stampata** con
  il suo livello di evidenza (solida, moderata, limitata, pratica senza studi diretti o
  discussa) e i suoi riferimenti. Vedi [il rapporto sulle evidenze](docs/evidencia-metodos.md)
  (in spagnolo).
- Aggiungi i tuoi metodi dall’interfaccia, senza programmare.

### Segnature che vengono bene

- **Segnature cucite** con il numero di fogli per segnatura che scegli (tutte uguali,
  equilibrate o un elenco su misura), una sola segnatura, taglia e impila per la
  rilegatura a spirale o a dischi, oppure una pagina per foglio.
- A4 → A5, Legal → 177,8 × 215,9 mm (il formato più grande stampabile dalla HP LaserJet
  4350), Lettera, Folio, Oficio 340, A3, A5 o personalizzato.
- Fronte-retro capovolgendo sul lato corto o lungo, oppure fronte-retro manuale;
  correzione del retro; compensazione dello scorrimento (creep); segni di piega, di taglio
  e di collazione; numero di segnatura.
- Foglio di calibrazione, dima di foratura per le stazioni di cucitura e una copertina con
  la larghezza del dorso calcolata in base al numero di fogli.

### Fatta per durare

- Le agende vengono salvate nel browser ed esportate come file `.agenda.json` che puoi
  conservare, versionare e riaprire anni dopo. *Duplica per il 2028* porta il tuo progetto
  all’anno successivo.
- Lo stesso motore funziona nel browser, in un processo in background e da riga di
  comando.

## Schermate

| | |
| --- | --- |
| ![Il foglio stampato come esce dalla stampante](docs/images/printed-sheet.png) | ![Caratteri, dimensioni e righe aggiornano le pagine in tempo reale](docs/images/style-panel.png) |
| Il foglio stampato, con i segni di piega e di segnatura, accanto alle impostazioni di stampa. | Stile: caratteri, dimensioni, righe e comodità aggiornano le pagine in tempo reale. |
| ![I metodi e la guida stampata](docs/images/methods-panel.png) | ![Il libro intero e le festività del Paese](docs/images/book-view.png) |
| I metodi e la guida che li spiega, con evidenze e riferimenti. | Il libro intero e le festività del Paese scelto. |

Le schermate mostrano l’interfaccia in inglese; per cambiare lingua usa il selettore in
alto a destra.

<p align="center"><img src="docs/images/phone.png" alt="L’editor su un telefono Android" width="280"></p>

Pagine reali del PDF: frontespizio (spagnolo), guida (inglese), copertina del mese
(portoghese), registro delle abitudini (italiano) e password (spagnolo).

![Pagine del PDF in quattro lingue](docs/images/pages-languages.png)

Una doppia pagina settimanale dell’agenda 2027: i giorni a sinistra, la griglia delle
attività Alastair a destra.

![Una doppia pagina settimanale](docs/images/spread-norma.png)

## Come funziona

```mermaid
flowchart LR
  D["File di progetto<br/>.agenda.json"] --> C["Calendario<br/>settimane · festività · luna"]
  D --> M["Metodi"]
  C --> S["Sezioni"]
  M --> S
  S --> P["Piano delle pagine<br/>lati · riempimenti · le tue pagine"]
  P --> L["Impaginazione in millimetri<br/>testo in glifi con fontkit"]
  L --> V["Anteprima SVG"]
  L --> I["Imposizione<br/>segnature · fronte-retro · creep · segni"]
  I --> F["PDF<br/>pdfkit + caratteri incorporati"]
```

1. **Un’agenda è un file di progetto, non codice.** È un JSON, convalidato all’apertura,
   con l’anno, la lingua, il Paese, le sezioni e le loro opzioni, il tema, la persona, le
   filigrane, le tue pagine e immagini e le tue modifiche. Le modifiche vengono salvate
   come spostamenti legati a nomi stabili come `week:2027-W12:left`, così sopravvivono a
   un cambio di anno o di carta.
2. **Il calendario** costruisce i mesi e le settimane ISO con festività, date personali e
   fasi lunari.
3. **Le sezioni** (frontespizio, doppia pagina settimanale, registro delle abitudini,
   password…) pianificano le loro pagine e le impaginano in millimetri con funzioni di
   impaginazione. Le pagine si misurano, non si dichiarano: l’agenda aggiunge pagine di
   riempimento perché le doppie pagine restino affiancate, le copertine del mese cadano su
   una pagina di destra e ogni segnatura sia completa.
4. **Il testo** viene convertito in glifi una sola volta con fontkit. L’anteprima disegna
   quei glifi e il PDF scrive gli stessi glifi con il carattere incorporato, così lo
   schermo corrisponde alla carta.
5. **L’imposizione** dispone le pagine sui fogli. In una segnatura di *n* fogli, il foglio
   *i* contiene le pagine 4n−2i e 2i+1 sul fronte e 2i+2 e 4n−2i−1 sul retro.
6. **Il PDF** viene scritto da pdfkit in un processo in background, così l’editor non si
   blocca mai. Le pagine PDF importate vengono incorporate come vettori con pdf-lib.

## Come usarla

Ti serve [Node.js](https://nodejs.org/) 22.12 o più recente.

```bash
git clone https://github.com/jonidimo/agenda-heritage-generator.git
```

```bash
cd agenda-heritage-generator && npm ci
```

```bash
npm run dev
```

Apri <http://localhost:5173>. Al primo avvio vengono generati i dati delle festività: ci
vuole circa un minuto.

**Installarla come app.** In Chrome, Edge o Chromium, su un computer o su un telefono
Android, scegli *Installa* o *Aggiungi a schermata Home*. Da quel momento funziona anche
offline.

**Pubblicare la tua copia.** `npm run build` genera un sito statico in `dist/`. Il
progetto include un workflow di GitHub Pages che lo pubblica: attivalo in
*Settings → Pages → Source: GitHub Actions*.

**Riga di comando.** Ogni esportazione è disponibile anche da terminale:

```bash
npm run agenda -- new --template heritage --year 2028 --locale it-IT --country IT --out designs/mia-2028.agenda.json
```

```bash
npm run agenda -- info designs/mia-2028.agenda.json
```

```bash
npm run pdf -- designs/mia-2028.agenda.json --mode imposed --out output/mia-2028-stampa.pdf
```

## Stampa e rilegatura

Stampa una volta il foglio di calibrazione e poi il PDF fronte-retro; piega, fora, cuci e
aggiungi la copertina. La [guida alla stampa e alla rilegatura](docs/printing.md), in
inglese, spiega ogni passaggio, con le impostazioni per Linux (CUPS), Windows e Android.
C’è anche una [versione in spagnolo](docs/impresion.md).

## Struttura del progetto

| Cartella | Contenuto |
| --- | --- |
| `src/core` | Il motore, senza dipendenze dal browser: calendario, festività, testo, impaginazione, sezioni, imposizione, renderer SVG e PDF. |
| `src/app` | L’editor (React). |
| `src/workers` | La generazione del PDF in un processo in background. |
| `src/cli` | La riga di comando. |
| `designs` | Agende di esempio per il 2027 in spagnolo, inglese, portoghese e italiano. |
| `tests`, `e2e` | Test unitari (Vitest) e test nel browser (Playwright). |
| `docs` | Le guide e il rapporto sulle evidenze. |
| `legacy` | La versione 2026 in Python e i suoi PDF, conservati come riferimento per il design. |

## Sviluppo

```bash
npm test
```

```bash
npm run test:e2e
```

```bash
npm run typecheck && npm run lint
```

I test impaginano ogni modello in varie lingue, formati di carta e livelli di comodità e
falliscono se un testo non entra, si sovrappone a un altro o esce dall’area stampabile.
Per aggiungere un metodo o una sezione, leggi [Adding methods and sections](docs/adding-methods.md).

## Crediti

- Caratteri con licenza SIL Open Font License: Cormorant Garamond, Manrope, Atkinson
  Hyperlegible Next, EB Garamond e Caveat (licenze in `public/fonts`).
- Dati delle festività da [date-holidays](https://github.com/commenthol/date-holidays) di
  commenthol, basati su Wikipedia, con licenza
  [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/). Per i ponti, controlla
  il calendario ufficiale del tuo Paese.
- [Astronomy Engine](https://github.com/cosinekitty/astronomy) (MIT) per le fasi lunari e
  le stagioni.
- [PDFKit](https://pdfkit.org/) e [fontkit](https://github.com/foliojs/fontkit) (MIT),
  [pdf-lib](https://github.com/cantoo-scribe/pdf-lib) (MIT), [PDF.js](https://mozilla.github.io/pdf.js/)
  (Apache 2.0), React, Vite, Tailwind CSS, Zustand, Immer, Zod e Lucide.
