-- ═══════════════════════════════════════════════════════════════════════════
-- Mensagem-modelo que QUEM ATENDE envia: retomar a conversa com a janela
-- fechada (23/11/2026)
--
-- Com a janela de 24 h fechada a Meta só aceita template aprovado, e a tela
-- dizia "não dá para responder por aqui" sem oferecer nada — medido: 269
-- conversas na Loja, 113 no CarboZé e 70 no Clube sem caminho. O template
-- `retomada_atendimento` (MARKETING, aprovado) devolve a conversa: o cliente
-- toca "Podemos sim" e a janela abre de novo.
--
-- ⚠️ CADASTRO, não `carbo_msg_templates`: aquela tabela é da FILA automática
-- (etapa com CHECK, régua, janela de horário, teto). Este é o modelo que uma
-- PESSOA manda à mão, numa conversa. Modelo novo = INSERT, sem deploy.
-- ⚠️ `texto` é o ESPELHO do aprovado na Meta (para o balão na conversa); quem
-- decide o que sai é a Meta.
-- ⚠️ `comercial = true` respeita "Não contatar" (é MARKETING para a Meta).
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.carbo_wa_modelos_atendimento (
  codigo             text primary key,
  rotulo             text not null,
  meta_template_nome text not null,
  meta_idioma        text not null default 'pt_BR',
  meta_variaveis     jsonb not null default '[]'::jsonb,
  texto              text not null,
  comercial          boolean not null default true,
  ativo              boolean not null default true,
  ordem              int not null default 0,
  criado_em          timestamptz not null default now()
);

alter table public.carbo_wa_modelos_atendimento enable row level security;
drop policy if exists carbo_wa_modelos_atendimento_ler on public.carbo_wa_modelos_atendimento;
create policy carbo_wa_modelos_atendimento_ler on public.carbo_wa_modelos_atendimento
  for select to authenticated using ((select public.carbo_e_time_interno()));
grant select on public.carbo_wa_modelos_atendimento to authenticated;

insert into public.carbo_wa_modelos_atendimento
  (codigo, rotulo, meta_template_nome, meta_idioma, meta_variaveis, texto, comercial, ordem)
values (
  'retomada', 'Retomar atendimento', 'retomada_atendimento', 'pt_BR',
  '[{"nome": "primeiro_nome", "de": "primeiro_nome", "fallback": "tudo bem"}]'::jsonb,
  E'Oi, {{primeiro_nome}}! Aqui é do CarboZé 💚\n\nSeu atendimento ficou em aberto por aqui. Podemos continuar agora?',
  true, 1
)
on conflict (codigo) do update set
  rotulo = excluded.rotulo, meta_template_nome = excluded.meta_template_nome,
  meta_idioma = excluded.meta_idioma, meta_variaveis = excluded.meta_variaveis,
  texto = excluded.texto, comercial = excluded.comercial;
