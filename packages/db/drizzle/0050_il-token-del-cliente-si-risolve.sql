-- ADR-062 tempo 2b, il passo che mancava alla reception. SCRITTA A MANO.
--
-- `customer_access_tokens` era scopata per casa come tutto il resto (0016),
-- ma risolvere un token e' cio' che PRECEDE sapere di che casa si tratta —
-- e' la stessa eccezione, con le stesse parole, che la 0013 ha dichiarato per
-- `access_tokens`: senza, il primo cliente che bussa sotto l'utenza
-- applicativa trova una reception che non lo riconosce, senza un errore.
--
-- SELECT per risolvere, UPDATE per `last_used_at` e la revoca: la riga porta
-- solo hash e scadenze, mai il token in chiaro (che non esiste da nessuna
-- parte), quindi cio' che questa policy espone e' la possibilita' di
-- confrontare un hash — che e' la definizione di un token.
DROP POLICY IF EXISTS customer_access_tokens_resolve ON customer_access_tokens;--> statement-breakpoint
CREATE POLICY customer_access_tokens_resolve ON customer_access_tokens
  FOR SELECT USING (true);--> statement-breakpoint
DROP POLICY IF EXISTS customer_access_tokens_touch ON customer_access_tokens;--> statement-breakpoint
CREATE POLICY customer_access_tokens_touch ON customer_access_tokens
  FOR UPDATE USING (true) WITH CHECK (true);
