-- Fase-9 (Orizzonti 1+4): l'incontro tra creature scrive un evento `peer`
-- sul diario (trasferimento orizzontale dei geni culturali). La costante
-- `EVENT_SOURCES` in `@ugo/shared` aggiunge `peer`; qui l'enum Postgres
-- lo accetta, esattamente come 0021 fece per `reception`.
ALTER TYPE "public"."event_source" ADD VALUE 'peer';