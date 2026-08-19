-- ADR-104: l'interruttore dell'iniziativa smette di vivere in RAM.
--
-- Era un campo di un oggetto per processo: si spegneva dal pannello, tornava
-- acceso al riavvio, e con due case ne spegneva DUE. `null` = non deciso qui,
-- e l'ambiente (`UGO_INITIATIVE`) tiene l'ultima parola: nessuna installazione
-- esistente cambia comportamento con questa migrazione.
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "initiative" boolean;
