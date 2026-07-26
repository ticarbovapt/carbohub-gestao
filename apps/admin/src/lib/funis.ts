// ─────────────────────────────────────────────────────────────────────────────
// Rótulos de funil e etapa — porta MÍNIMA de apps/crm/src/types/crm.ts.
//
// O Admin não tem (nem deve ter) o tipo completo de lead do CRM: aqui só se
// LÊ agregado, nunca se edita card. O que a tela de acompanhamento precisa é
// traduzir `f12` → "Outbound" e `cadencia` → "Cadência".
//
// Se um id novo aparecer no CRM e não estiver aqui, a tela mostra o id cru em
// vez de quebrar — é o mesmo critério do dicionário legado do CRM, que foi o
// que salvou a consolidação f1..f9 → f13.
// ─────────────────────────────────────────────────────────────────────────────

export const FUNIL_NOME: Record<string, string> = {
  f1: "Vendas", f2: "Licenciados", f3: "Frotistas", f4: "PDVs CarboZé",
  f5: "PDVs CarboPRO", f6: "Frotistas Lic.", f7: "Motores", f8: "Estoque Comb.",
  f9: "Subdistribuidor", f10: "Follow up", f11: "Inbound", f12: "Outbound",
  f13: "Comercial Expansão",
};

export const ETAPA_NOME: Record<string, string> = {
  a_contatar: "A Contatar", novo: "Novo Lead", prospeccao: "Prospecção",
  a_reativar: "A Reativar", contato: "Contato Feito", contatado: "Contatado",
  conectado: "Conectado", cadencia: "Cadência", nutricao: "Nutrição",
  tentativa_1: "Tentativa 1", tentativa_2: "Tentativa 2", reagendar: "Reagendar",
  qualificado: "Qualificado", diagnostico: "Diagnóstico", poc: "POC",
  apresentacao: "Apresentação", visita_agendada: "Visita Agendada",
  reuniao: "Reunião Agendada", orcamento: "Orçamento",
  proposta: "Proposta Enviada", proposta_tecnica: "Proposta Técnica",
  oferta: "Oferta Enviada", negociacao: "Negociação", em_negociacao: "Em Negociação",
  formalizacao: "Formalização", contrato: "Contrato", pedido_inicial: "Pedido Inicial",
  reengajado: "Reengajado", convertido: "Convertido", parceiro: "Parceiro",
  fechamento: "Fechamento", ganho: "Ganho", recomprou: "Recomprou",
  repassado: "Passado ao Closer", perdido: "Perdido", descartado: "Descartado",
  sem_interesse: "Sem Interesse",
};

export const funilNome = (id: string) => FUNIL_NOME[id] ?? id;
export const etapaNome = (id: string) => ETAPA_NOME[id] ?? id;
