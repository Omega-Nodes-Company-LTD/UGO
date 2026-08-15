import type { ReceptionTicket } from "@ugo/shared";

/** Gli stati del ticket, in italiano, in un posto solo. */
export const STATUS_LABEL: Record<ReceptionTicket["status"], string> = {
  open: "aperto",
  in_progress: "in lavorazione",
  waiting: "in attesa di te",
  closed: "chiuso",
};
