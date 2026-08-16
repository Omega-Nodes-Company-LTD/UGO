# ADR-063 — La finestra sul mondo: la ricerca web, su gesto esplicito

**Stato**: Accettata · **Data**: 2026-08-16 · **Ambito**: `apps/soul`, `ops/docker`, env

## Contesto

UGO non sa nulla di ciò che è successo dopo l'addestramento dei suoi modelli
(backlog gruppo 3). Il proprietario ha deciso strada e postura (2026-08-16):
SearXNG self-hosted, sintesi coi modelli locali, e sulla privacy — le query
escono verso i motori che SearXNG aggrega, ma non sono riconducibili a CHI in
casa le ha fatte, e questo basta. Da dichiarare, non da «sistemare».

## Decisione

1. **La finestra si apre solo se gliela chiedi.** Il prefisso «cerca: …» è un
   gesto esplicito nella chat di casa, risposto PRIMA del provider — la stessa
   famiglia del promemoria (ADR-028) e di «apri un ticket:» (ADR-055). UGO
   **non naviga da solo**: dare la ricerca alla ruminazione o all'iniziativa è
   un'altra decisione, e non è stata presa.
2. **SearXNG in casa**: un container nel compose, rete interna, nessuna porta
   sull'host (regola 4), nessuna chiave. `SEARXNG_URL` assente = il prefisso
   non esiste e niente esce verso i motori.
3. **La sintesi è locale**: due frasi dal modello Ollama quando è su; col
   modello giù, il ripiego deterministico elenca i titoli — onesto e gratuito.
   Il provider non vede passare niente: `budget_ledger` resta intonso.
4. **La privacy, scritta**: la query esce di casa verso i motori aggregati.
   Non porta né la casa né la persona — SearXNG non manda cookie né profili, e
   una domanda non è attribuibile a chi in famiglia l'ha posta. È la postura
   che il proprietario ha scelto, e sta qui e in `/documentation`.
5. **Mai in reception**: la finestra è della casa. Un cliente che potesse far
   navigare UGO userebbe il nostro metamotore come proxy, che è esattamente il
   genere di regalo che ADR-055 esiste per non fare.

## Conseguenze

- zero costi per query e zero token del provider, per costruzione;
- la risposta entra in biografia cifrata come ogni scambio;
- quando (se) il tool calling arriverà, la finestra è già un tool con un
  contratto chiaro — ma il trigger esplicito resta il default.
