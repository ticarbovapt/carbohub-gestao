// ─────────────────────────────────────────────────────────────────────────────
// Quem é TIME INTERNO — a lista, num lugar só do lado do Deno.
//
// ⚠️ POR QUE ESTE ARQUIVO EXISTE
//
// A `20260927000000_quem_recebe_o_aviso.sql` já tinha resolvido isto no banco:
// `carbo_interface_e_interna(text[])` é a fonte ÚNICA, e `carbo_e_time_interno()`
// e `notify_time_interno()` passaram a chamá-la em vez de repetir a lista.
//
// Mas TRÊS edge functions ficaram de fora e seguiram com a lista copiada em
// TypeScript: `whatsapp-responder`, `whatsapp-midia` e `whatsapp-midia-baixar`.
// Eram a quarta, quinta e sexta cópias — e o comentário de uma delas dizia
// "lista duplicada é dívida; aqui é inevitável (o SQL não alcança daqui)".
//
// Não era inevitável: as três já têm um cliente Supabase com service role, e o
// Postgres responde por RPC. O que era inevitável é o que aconteceu — o app
// `atendimento` nasceu, `carbo_atendimento` entrou na função do banco, e as três
// cópias continuaram sem saber. Sintoma: quem só tem Atendimento vê o campo de
// resposta na tela, escreve, clica, e leva 403. Justamente a função do app novo.
//
// ⚠️ O BANCO É A FONTE. A lista abaixo é só a rede para quando o RPC não
// responde — e ela FECHA (nega), nunca abre: é o mesmo princípio do
// `if (!SEGREDO || informado !== SEGREDO) return 401` que o CLAUDE.md exige.
// Uma rede que ABRE transformaria uma falha de rede em porta destrancada, e
// nestas três funções isso é escrever pelo número da CarboZé.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

/**
 * Espelho da lista de `public.carbo_interface_e_interna`. Usada só quando o RPC
 * falha, e apenas para NEGAR mais rápido — nunca para conceder sozinha.
 *
 * ⚠️ `portal_pdv` e `portal_licenciado` ficam FORA de propósito: são os portais
 * externos, e eles usam a MESMA tabela `profiles` que o time. Incluí-los aqui
 * poria lojista e licenciado escrevendo pelo WhatsApp da empresa.
 */
export const INTERFACES_INTERNAS = [
  "carbo_admin",
  "carbo_crm",
  "carbo_ops",
  "carbo_ops_app",
  "carbo_financas",
  "carbo_mkt",
  "carbo_ti",
  "carbo_atendimento",
] as const;

/**
 * O perfil pertence ao time interno?
 *
 * Pergunta ao BANCO primeiro (`carbo_interface_e_interna`), que é a fonte única.
 * Se o RPC não responder, cai na lista local — e nesse caminho o resultado só
 * pode ser igual ou MAIS restritivo, nunca mais permissivo.
 */
export async function ehTimeInterno(
  supabase: SupabaseClient,
  interfaces: string[] | null | undefined,
): Promise<boolean> {
  const lista = interfaces ?? [];
  if (lista.length === 0) return false;

  const { data, error } = await supabase.rpc("carbo_interface_e_interna", {
    p_interfaces: lista,
  });

  if (!error && typeof data === "boolean") return data;

  // ⚠️ Rede, não atalho: só aceita quem TAMBÉM está na lista local. Se um dia a
  // lista do banco crescer e esta não, o efeito é negar acesso a quem deveria
  // ter — chato, visível, e reclamado no mesmo dia. O contrário seria conceder
  // acesso a quem o banco já tirou, e isso ninguém percebe.
  console.warn(
    "[interfacesInternas] RPC carbo_interface_e_interna indisponível, usando a lista local:",
    error?.message ?? "resposta não booleana",
  );
  return lista.some((i) => (INTERFACES_INTERNAS as readonly string[]).includes(i));
}
