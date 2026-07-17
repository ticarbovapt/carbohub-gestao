// Recibos de leitura (estilo WhatsApp) a partir dos membros do canal.
//  • enviada:  ninguém (ainda) recebeu.
//  • entregue: TODOS os destinatários receberam (last_delivered_at ≥ msg).
//  • lida:     TODOS os destinatários leram (last_read_at ≥ msg).
// "Destinatários" = membros do canal exceto o autor (eu). Em DM é 1; em grupo,
// todos os outros ativos. As contagens servem pro detalhe do painel do grupo.
import type { ChannelMember } from "../hooks";

export type ReceiptStatus = "sent" | "delivered" | "read";

export interface Receipt {
  status: ReceiptStatus;
  readCount: number;
  deliveredCount: number;
  total: number;
}

const at = (iso: string | null | undefined) => (iso ? new Date(iso).getTime() : 0);

export function messageReceipt(
  createdAt: string,
  members: ChannelMember[],
  currentUserId: string,
): Receipt {
  const ts = at(createdAt);
  const others = members.filter((m) => m.id !== currentUserId);
  const total = others.length;
  if (total === 0) return { status: "sent", readCount: 0, deliveredCount: 0, total: 0 };

  const readCount = others.filter((m) => at(m.lastReadAt) >= ts).length;
  const deliveredCount = others.filter((m) => at(m.lastDeliveredAt) >= ts || at(m.lastReadAt) >= ts).length;

  const status: ReceiptStatus =
    readCount >= total ? "read" : deliveredCount >= total ? "delivered" : "sent";
  return { status, readCount, deliveredCount, total };
}

// Estado de UM membro em relação a UMA mensagem (para o painel do grupo).
export function memberReceipt(createdAt: string, member: ChannelMember): ReceiptStatus {
  const ts = at(createdAt);
  if (at(member.lastReadAt) >= ts) return "read";
  if (at(member.lastDeliveredAt) >= ts) return "delivered";
  return "sent";
}
