import { escapeHtml, sitePage } from "./layout.js";

/**
 * Informativa e termini (ADR-124 §8). Il testo descrive quello che il codice
 * fa davvero — se cambia il trattamento, cambia questa pagina e la versione
 * (`UGO_TERMS_VERSION`), e chi si iscrive dopo accetta quella nuova.
 *
 * Il titolare e il contatto vengono dalla configurazione: non li scrive il
 * codice, perché un nome legale sbagliato in un'informativa è peggio di
 * nessun nome. Il testo va comunque riletto da chi firma come titolare.
 */

export interface LegalInfo {
  /** ragione sociale del titolare (`UGO_LEGAL_NAME`) */
  name?: string | undefined;
  /** dove scrivere per i diritti (`UGO_CONTACT_EMAIL`) */
  contact?: string | undefined;
  termsVersion: string;
}

const who = (legal: LegalInfo): string =>
  legal.name === undefined ? "il gestore di questo servizio" : escapeHtml(legal.name);

const reach = (legal: LegalInfo): string =>
  legal.contact === undefined
    ? "dal pannello della tua casa"
    : `scrivendo a <a href="mailto:${escapeHtml(legal.contact)}">${escapeHtml(legal.contact)}</a>`;

export function privacyPage(legal: LegalInfo): string {
  return sitePage({
    title: "Informativa privacy",
    description: "Quali dati tratta UGO, perché, per quanto tempo e con chi.",
    path: "/privacy",
    body: `<h1>Informativa privacy</h1>
<p class="muted">Versione ${escapeHtml(legal.termsVersion)}. Titolare del trattamento: ${who(legal)}.</p>

<h2>Cosa trattiamo</h2>
<ul>
  <li><b>La tua email</b>, per farti entrare. La conserviamo cifrata con la chiave della tua casa; per
    ritrovarla usiamo un'impronta (HMAC) che non si può invertire.</li>
  <li><b>Quello che vive in casa</b>: messaggi, ricordi, diario, trascrizioni. Sono cifrati a riposo
    (AES-256-GCM) con una chiave che appartiene alla tua casa.</li>
  <li><b>Volti e voci</b>, solo se attivi il riconoscimento: impronte numeriche cifrate, mai le immagini.
    I minori e chi ha chiesto di non essere visto o ascoltato sono esclusi prima di ogni elaborazione.</li>
  <li><b>Due cookie tecnici</b>: la sessione del browser e l'abbinamento del muso. Niente cookie di
    profilazione, niente statistiche di terze parti.</li>
</ul>

<h2>Perché e su che base</h2>
<p>Per darti il servizio che chiedi (contratto); per il riconoscimento di volti e voci, sul tuo consenso
  esplicito, revocabile in ogni momento dal pannello. Teniamo un registro degli accessi senza dati personali
  per la sicurezza del servizio (legittimo interesse).</p>

<h2>Con chi</h2>
<ul>
  <li><b>Il fornitore di intelligenza artificiale che scegli tu</b> (Anthropic, OpenRouter, OpenAI,
    ElevenLabs) riceve il testo della conversazione e, se attivi la voce sintetica, l'audio. Con la tua
    chiave il rapporto è fra te e lui; con le chiavi UGO a consumo lo gestiamo noi. Alcuni di questi
    fornitori sono negli Stati Uniti: il trasferimento avviene con le garanzie previste dal GDPR
    (decisione di adeguatezza o clausole contrattuali standard).</li>
  <li><b>Resend</b>, per spedire i link d'accesso.</li>
  <li>I <b>server</b> di UGO stanno nell'Unione Europea.</li>
</ul>

<h2>Per quanto</h2>
<p>Finché la casa esiste. I link d'accesso valgono quindici minuti, le sessioni trenta giorni dall'ultima
  visita. Quando chiudi l'account distruggiamo la chiave della casa: tutto ciò che era cifrato diventa
  illeggibile, e l'email viene cancellata.</p>

<h2>I tuoi diritti</h2>
<p>Puoi vedere ed esportare i tuoi dati, correggerli, far dimenticare una persona alla casa, chiudere
  l'account, opporti o revocare il consenso: dal pannello, oppure ${reach(legal)}. Puoi anche rivolgerti
  al Garante per la protezione dei dati personali.</p>`,
  });
}

export function termsPage(legal: LegalInfo): string {
  return sitePage({
    title: "Termini",
    description: "Le regole del servizio UGO.",
    path: "/termini",
    body: `<h1>Termini del servizio</h1>
<p class="muted">Versione ${escapeHtml(legal.termsVersion)}. Il servizio è fornito da ${who(legal)}.</p>

<h2>Cos'è UGO</h2>
<p>Una creatura artificiale che vive in casa: un gosino. Ha un carattere ereditato e cambia vivendo.
  Carattere e aspetto non si regolano: se non ti somiglia, la risposta è un'altra adozione.</p>

<h2>L'account</h2>
<p>Per aprire una casa devi essere maggiorenne. Sei responsabile di chi usa i tuoi accessi e dei
  dispositivi che abbini. Puoi chiudere la casa quando vuoi dal pannello.</p>

<h2>Le chiavi e i costi</h2>
<p>Se porti una tua chiave di un fornitore di intelligenza artificiale, i consumi li paghi a lui, alle sue
  condizioni; il tetto di spesa giornaliero che imposti nel pannello è una protezione, non una garanzia del
  fornitore. Se usi le chiavi UGO, i consumi si scalano dal credito prepagato della tua casa.</p>

<h2>Cosa non è</h2>
<p>UGO non è un servizio medico, di emergenza o di sorveglianza. Non affidargli decisioni su salute,
  sicurezza o persone.</p>

<h2>Legge applicabile</h2>
<p>Legge italiana. Restano salvi i diritti che la legge del tuo paese ti riconosce come consumatore.
  Per domande: ${reach(legal)}.</p>`,
  });
}
