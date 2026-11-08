<div align="center">

# Heritage Studio

**Progetta, visualizza e stampa agende artigianali: qualsiasi anno, lingua e Paese,
in segnature piegate e cucite a mano.**

[![English](https://img.shields.io/badge/-English-8a9a7b?style=for-the-badge)](README.md)
[![Español](https://img.shields.io/badge/-Espa%C3%B1ol-8a9a7b?style=for-the-badge)](README.es.md)
[![Português](https://img.shields.io/badge/-Portugu%C3%AAs-8a9a7b?style=for-the-badge)](README.pt.md)
[![Italiano](https://img.shields.io/badge/-Italiano-2f5d3a?style=for-the-badge)](README.it.md)
[![Deutsch](https://img.shields.io/badge/-Deutsch-8a9a7b?style=for-the-badge)](README.de.md)
[![Français](https://img.shields.io/badge/-Fran%C3%A7ais-8a9a7b?style=for-the-badge)](README.fr.md)

<img src="docs/images/tapa.jpg" alt="L’agenda Heritage 2026, stampata al laser e cucita a mano" width="560">

</div>

**Provala online:** [jonidimo.github.io/agenda-heritage-generator](https://jonidimo.github.io/agenda-heritage-generator/) (sempre l’ultima versione, senza installare nulla).

Heritage Studio è nato come un’unica agenda artigianale per il 2026. Oggi è un’app che
costruisce il libro completo per qualsiasi anno: calendario, festività, registri delle
abitudini e pagine di pianificazione basate sulle scienze comportamentali. Dispone le
pagine su fogli pronti per una stampante fronte-retro, così puoi piegarli, cucirli e
rilegarli.

Funziona interamente nel browser, anche offline, su Linux, Windows, macOS e Android, e
come app desktop per Windows, macOS e Linux. Non viene caricato nulla da nessuna parte.

![Modifica di una doppia pagina settimanale](docs/images/editor-spread.png)

## Scarica

**[Scarica l’ultima versione](https://github.com/jonidimo/agenda-heritage-generator/releases/latest)** e scegli il file per il tuo sistema in *Assets*:

| Sistema | File |
| --- | --- |
| Windows 10 e 11 | `…-win-x64-setup.exe` (installer) o `…-win-x64-portable.exe` (senza installazione) |
| macOS 13 o successivo | `…-mac-arm64.dmg` (Apple silicon) o `…-mac-x64.dmg` (Intel) |
| Linux | `…-linux-x86_64.AppImage` (qualsiasi distribuzione) o `…-linux-amd64.deb` (Debian, Ubuntu, Mint) |

Gli installer non sono firmati con un certificato a pagamento, quindi Windows e macOS
mostrano un avviso la prima volta che li apri. La [guida all’app desktop](docs/desktop.md)
(in inglese) spiega come aprirli, dove vengono salvate le tue agende e come compilare l’app.
Per usarla nel browser, vedi [Come usarla](#come-usarla).

## Cosa fa

### Vedi tutto esattamente come verrà stampato

- Quattro viste, aggiornate mentre modifichi: **pagina**, **doppia pagina**,
  **foglio stampato** (come esce dalla stampante, fronte e retro) e il **libro intero**.
- L’anteprima disegna gli stessi contorni delle lettere che finiscono nel PDF, quindi non
  dipende dai caratteri installati sul tuo computer.
- La **verifica preliminare** trova testi che non entrano, testi sovrapposti, ciò che esce
  dalla pagina o finisce nel margine che la stampante non stampa, segni mancanti in un
  carattere e immagini con poca risoluzione.
- **Modalità Progetto e Stampa**: *Progetto* serve per la pagina, il doppio e l’intero libro; *Stampa* aggiunge il foglio stampato e il pannello di stampa, e disegna su ogni pagina l’area che la stampante non stampa e il margine di cucitura.
- **Destinazione**: un’agenda fatta per essere **letta a schermo** rinuncia a margine di cucitura, rifili, segni e pagine di riempimento dei fascicoli; le pagine mantengono la dimensione e si esporta pagina per pagina, con collegamenti. Puoi tornare a *Stampare e rilegare* quando vuoi.

### Modifica con il mouse

- Trascina, sposta a piccoli passi, ridimensiona, ruota, attenua o nascondi qualsiasi
  elemento. Applica la modifica a tutte le pagine di quel tipo, riflessa nelle pagine di
  sinistra, o a una sola pagina. Calamita, guide dei margini, annulla e ripeti.
- **Filigrane per persona**: il colibrì, un’icona o un tuo SVG o PNG, ancorati al bordo
  esterno o interno, con dimensioni e opacità; su tutte le pagine o solo su quelle di destra o
  di sinistra, fuse con la carta (*Moltiplica* fa sparire lo sfondo bianco di un logo), in
  grigio o colorate, e con la posizione e l’immagine specchiate separatamente sulle pagine di sinistra.
- **Pagine personalizzate dove vuoi**: un’immagine, un SVG vettoriale o una pagina di un
  PDF (che resta vettoriale nel PDF finale), oppure una pagina a righe, a puntini o a
  quadretti. Il resto del libro si riorganizza da solo.
- Aggiungi testi, immagini, righe e cornici a qualsiasi tipo di pagina.
- Ridimensiona i tuoi elementi da qualsiasi bordo o angolo; con Maiusc mantengono le
  proporzioni.
- **Anche gli elementi propri dell’agenda** (il nome di un mese, una cornice, una tabella,
  un’area di scrittura) si ridimensionano da qualsiasi bordo o angolo: il contenuto viene
  riorganizzato nel nuovo riquadro invece di essere stirato, e il pannello ha i campi di
  larghezza e altezza.
- **Doppio clic su qualsiasi testo** per modificarlo lì dov’è: i tuoi e quelli dell’agenda
  (nome e titolo della copertina, dedica, la frase di ogni mese, titoli delle pagine).
  Invio o Ctrl+Invio conferma, Esc annulla, e la pagina si ridisegna mentre scrivi. Un
  testo proprio può seguire le sue righe (altezza automatica).
- **Stile per elemento**: linee tratteggiate, punteggiate o doppie, colore e spessore di
  ogni tipo di linea, riempimento e colore del testo, per un elemento in tutte le pagine
  del suo tipo o in una sola.
- **Copia, taglia, incolla e duplica** i tuoi elementi (Ctrl+C, X, V e D) in una pagina o
  tra pagine.
- Trascinare un cursore o un selettore di colore è fluido: la pagina segue in diretta, le
  miniature aspettano e tutto il trascinamento è un solo passo di annullamento.
- Un elemento immagine accetta qualsiasi immagine: scegline una dall’agenda o carica un PNG,
  JPG o SVG.
- Ogni testo può avere il suo carattere e il suo colore, oppure seguire quelli del suo tipo
  di testo.
- **Zoom** della pagina con Ctrl e + / − / 0, o con Ctrl e la rotellina del mouse (o un
  pizzico sul touchpad): il punto sotto il cursore resta fermo. **Impostazioni →
  Dimensione dell’interfaccia** (un cursore con il suo numero) ingrandisce o riduce tutta l'interfaccia, e i pannelli laterali
  e la striscia di miniature si ridimensionano trascinandone i bordi; l'app ricorda entrambe le cose.
- **Clic destro** (o pressione prolungata sul telefono) su qualsiasi elemento, pagina o
  miniatura: cambiare l’immagine della filigrana, nascondere qualcosa in una pagina o in
  tutte quelle di quel tipo, selezionare elementi simili, aggiungere testi o immagini dove
  hai cliccato.
- **Più elementi insieme** con Ctrl o Maiusc, o trascinando un riquadro da un punto vuoto:
  spostarli insieme, allinearli, distribuirli con spazi uguali o ordinarli in una griglia
  che ne trova righe e colonne.
- **Righe, puntini o quadretti per tipo di pagina o per pagina**: interlinea, passo
  orizzontale e verticale dei puntini, dimensione del puntino e spessore.
- **Scala e deforma**: ogni elemento ha otto maniglie che riorganizzano il contenuto nel nuovo riquadro; la scala è un controllo a parte, e **Consenti deformazione** allunga invece il disegno in qualsiasi direzione.
- **Copia gli elementi del programma** (Ctrl+C sul nome di un mese, una cornice, una tabella…) e incolla un elemento tuo modificabile: il testo resta testo modificabile; il resto diventa un disegno che mantiene lo spessore delle linee.
- **Altri dieci tipi di elemento**: tabella, lista di cose da fare, monitoraggio abitudini, righe di finanze, mini calendario (i giorni portano alla loro pagina), quadranti, note, orario del giorno, valutazione e **codice QR** (qualsiasi indirizzo web, email, telefono o testo; toccabile nel PDF), ciascuno con i suoi campi.
- **Icone e forme**: una libreria di 96 icone (Lucide), che si cercano in qualsiasi lingua e si colorano di qualsiasi colore, e quindici forme: rettangolo, ellisse, linea con frecce o punti, freccia, triangolo, rombo, poligono (da 3 a 24 lati), stella (da 3 a 24 punte), cuore, anello, arco o settore, fumetto, nastro, croce e tracciato libero SVG. Il tratto resta dentro il riquadro e ogni forma mostra solo le sue impostazioni.
- **Un’immagine su ogni copertina del mese** al posto dell’adesivo, per un mese o per tutti.
- **Livelli**: un pannello elenca gli elementi della pagina dall’alto in basso; sposta su, giù, sullo sfondo, rinomina, nascondi e fondi con ciò che sta sotto (moltiplica, scherma, scurisci, schiarisci). Ctrl+↑ e Ctrl+↓ spostano l’elemento scelto.
- **Menu dei livelli e blocco**: clic destro su una riga di Livelli per duplicare, bloccare o sbloccare, rinominare, portare in primo piano, mandare sullo sfondo o eliminare. Un elemento bloccato si seleziona ma non si trascina, non si ridimensiona, non si sposta con le frecce e non si elimina (Ctrl+Shift+Alt+L). Sotto l’elenco, opacità, fusione e blocco dell’elemento scelto.
- **Forme**: riempimento come campione di colore con un pulsante *Nessun riempimento*, opacità dal 5 al 100 %, e ogni elemento personale ruota da 0 a 360°.
- **Risorse / Vettori**: qualsiasi immagine, SVG o icona si posiziona sulla pagina con un clic, o diventa un **pennello timbro e tratto**: un clic lascia una copia; trascinando si lasciano copie lungo il tratto (dimensione, spaziatura, dritto / segue il tratto / casuale, variazione, colore). Ogni tratto è un elemento e un passo di Annulla.
- **Schermo intero (F11)**: solo la pagina, senza i pannelli laterali, la striscia delle miniature né il piè di pagina; F11 o Esc li riportano com’erano.
- **Trascinare per scorrere**: con il tasto centrale del mouse, o tenendo premuta la barra spaziatrice con il tasto principale, l’area di lavoro segue il puntatore, senza cercare le barre di scorrimento.
- **Menu in ordine**: File (l’agenda e i suoi file, con *Le mie agende*), Modifica, Vista, Impostazioni (lingua dell’interfaccia, ognuna nella sua lingua; dimensione dell’interfaccia; preferenze; assistente IA) e Aiuto (scorciatoie, guida per i modelli di IA, segnalare un problema, Informazioni). *Nuova agenda* entra in qualsiasi finestra: due colonne, e *Crea agenda* sempre in vista.
- **Ciò che nascondi non si perde**: Modifica → *Mostra elementi nascosti* li elenca e li riporta uno per uno. **Ingrandisci sulla selezione** con Ctrl+Maiusc+2; il piè di pagina conta gli avvisi della pagina corrente e le miniature mostrano un punto.
- **Scorciatoie da tastiera** per tutto, elencate nell’app (F1) e accanto a ogni voce di menu.

### Sezioni e modelli di pagina

- **Partire da zero**: il modello *Vuota* non ha nessuna pagina e mostra cosa fare per
  primo; il modello *Quaderno* è un frontespizio e tutte le pagine a puntini, a righe, a
  quadretti o bianche che vuoi, senza calendario. Aggiungi qualsiasi sezione (anche più
  sezioni di note), aggiungi pagine a ogni mese o togli una sezione dal suo menu.

- Clicca una sezione nel pannello **Sezioni** per andare alla sua pagina. Con il clic
  destro la sposti, la disattivi o cambi ogni quanto si ripete.
- Qualsiasi sezione può comparire una volta o **ripetersi ogni mese, settimana o giorno**.
- **Modelli di pagina**: disegni una pagina una volta (sfondo a righe, puntini o quadretti,
  testi, immagini, cornici) e la ripeti dove vuoi. Testi come `{date}`, `{weekday}` o
  `{month}` cambiano in ogni copia.
- **Clic destro su un mese** nella barra delle pagine per andare alla copertina, al registro o alla prima settimana, ripetere una pagina in ogni mese, nascondere il mese, esportare solo quel mese in PDF o vedere solo quel mese nella barra. I mesi nascosti escono dal libro; il calendario annuale li mantiene, senza collegamenti. Un indicatore **Anno** salta alla vista annuale e la barra scorre con la rotellina.

### Trova qualsiasi cosa

- La **barra superiore** ha tre zone (file e cronologia, modalità e vista, ricerca e zoom) e
  nelle finestre strette raccoglie ciò che non entra in un menu «⋯».
- **Ricerca** (Ctrl+K, `/` o il campo di ricerca della barra): trova impostazioni, sezioni, pagine ed elementi
  anche con errori di battitura, senza accenti o con maiuscole diverse, e ti porta lì
  evidenziandoli.
- I pulsanti **Indietro e Avanti** nella barra superiore ripercorrono le pagine visitate,
  come nel browser.

### Qualsiasi anno, lingua e Paese

- Testi stampati in spagnolo, inglese, portoghese, italiano, tedesco e francese;
  l’interfaccia parla le stesse sei lingue e segue quella scelta quando si crea l’agenda.
- Il Paese fissa le convenzioni regionali (ordine delle date, valuta, giorno in cui
  inizia la settimana) con i dati Unicode CLDR del browser: l’inglese in Argentina si
  scrive giorno/mese. L’ordine delle date e l’inizio della settimana si possono anche
  scegliere a mano; le date sono sempre salvate in ISO 8601.
- Festività di **207 Paesi** e delle loro regioni, dal 2016 al 2061. Aggiungi ponti,
  rimuovi festività o dagli un altro nome con la matita di *Calendario → Festività* (per
  esempio, uno più breve per un nome che non entra nella sua casella).
- Compleanni e date importanti, fasi lunari, ed equinozi e solstizi calcolati per il tuo
  fuso orario e il tuo emisfero.
- Numerazione ISO delle settimane, settimane che iniziano di lunedì, di domenica o di
  sabato, da 1 a 24 mesi, a partire da qualsiasi mese.

### Pensata per la carta

- 6 temi (Heritage, Chiara, Classica, Minimale, Quaderno, Filigrana) e 4 modelli. Un
  tema definisce tutto insieme: il carattere e il colore di ogni tipo di testo e lo stile
  delle righe di scrittura, dei separatori, delle tabelle e delle cornici.
- **Linee e ghirigori**: linee continue, tratteggiate, punteggiate o doppie, ornamenti
  ripetuti lungo una linea o al suo centro, e angoli per le cornici. Ci sono dieci
  ornamenti inclusi e puoi importare i tuoi in SVG o PNG.
- **Una palette da un colore**: scegli un colore e un’armonia (monocromatica, analoga,
  complementare, complementare divisa o triadica). L’app ricava tutti i colori nello
  spazio colore OKLCH e mantiene il testo abbastanza scuro da leggersi bene sulla carta.
- **Temi personali**: salva tutto lo stile con un nome, usalo in altre agende e
  condividilo come file `.tema.json`, con i suoi ornamenti dentro.
- Cambia caratteri, dimensioni, spessore e interlinea delle righe; scegli righe, puntini o
  quadretti; regola l’ombreggiatura del fine settimana e un livello di comodità per chi
  ha la vista stanca. Tutto si aggiorna in tempo reale.
- 5 famiglie di caratteri open source incluse, incorporate nel PDF come sottoinsiemi.
  Carica i tuoi caratteri TTF, OTF, WOFF o WOFF2: l’app controlla che contengano tutti i
  segni che servono alla tua lingua. Se a uno manca un segno (un carattere da maglia senza
  virgola né parentesi), quel segno viene da un carattere di riserva, a schermo e nel PDF,
  come in un browser; Stile avvisa se manca la punteggiatura e a cosa si presta meglio.

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

### Da leggere su tablet o e-reader

- Il **PDF delle pagine** ha link toccabili, come un’agenda digitale: ogni giorno dei
  calendari, del registro del mese e della vista mensile porta alla sua settimana (o alla
  pagina del giorno), ogni mese al suo mese, i titoli salgono di un livello (settimana →
  mese → calendario annuale → indice) e l’indice porta alle sue pagine. In un lettore che
  segue i link del PDF, come un Onyx Boox o un tablet, basta un tocco.
- **Segnalibri del lettore**: l’indice laterale del lettore elenca le sezioni, ogni mese e
  le sue settimane.
- **Linguette di tutti i mesi** sul bordo di ogni pagina (facoltative): ognuna porta al suo
  mese.
- I link nascono da ciò che è stampato, quindi seguono ogni cambio di anno, carta o
  sezioni. Il pulsante dei link nella barra in alto li mostra sulla pagina e un clic li
  segue; il pannello di ogni elemento mostra dove porta e permette di togliergli i link o
  mandarlo a un’altra pagina o a un indirizzo web. Il PDF da stampare non li contiene.
- Ogni zona toccabile si può cambiare da sola: clicca un numero di giorno o il nome di un
  mese nella pagina, o usa il tasto destro, per mandare solo quella altrove o toglierla.

### I tuoi file e modelli

- **File → Salva** (Ctrl+S) scrive un file `.agenda.json` con immagini e caratteri al suo
  interno. In Chrome, Edge e nell’app per computer, le volte successive riscrive lo stesso
  file.
- **Salva come modello** conserva tutto il progetto per iniziare altre agende: un altro
  anno, un’altra persona o un’altra lingua. I modelli si possono esportare e condividere
  come file.
- **Backup di tutto** salva tutte le agende e i modelli, e i font caricati, in un solo file;
  aprendolo vengono ripristinati. Un font di un file che si apre non sostituisce quello che questo
  dispositivo ha già con lo stesso nome: resta quello di qui, con un avviso.
- Le agende restano anche nel browser, ma solo in quel browser e a quell’indirizzo
  dell’app: i file sono la copia sicura.
- I pannelli **Immagini** e **Caratteri** dicono dove si usa ogni immagine (filigrana, copertina, elementi, pagine, ornamenti) e la rimuovono insieme a tutto ciò che la usava; i caratteri mostrano quali caratteri mancano e dove si usa ogni famiglia, e i tuoi si possono rimuovere.
- **Immagini accanto al file**: un’agenda può indicare le sue immagini con un percorso
  (`"path": "immagini/logo.png"`) invece di contenerle; la riga di comando, il server MCP e
  l’app desktop (quando il sistema le apre il file, o con *File → Apri file…*) le leggono solo da
  quella cartella. Nell’app web, l’avviso offre **Cerca la cartella delle immagini…**: scegli la cartella
  e le immagini vengono incorporate nell’agenda (e il percorso viene eliminato). Come per ogni file che
  il sistema apre nell’app desktop, il primo *Salva* di una sessione chiede dove.
- **PDF leggeri**: *Stampa → Immagini nel PDF* (300 ppi per stampare, 150 per lo schermo, o originali)
  riduce solo le immagini che hanno più risoluzione di quella necessaria alla dimensione di stampa,
  senza perdita di qualità visibile, e un’immagine usata in ogni pagina (una filigrana) viene salvata
  una sola volta nel PDF. Il pannello *Immagini* mostra il peso di ciascuna e i suoi ppi alla
  dimensione in cui viene davvero stampata; oltre 600 ppi lo segnala (`overDpi`). Anche al caricamento:
  le foto WebP/HEIC/AVIF diventano JPEG (non PNG), ciò che supera 4000 px di lato viene ridotto e lo
  stesso file non viene salvato due volte.
- App desktop: dopo aver esportato un PDF mostra **dove è stato salvato**, con *Apri cartella*; le agende si aprono con doppio clic su un `.agenda.json` o trascinandole sulla finestra, e chiudere non perde mai l’ultima modifica.
- **Il formato del foglio fin dall’inizio**: la schermata della nuova agenda mostra la carta (o lo schermo del tablet), la rilegatura e il formato di ogni pagina. *File/Modifica → Formato del foglio…* lo cambia dopo e può portare i tuoi elementi alla nuova pagina in un solo passo di Annulla.

### Un assistente IA dentro l’app

- Un pulsante rotondo in basso a destra (**Ctrl+J**): chiedi una modifica con parole tue
  («ingrandisci le note di questa pagina», «un registro delle abitudini ogni mese»).
  L’assistente legge l’agenda, propone **una** modifica e la vedi sulla pagina prima di
  **Applicarla** o **Scartarla**; una modifica applicata è un solo passo di annulla. Alla
  chiusura non resta niente salvato.
- Funziona con **Anthropic (Claude), Google Gemini, OpenAI e servizi compatibili**
  (OpenRouter, Groq, Mistral) e **modelli locali** (Ollama, LM Studio), con la tua chiave.
  Se vuoi, può anche guardare le pagine (visione).
- La tua chiave non viene mai salvata in chiaro: nell’app desktop la cifra il sistema
  operativo (Portachiavi, DPAPI, libsecret) e le richieste passano dall’app; sul web resta in
  memoria, o cifrata nel browser se scegli di ricordarla. Le impostazioni sono in
  *Impostazioni → Assistente IA…* o nell’ingranaggio della pillola.
- **Versione 2.4.1**: l’assistente sta in un pulsante rotondo in basso a destra. Con un server locale l’elenco dei modelli si cerca da solo (un elenco da cui scegliere, non un campo che filtra), e un indirizzo senza `/v1` viene proposto corretto. Chiedere altro con una proposta in vista la **ritocca** (la proposta successiva si somma e Applica conferma tutto in un passo), e la scheda mostra ogni modifica con il valore prima e dopo.
- **Versione 2.5.0**: il modello ha 10 passi per richiesta e, prima dell’ultimo, gli si chiede di proporre con ciò che sa già; sa che cambiare la lingua dell’agenda traduce tutto in una sola operazione. L’indirizzo `http://0.0.0.0:8080` che mostra llama.cpp funziona così com’è. Se una parte del programma non si carica (perché è stato aggiornato con la finestra aperta), la scheda lo spiega e propone di ricaricare la finestra senza perdere il lavoro.

### Progetta con un modello di intelligenza artificiale

- Un **server MCP** permette a Claude, o a qualsiasi modello compatibile con MCP, di creare
  un’agenda, modificarla, controllarla, guardarne le pagine ed esportare il PDF o un tema. L’app desktop lo include: si avvia con `--mcp` ([come](docs/desktop.md#6-use-it-with-an-ai-model-from-outside-mcp), in inglese).
  Chiedigli "un’agenda per insegnanti da marzo a dicembre" o "un tema con ghirigori liberty".
- Il formato del file ha uno **schema JSON** e un catalogo generati dal codice, e
  `npm run agenda -- check` dice esattamente cosa verrebbe ignorato o corretto. Leggi la
  [guida](docs/llm-templates.md) (in inglese; [en español](docs/plantillas-llm.md)).
- Ogni modifica del modello torna con gli avvisi di impaginazione che ha prodotto (testi che
  non entrano, elementi fuori pagina o sovrapposti), così può correggerli senza che nessuno guardi.
- I modelli possono usare `icon:<nome>` per qualsiasi icona senza dichiararla, disegnare con
  le forme e lasciare le immagini accanto al file con un percorso. In tutti gli strumenti,
  `path` è sempre il file che si legge e `out` quello che si scrive.
- **Caratteri propri e guida per i modelli (2.5.0)**: i caratteri propri viaggiano dentro il file (`userFonts`) e il server li usa per disegnare; `add_font` ne incorpora uno e dice quale punteggiatura gli manca. `get_guide` dà la guida per sezioni ai client che non leggono le risorse, ci sono ricette (`nueva-agenda`, `revisar-avisos`, `traducir`), e ogni avviso di `check_design` dice come correggerlo.
- **Immagini e caratteri da internet (2.5.1)**: il server MCP cerca immagini (`search_images`, con miniature per scegliere; Openverse e Wikimedia Commons senza chiave; Pexels, Pixabay, Unsplash e DeviantArt con una) e le importa (`import_image`: le pulisce, le ritaglia a una pagina o all’intera copertina con abbondanza e dorso, le riduce a ~300 dpi, conserva autore, licenza e indirizzo, non importa due volte la stessa e non cambia nulla senza `confirm: true`); `build_credits_page` costruisce la pagina dei crediti; `search_fonts` e `import_font` portano caratteri da Google Fonts, controllando ñ, accenti, ¿ e ¡ e incorporando il carattere intero per poter modificare il testo liberamente. Visita solo i domini di queste API (mai indirizzi locali o privati), con tempo e dimensione massimi per download; le chiavi stanno in variabili d’ambiente (`PIXABAY_API_KEY`, `UNSPLASH_ACCESS_KEY`, `GOOGLE_FONTS_API_KEY`) e non vengono mai salvate nell’agenda.
- **Immagini proprie, link e rete locale (2.5.1)**: `import_image` accetta anche un file della cartella di lavoro (`image`, ad es. arte creata con IA) o un link diretto (`url`), e `browse_page` elenca le immagini e i link di una pagina web perché un modello scelga. Si aprono pagine e link solo di domini che **dichiari tu** in `AGENDA_TRUSTED_HOSTS` (possono essere della tua rete locale, via `http`); il resto resta chiuso. **Avviso di responsabilità:** dichiarare un dominio è una tua decisione: il programma non verifica cosa c’è né di chi sono le immagini (il diritto d’autore di ciò che importi e l’uso della tua rete sono tuoi) ed è fornito senza garanzie. Nulla viene aggiunto senza la tua approvazione (`confirm`).
- **Collegamento in tempo reale (app desktop)**: con l’app aperta, lo stesso server lavora sull’**agenda che hai aperta**. Il modello la legge, la modifica in un solo passo annullabile (rifiutato se l’hai modificata nel frattempo), ti mostra una pagina o apre un’altra agenda. Si disattiva in *Impostazioni → Consenti a un modello di IA di modificare l’agenda aperta*. Niente ascolta in rete: è un socket locale protetto da un token creato a ogni avvio.

### Fatta per durare

- *Duplica per il 2028* porta un progetto all’anno successivo, con pagine e regolazioni al
  loro posto.
- I file vengono convalidati all’apertura: colori, numeri e impostazioni del tema sono
  controllati, così un file danneggiato o manomesso non rompe l’app né esegue codice.
- Lo stesso motore funziona nel browser, in un processo in background e da riga di
  comando.

## Schermate

| | |
| --- | --- |
| ![Il foglio stampato come esce dalla stampante](docs/images/printed-sheet.png) | ![Caratteri, dimensioni e righe aggiornano le pagine in tempo reale](docs/images/style-panel.png) |
| Il foglio stampato, con i segni di piega e di segnatura, accanto alle impostazioni di stampa. | Stile: caratteri, dimensioni, righe e comodità aggiornano le pagine in tempo reale. |
| ![I metodi e la guida stampata](docs/images/methods-panel.png) | ![Il libro intero e le festività del Paese](docs/images/book-view.png) |
| I metodi e la guida che li spiega, con evidenze e riferimenti. | Il libro intero e le festività del Paese scelto. |

Le schermate mostrano l’interfaccia in inglese; per cambiare lingua usa il menu
**File**.

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

**App desktop.** Vedi [Scarica](#scarica). La [guida all’app desktop](docs/desktop.md) (in
inglese) spiega come installarla e come compilare gli installer.

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
npm run agenda -- check designs/mia-2028.agenda.json
```

```bash
npm run pdf -- designs/mia-2028.agenda.json --kind imposed --out output/mia-2028-stampa.pdf
```

`check` elenca cosa verrebbe ignorato o corretto in un file e gli avvisi dell’agenda
composta. `npm run -s agenda -- schema` e `npm run -s agenda -- catalog` mostrano il formato del
file e tutto ciò che può nominare. `npm run -s mcp` avvia il server MCP per i modelli di
intelligenza artificiale (vedi [la guida](docs/llm-templates.md)).

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
| `src/node` | Condiviso da riga di comando, server MCP e test: legge caratteri, festività e immagini dal disco e controlla i file delle agende. |
| `src/mcp` | Il server MCP per i modelli di intelligenza artificiale. |
| `electron` | L’app desktop (Electron). |
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

- Realizzato da **Jonatan Damián Dimotta Bré** ([Instagram](https://www.instagram.com/dimottajonatan/),
  [codice sorgente](https://github.com/jonidimo/agenda-heritage-generator),
  [online](https://jonidimo.github.io/agenda-heritage-generator/)). La guida di ogni agenda
  termina con questi crediti e un codice QR al codice sorgente; si possono disattivare in *Metodi*.
- Icone di [Lucide](https://lucide.dev) (licenza ISC).

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
