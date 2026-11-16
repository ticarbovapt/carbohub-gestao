# supabase/aplicar — SQL que vai ao banco quando o PR é mergeado na `main`

Arquivo **novo** aqui roda **uma vez** em produção (workflow `sql-supabase`), em ordem de
nome, cada um como UMA transação. Editar um arquivo que já rodou não o repete.

- Nome: `AAAAMMDD-HHMM_descricao.sql`.
- Um arquivo pode ser só um ponteiro: primeira linha `-- @executar supabase/migrations/XXXX.sql`.
- `RAISE NOTICE` não aparece no log — termine com um `SELECT` para ver o resultado.
- Não consulte segredo (o log é lido por quem tem acesso ao repositório).
- Migração com bloco que exige LER o resultado antes de seguir não vai aqui.
