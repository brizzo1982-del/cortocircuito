# Cortocircuito – correnti di guasto ai nodi (CEI EN 60909)

Web app statica (HTML + JavaScript puro, nessuna dipendenza, nessun server) per calcolare le **correnti di cortocircuito a tutti i nodi**
di uno schema unifilare disegnato a video e il **contributo dell'impianto verso la rete del distributore**.
Esporta **Excel**, **PDF** e **relazione tecnica** (PDF e Word).

**Password iniziale:** vedi il commento in `js/config.js` (stessa del progetto `armoniche-bt`). **Cambiala subito** (vedi sotto).

## Come si usa
1. **Schema** – scegli un elemento dalla palette e clicca nello schema per inserirlo. Collega i terminali trascinando dal pallino di un
   elemento fino a un altro terminale o sulla barratura (da una barra: `Alt+Maiusc` e trascina). `R` ruota, `Canc` elimina,
   `Ctrl+C/V/Z/Y` copia, incolla, annulla, ripeti. Rotella = zoom, `Spazio`+trascina (o tasto destro) = sposta la vista.
   Elementi: **Rete** (AT/MT/BT, Un, Pcc max/min, R/X), **Barratura** (orizzontale/verticale), **Trasformatore** (Sn, V1, V2, Vcc%, Pcu),
   **Generatore** (sincrono, asincrono/motore, statico/inverter: Pn, An, x''d o Ia/In o Icc prodotta), **Cavo** (rame/alluminio, sezione,
   lunghezza, paralleli), **Interruttore** (chiuso/aperto).
2. **Impostazioni** – dati del progetto e parametri: con o senza fattore **c**, cmax BT, tmin, durata guasto, temperatura cavi per la Icc minima.
3. **Verifica e calcolo** – controlla l'integrità dello schema (terminali scollegati, tensioni incoerenti, sezioni senza sorgenti…).
   **Approva schema e calcola** blocca lo schema e calcola tutti i nodi (massima e minima). “Modifica schema” lo sblocca.
4. **Risultati** – tabella per nodo, dettaglio dei contributi delle singole sorgenti, contributo verso la rete del distributore,
   valori sullo schema, esportazioni.

Capienza: provato con una rete di 582 elementi / 277 nodi (pulsante “Rete di prova” in *Impostazioni*): il calcolo richiede circa 0,1 s.

## Cosa calcola
Per ogni nodo (barra o giunzione), con corrente **massima** (c max, R a 20 °C, motori inclusi) e **minima** (c min, R a 80 °C, motori esclusi):
`I''k` trifase, `ip`, `Ib`, `Ith`, `I''k2` bifase, R/X e Zk, più il contributo di ogni sorgente.
Il contributo verso il distributore è la corrente dei generatori/motori/inverter nel guasto sul nodo di consegna (esclusa la rete).

Metodo: sorgente di tensione equivalente al punto di guasto, matrice delle impedenze di nodo in p.u. (Sbase 100 MVA, Vbase = Un del nodo).
Con *fattore c* attivo: KT per i trasformatori, KG per i generatori sincroni, `ZQ = c·Un²/Sk''`. Senza c: tensione prefault = Un, KT = KG = 1.

## Provarla in locale
```bash
python -m http.server 8124
```
poi apri http://localhost:8124. La pagina `test.html` esegue i test del motore di calcolo contro il calcolo manuale.

## Pubblicarla su GitHub Pages
```bash
git init
git add .
git commit -m "Prima versione"
git branch -M main
git remote add origin https://github.com/<tuo-utente>/cortocircuito.git
git push -u origin main
```
Poi **Settings → Pages → Deploy from a branch → main / (root)**. Indirizzo: `https://<tuo-utente>.github.io/cortocircuito/`.
In alternativa carica i file dal sito (Add file → Upload files).

## Cambiare la password
Apri `imposta-password.html` in locale, scegli la nuova password (min. 12 caratteri), incolla il blocco generato in `js/config.js` e ricarica su GitHub.

## Limite importante del “login”
GitHub Pages serve file statici: la password è verificata **nel browser** (PBKDF2-SHA256). Tiene fuori i curiosi, ma chi apre il repository pubblico
può leggere il codice. Per riservatezza reale usa un repository privato con distribuzione locale, oppure un servizio con autenticazione lato server.
I dati dei progetti restano **nel tuo browser** (localStorage) e nei file `.cc.json` che salvi: non vengono inviati ad alcun server.

## Struttura
| File | Contenuto |
|---|---|
| `index.html`, `css/style.css` | Pagina, login |
| `js/model.js` | Tipi di elemento, campi, geometria dei terminali |
| `js/calc.js` | Motore di calcolo (indipendente dal DOM) |
| `js/editor.js` | Editor grafico SVG |
| `js/app.js` | Interfaccia, verifica/approvazione, risultati, esempi |
| `js/report.js` | Contenuti di Excel, PDF e relazione |
| `js/xlsx.js`, `js/pdf.js`, `js/docx.js`, `js/zip.js` | Generatori di file senza librerie esterne |
| `js/auth.js`, `js/config.js` | Accesso con password |
| `test.html` | Test del motore di calcolo |

## Ipotesi e limiti (da leggere)
- Calcolati **guasti trifase e bifase** (sequenza diretta). Il **guasto monofase a terra** richiede i dati di sequenza zero (gruppi vettoriali, neutri) e non è incluso.
- La corrente stazionaria `Ik` non è calcolata. `Ib` usa i fattori μ e q della norma; `Ith` usa n = 1 (guasto lontano dai generatori).
- Inverter/FV: sorgente di corrente `Icc = k·In` (o valore assegnato), sommata aritmeticamente (cautelativo) e ripartita con le impedenze di trasferimento.
- Rapporti dei trasformatori nominali (nessun variatore); nessun fattore KS per le unità di produzione (generatore + trasformatore dedicato).
- Reattanza dei cavi se non assegnata: 0,08 Ω/km in BT e 0,12 Ω/km in MT; ρ20 = 1/56 (Cu), 1/35 (Al) Ω·mm²/m, coefficiente 0,004/°C.
- Lo strumento è di supporto e non sostituisce la verifica del progettista abilitato né i dati ufficiali del distributore e dei costruttori. Verificare i risultati su casi noti prima dell'uso professionale.
