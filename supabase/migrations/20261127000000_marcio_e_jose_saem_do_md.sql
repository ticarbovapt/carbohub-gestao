-- ============================================================================
-- 20261127 — Marcio Cajahiba e José Eduardo Monteiro: UMA conta cada
--
-- Pedido do dono do processo (22/10/2026): os dois foram criados no Admin/TI
-- como usuários INTERNOS (e-mail provisório `<login>@carbo.internal`) e ainda
-- têm a conta de microdistribuidor no md (MCJ001, JEM001). O e-mail real passa
-- para a conta interna, e a do md sai de uso — sem duas contas para a mesma
-- pessoa.
--
-- ⚠️ A conta do md é BLOQUEADA, não apagada. O banco RECUSA apagá-la:
-- `produtos.sales.frentista_id` e `produtos.leads.owner_id` são ON DELETE
-- RESTRICT, e o Marcio tem as 7 vendas de 20/10 no md (as que a `20261119`
-- copiou para o Sales). Apagar exigiria apagar as vendas, os leads e a
-- autoria — e as vendas do md baixaram o estoque do depósito dele.
-- Bloquear = `produtos.profiles.active = false` + ban no Auth (100 anos) +
-- sessões derrubadas + e-mail liberado. Reversível, e nada some.
--
-- ⚠️ O depósito do micro (posto `kind='micro'`) e o estoque dele FICAM como
-- estão. Desativá-lo é outra decisão.
-- ============================================================================

-- ── BLOCO 0 — medir (só lê) ─────────────────────────────────────────────────
with alvo(nome, email, login_md, padrao) as (values
  ('Marcio Cajahiba',       'marciocajahiba@gmail.com', 'MCJ001', 'marcio%cajahiba%'),
  ('José Eduardo Monteiro', 'eduardosrad@hotmail.com',  'JEM001', 'jose%eduardo%'))
select a.login_md, 'md' as conta, p.id, p.full_name, p.role::text as papel_ou_login,
       p.active, u.email as email_de_login, p.email as email_do_perfil, u.banned_until,
       (select count(*) from produtos.sales s where s.frentista_id = p.id) as vendas_md,
       (select count(*) from produtos.leads l where l.owner_id = p.id)     as leads_md
  from alvo a
  join produtos.profiles p on upper(p.username) = a.login_md
  join auth.users u on u.id = p.id
union all
select a.login_md, 'interno', p.id, p.full_name, p.username,
       null, u.email, p.email, u.banned_until, null, null
  from alvo a
  join public.profiles p on public.carbo_nome_chave(p.full_name) like a.padrao
  join auth.users u on u.id = p.id
 where not exists (select 1 from produtos.profiles pp where pp.id = p.id)
union all
select a.login_md, 'dono do e-mail', u.id, null, null,
       null, u.email, null, u.banned_until, null, null
  from alvo a
  join auth.users u on lower(u.email) = lower(a.email)
 order by 1, 2;

-- ── BLOCO 1 — aplicar (aborta inteiro se algo não bater) ───────────────────
do $$
declare
  a record;
  m record;
  i record;
  v_outro uuid;
  v_livre text;
begin
  for a in
    select * from (values
      ('Marcio Cajahiba',       'marciocajahiba@gmail.com', 'MCJ001', 'marcio%cajahiba%'),
      ('José Eduardo Monteiro', 'eduardosrad@hotmail.com',  'JEM001', 'jose%eduardo%')
    ) v(nome, email, login_md, padrao)
  loop
    -- a conta do md: exatamente UMA com aquele login
    if (select count(*) from produtos.profiles p where upper(p.username) = a.login_md) <> 1 then
      raise exception '%: não achei exatamente UMA conta % no md. Nada foi gravado.', a.nome, a.login_md;
    end if;
    select p.id, u.email as email_login into m
      from produtos.profiles p join auth.users u on u.id = p.id
     where upper(p.username) = a.login_md;

    -- a conta interna: exatamente UMA com esse nome, e que não seja do portal
    if (select count(*) from public.profiles p
         where public.carbo_nome_chave(p.full_name) like a.padrao
           and not exists (select 1 from produtos.profiles pp where pp.id = p.id)) <> 1 then
      raise exception '%: não achei exatamente UM usuário interno com esse nome. Nada foi gravado.', a.nome;
    end if;
    select p.id, u.email as email_login into i
      from public.profiles p join auth.users u on u.id = p.id
     where public.carbo_nome_chave(p.full_name) like a.padrao
       and not exists (select 1 from produtos.profiles pp where pp.id = p.id);

    -- o e-mail não pode ser de uma TERCEIRA conta
    select u.id into v_outro from auth.users u
     where lower(u.email) = lower(a.email) and u.id not in (m.id, i.id)
     limit 1;
    if v_outro is not null then
      raise exception '%: o e-mail % já é de outra conta (%). Nada foi gravado.', a.nome, a.email, v_outro;
    end if;

    -- md: sai de uso, sem apagar nada
    update produtos.profiles set active = false, email = null where id = m.id;
    if lower(m.email_login) = lower(a.email) then
      v_livre := lower(a.login_md) || '.md-desativado@portal.local';
      update auth.users set email = v_livre where id = m.id;
      update auth.identities
         set identity_data = identity_data || jsonb_build_object('email', v_livre)
       where user_id = m.id and provider = 'email';
    end if;
    update auth.users set banned_until = now() + interval '100 years' where id = m.id;
    delete from auth.sessions where user_id = m.id;

    -- interno: ganha o e-mail real (login, perfil e organograma)
    update auth.users
       set email = lower(a.email),
           email_confirmed_at = coalesce(email_confirmed_at, now())
     where id = i.id;
    update auth.identities
       set identity_data = identity_data || jsonb_build_object('email', lower(a.email))
     where user_id = i.id and provider = 'email';
    update public.profiles set email = lower(a.email) where id = i.id;
    update public.org_chart_nodes set email = lower(a.email) where user_id = i.id;

    raise notice '%: md % bloqueado · interno % agora entra com %', a.nome, a.login_md, i.id, lower(a.email);
  end loop;
end $$;

-- ── BLOCO 2 — conferir: rode o BLOCO 0 de novo ─────────────────────────────
-- md:            active = false, email_do_perfil vazio, banned_until em 2126
-- interno:       email_de_login = o e-mail real
-- dono do e-mail: UMA linha por pessoa, com o id do INTERNO
