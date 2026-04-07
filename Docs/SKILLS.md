# CarboHub — Guia de Padrões e Habilidades Técnicas
> Referência para desenvolvimento consistente no projeto
> Atualizado em 2026-04-07

---

## 1. Padrões React

### 1.1 Componentes Funcionais e TypeScript

Todo componente usa função arrow com tipagem explícita:

```tsx
// Padrão de componente de página
const MeuModulo: React.FC = () => {
  // ...
  return <div>...</div>;
};
export default MeuModulo;
```

Props são tipadas com `interface` local no arquivo:

```tsx
interface Props {
  licenseeId: string;
  onSuccess?: () => void;
}
const MeuCard: React.FC<Props> = ({ licenseeId, onSuccess }) => { ... };
```

### 1.2 Hooks Customizados

Cada domínio de dados tem seu hook em `src/hooks/`. O padrão é:

```
src/hooks/
  use<Entidade>.ts         → hook principal de listagem/detalhe
  use<Entidade>Actions.ts  → hooks de mutação (create, update, delete)
```

Hooks seguem a convenção de retornar objetos nomeados (não arrays):

```tsx
const { data, isLoading, error, refetch } = useProductBom(productId);
```

### 1.3 Estrutura de Hooks com React Query

Todos os hooks de dados usam `@tanstack/react-query`. Padrão obrigatório:

```tsx
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// Query
export function useMinhaEntidade(id: string) {
  return useQuery({
    queryKey: ["minha-entidade", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("minha_tabela")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });
}

// Mutation
export function useAtualizarEntidade() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: MinhaEntidadeUpdate) => {
      const { data, error } = await supabase
        .from("minha_tabela")
        .update(payload)
        .eq("id", payload.id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["minha-entidade", data.id] });
      toast.success("Salvo com sucesso!");
    },
    onError: (e: Error) => toast.error("Erro: " + e.message),
  });
}
```

**Regras de QueryKey:**
- Array com nome da entidade + filtros: `["mrp-bom", productId]`
- Invalidar sempre no `onSuccess` da mutation
- Usar `enabled: !!param` quando o query depende de um param opcional

### 1.4 Contexto de Autenticação

O contexto central é `src/contexts/AuthContext.tsx`. Uso:

```tsx
import { useAuth } from "@/contexts/AuthContext";

const { user, profile, role, isMasterAdmin, isCEO, isManager } = useAuth();
```

Roles disponíveis: `master_admin`, `ceo`, `manager`, `operator`, `licensee`, `pdv`.

Verificação de permissão em componentes:

```tsx
{isMasterAdmin && <BotaoRestrito />}
{(isMasterAdmin || isCEO) && <CockpitEstrategico />}
```

---

## 2. Padrões Supabase

### 2.1 Cliente Supabase

Sempre importar de `@/integrations/supabase/client`:

```tsx
import { supabase } from "@/integrations/supabase/client";
```

Nunca instanciar o cliente diretamente nos componentes.

### 2.2 Queries com Join (Select Expandido)

Para joins, usar a sintaxe de select encadeado do Supabase:

```tsx
const { data, error } = await supabase
  .from("mrp_bom")
  .select(`
    *,
    insumo:insumo_id (
      id, name, product_code, stock_unit, category
    )
  `)
  .eq("product_id", productId)
  .order("is_critical", { ascending: false });
```

Quando o tipo gerado não cobre a tabela nova, usar cast `as any` temporariamente:

```tsx
const { data, error } = await (supabase as any)
  .from("nova_tabela")
  .select("*");
```

### 2.3 Row Level Security (RLS)

Todas as tabelas novas devem ter RLS habilitado imediatamente após criação:

```sql
ALTER TABLE minha_tabela ENABLE ROW LEVEL SECURITY;

-- SELECT para usuários autenticados
CREATE POLICY "minha_tabela_select" ON minha_tabela FOR SELECT
  USING (auth.role() = 'authenticated');

-- INSERT/UPDATE restritos por role
CREATE POLICY "minha_tabela_insert" ON minha_tabela FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = auth.uid()
    AND role IN ('admin','manager','operator')
  ));

CREATE POLICY "minha_tabela_update" ON minha_tabela FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = auth.uid()
    AND role IN ('admin','manager')
  ));
```

Tabela de referência de roles no RLS:

| Role no user_roles | Acesso |
|-------------------|--------|
| `admin` | Tudo (equivale a MasterAdmin) |
| `manager` | CRUD completo em dados operacionais |
| `operator` | INSERT em dados operacionais, SELECT em todos |
| `licensee` | Dados próprios (filtro por licensee_id) |
| `pdv` | Dados da própria loja (filtro por pdv_id) |

### 2.4 Realtime

Para notificações em tempo real (usado no hub Licenciados):

```tsx
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

useEffect(() => {
  const channel = supabase
    .channel("ops-alerts")
    .on("postgres_changes", {
      event: "INSERT",
      schema: "public",
      table: "ops_alerts",
      filter: `licensee_id=eq.${licenseeId}`,
    }, (payload) => {
      // handle new alert
    })
    .subscribe();

  return () => { supabase.removeChannel(channel); };
}, [licenseeId]);
```

### 2.5 Edge Functions (Deno)

Edge Functions ficam em `supabase/functions/<nome>/index.ts`. Padrão de chamada:

```tsx
const { data, error } = await supabase.functions.invoke("melhor-envio-quote", {
  body: { origem: cepOrigem, destino: cepDestino, peso: pesoKg },
});
```

**Padrão de fallback quando função não está deployada:**

```tsx
if (error?.message?.includes("Failed to fetch")) {
  // retornar mock data para não quebrar a UI
  return mockFreightData;
}
```

---

## 3. Padrões de UI e Componentes

### 3.1 Componentes shadcn/ui

O projeto usa a biblioteca shadcn/ui com Radix UI primitives. Componentes estão em `src/components/ui/`. Importação padrão:

```tsx
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
```

### 3.2 Ícones

Sempre usar `lucide-react`. Nunca adicionar outra biblioteca de ícones:

```tsx
import { Settings2, Users, Store, ChevronRight, AlertCircle } from "lucide-react";
```

### 3.3 Notificações Toast

Usar `sonner` para feedback ao usuário:

```tsx
import { toast } from "sonner";

toast.success("Salvo com sucesso!");
toast.error("Erro ao salvar: " + mensagem);
toast.info("Processando...");
```

### 3.4 Tailwind CSS — Convenções

- Usar variáveis CSS para cores do tema: `bg-background`, `text-foreground`, `border-border`.
- Cores carbo customizadas: `carbo-green`, `carbo-blue`, `carbo-amber` (definidas em `tailwind.config.ts`).
- Classes responsivas mobile-first: `sm:`, `md:`, `lg:`.
- Dark mode via `dark:` prefix (gerenciado pelo `ThemeToggle` com `next-themes`).
- Não usar valores hardcoded de cor (ex: `bg-[#1a1a1a]`) — preferir tokens do tema.

```tsx
// Correto
<div className="bg-card text-card-foreground border border-border rounded-lg p-4">

// Evitar
<div className="bg-[#ffffff] text-[#333333] border border-gray-200 rounded-lg p-4">
```

### 3.5 Componentes CarboUI Reutilizáveis

Componentes customizados frequentemente reutilizados:

| Componente | Arquivo | Uso |
|-----------|---------|-----|
| `DatePickerInput` | `src/components/ui/date-picker-input.tsx` | Seletor de data com locale pt-BR |
| `ThemeToggle` | `src/components/ui/ThemeToggle.tsx` | Alternador dark/light mode |
| `AreaSwitcher` | `src/components/navigation/AreaSwitcher.tsx` | Troca de hub no header |
| `AIRecommendationsCard` | `src/components/licensee/AIRecommendationsCard.tsx` | Card de recomendações IA |
| `LicenseeWalletCard` | `src/components/licensee/LicenseeWalletCard.tsx` | Carteira de créditos |
| `ProductBomModal` | `src/components/mrp/ProductBomModal.tsx` | Modal CRUD da BOM |

### 3.6 Mapas (Leaflet)

Para mapas geográficos, usar `react-leaflet`:

```tsx
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";

<MapContainer center={[-15.77, -47.92]} zoom={4} style={{ height: "400px" }}>
  <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
  {cities.map(c => (
    <Marker key={c.id} position={[c.lat, c.lng]}>
      <Popup>{c.name}</Popup>
    </Marker>
  ))}
</MapContainer>
```

Sempre incluir fallback `BRAZIL_CITIES_COORDS` para cidades sem resultado de geocode.

### 3.7 Gráficos (Recharts)

```tsx
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

<ResponsiveContainer width="100%" height={300}>
  <AreaChart data={dados}>
    <CartesianGrid strokeDasharray="3 3" />
    <XAxis dataKey="mes" />
    <YAxis />
    <Tooltip />
    <Area type="monotone" dataKey="valor" stroke="#22c55e" fill="#22c55e20" />
  </AreaChart>
</ResponsiveContainer>
```

---

## 4. Convenções de Código

### 4.1 Nomenclatura

| Tipo | Convenção | Exemplo |
|------|-----------|---------|
| Componente React | PascalCase | `ProductBomModal`, `LicenseeDashboard` |
| Hook customizado | camelCase com prefixo `use` | `useProductBom`, `useLicenseeWallet` |
| Arquivo de componente | PascalCase.tsx | `OSBoard.tsx`, `CeoDashboard.tsx` |
| Arquivo de hook | camelCase.ts | `useProductBom.ts` |
| Tabela Supabase | snake_case | `mrp_bom`, `descarb_sales` |
| Constante global | UPPER_SNAKE_CASE | `BRAZIL_CITIES_COORDS` |
| Variável/função | camelCase | `licenseeId`, `fetchData` |

### 4.2 Estrutura de Diretórios

```
src/
  components/
    ui/               → Componentes base shadcn/ui
    layouts/          → BoardLayout, LicenseeLayout, PDVLayout
    dashboard/        → CeoDashboard, GestorDashboard, OperadorDashboard
    licensee/         → Componentes do hub Licenciados
    mrp/              → ProductBomModal, etc.
    production-orders/→ OPKanbanBoard, etc.
    navigation/       → AreaSwitcher, Sidebar
    team/             → OrgChart, TeamCard
  contexts/
    AuthContext.tsx   → Autenticação e roles
  hooks/              → Todos os hooks customizados
  pages/              → Uma página por rota
  integrations/
    supabase/
      client.ts       → Instância única do Supabase
```

### 4.3 Roteamento

Rotas definidas em `src/App.tsx` (597+ linhas). Padrão por hub:

- Hub Controle: `/rota` (sem prefixo)
- Hub Licenciados: `/licensee/rota`
- Hub Lojas: `/pdv/rota`

Proteção de rotas por hub com verificação de role no contexto.

### 4.4 Formulários

Usar `react-hook-form` + `zod` para validação:

```tsx
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

const schema = z.object({
  nome: z.string().min(2, "Nome obrigatório"),
  valor: z.number().positive("Valor deve ser positivo"),
});

type FormData = z.infer<typeof schema>;

const form = useForm<FormData>({
  resolver: zodResolver(schema),
  defaultValues: { nome: "", valor: 0 },
});
```

---

## 5. Padrões de Migration SQL

### 5.1 Estrutura Padrão de Migration

Arquivo em `supabase/migrations/<timestamp>_<descricao>.sql`:

```sql
-- ============================================================
-- <Descrição da migration>
-- CarboHub <data>
-- Rodar no Supabase SQL Editor
-- ============================================================

-- 1. CRIAR TABELA
CREATE TABLE IF NOT EXISTS minha_tabela (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campo_fk    uuid NOT NULL REFERENCES tabela_pai(id) ON DELETE CASCADE,
  nome        text NOT NULL,
  status      text NOT NULL DEFAULT 'ativo'
    CHECK (status IN ('ativo','inativo')),
  created_by  uuid REFERENCES auth.users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- 2. ÍNDICES
CREATE INDEX IF NOT EXISTS idx_minha_tabela_fk ON minha_tabela(campo_fk);
CREATE INDEX IF NOT EXISTS idx_minha_tabela_date ON minha_tabela(created_at DESC);

-- 3. TRIGGER updated_at
CREATE OR REPLACE FUNCTION update_minha_tabela_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS minha_tabela_updated_at ON minha_tabela;
CREATE TRIGGER minha_tabela_updated_at
  BEFORE UPDATE ON minha_tabela
  FOR EACH ROW EXECUTE FUNCTION update_minha_tabela_updated_at();

-- 4. RLS
ALTER TABLE minha_tabela ENABLE ROW LEVEL SECURITY;
CREATE POLICY "minha_tabela_select" ON minha_tabela FOR SELECT
  USING (auth.role() = 'authenticated');
CREATE POLICY "minha_tabela_insert" ON minha_tabela FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = auth.uid()
    AND role IN ('admin','manager','operator')
  ));
CREATE POLICY "minha_tabela_update" ON minha_tabela FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = auth.uid()
    AND role IN ('admin','manager')
  ));
```

### 5.2 Boas Práticas SQL

- Sempre usar `CREATE TABLE IF NOT EXISTS` e `CREATE INDEX IF NOT EXISTS`.
- Sempre usar `DROP TRIGGER IF EXISTS` antes de `CREATE TRIGGER`.
- UUIDs com `gen_random_uuid()` como PK padrão.
- Campos `created_at` e `updated_at` em todas as tabelas com trigger.
- Constraints `CHECK` inline na definição da coluna para enums simples.
- `ON DELETE CASCADE` para dados filhos, `ON DELETE SET NULL` para referências opcionais, `ON DELETE RESTRICT` para dados com integridade crítica.

---

## 6. Processo de Deploy

### 6.1 Build Check (obrigatório antes de cada commit)

```bash
npx tsc --noEmit --skipLibCheck
```

Resolver todos os erros de TypeScript antes de commitar. Nunca fazer push com erros de build.

### 6.2 Padrão de Commit

```bash
git add src/components/meu-modulo/ src/hooks/useMeuModulo.ts
git commit -m "feat: descrição do que foi feito

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

Prefixos:
- `feat:` — nova funcionalidade
- `fix:` — correção de bug
- `refactor:` — refatoração sem mudança de comportamento
- `docs:` — documentação
- `chore:` — configuração, dependências

### 6.3 Deploy Automático

```
git push origin main
  → GitHub Actions executa deploy.yml
  → vite build → dist/
  → GitHub Pages atualiza carbohub.com.br
  → Tempo total: ~1 minuto
```

### 6.4 Edge Functions (Supabase)

Deploy manual (não automatizado):

```bash
supabase functions deploy melhor-envio-quote --project-ref spigkskwypbnaiwkaher
```

Secrets configurados em Supabase Dashboard → Project Settings → Edge Functions → Secrets.

### 6.5 Migrations Supabase

Migrations são aplicadas manualmente no Supabase SQL Editor (plano Free não suporta CLI migrations automáticas). Arquivos ficam em `supabase/migrations/` para controle de versão.

Ordem de execução quando há dependências entre tabelas:
1. Tabelas pai (ex: `licensees`, `mrp_products`)
2. Tabelas filho (ex: `descarb_clients`, `licensee_product_stock`)
3. Seeds (ex: `20260407_mrp_bom_seed.sql`)

---

## 7. Integrações Externas — Padrões

### 7.1 ViaCEP (auto-fill de CEP)

```tsx
const fetchCep = async (cep: string) => {
  const clean = cep.replace(/\D/g, "");
  if (clean.length !== 8) return;
  const res = await fetch(`https://viacep.com.br/ws/${clean}/json/`);
  const data = await res.json();
  if (!data.erro) {
    setValue("logradouro", data.logradouro);
    setValue("cidade", data.localidade);
    setValue("uf", data.uf);
  }
};
// Usar com debounce de 500ms no onChange do input de CEP
```

### 7.2 Export Excel (SheetJS)

```tsx
import * as XLSX from "xlsx";

const exportarExcel = (dados: any[], nomeArquivo: string) => {
  const ws = XLSX.utils.json_to_sheet(dados);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Dados");
  XLSX.writeFile(wb, `${nomeArquivo}.xlsx`);
};
```

### 7.3 Melhor Envio (frete)

Chamada via Edge Function com fallback:

```tsx
try {
  const { data, error } = await supabase.functions.invoke("melhor-envio-quote", {
    body: { cepOrigem, cepDestino, peso, altura, largura, comprimento },
  });
  if (error) throw error;
  setResultados(data.fretes);
} catch {
  // fallback mock — não quebra a UI em desenvolvimento
  setResultados(mockFreightOptions);
}
```
