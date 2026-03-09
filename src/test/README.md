# Estrutura de Testes - CARBO OPS

## 🎯 Princípio Fundamental

> "Se não pode ser testado, não está pronto para existir."

Este projeto segue uma cultura rigorosa de testes, inspirada nas melhores práticas do pytest.

## 📁 Estrutura de Diretórios

```
src/test/
├── fixtures/           # Dados de teste reutilizáveis
│   ├── auth.ts        # Fixtures de autenticação e roles
│   ├── os.ts          # Fixtures de ordens de serviço
│   └── index.ts       # Exportações centralizadas
├── helpers/           # Utilitários para testes
│   ├── render.tsx     # Wrapper de renderização com providers
│   ├── supabase-mock.ts # Mock do cliente Supabase
│   └── index.ts       # Exportações centralizadas
├── rbac/              # Testes de controle de acesso
│   └── roles.test.ts  # Testes de permissões e roles
├── os-flow/           # Testes de fluxo operacional
│   ├── os-flow.test.ts         # Testes de workflow OS
│   └── stage-validation.test.ts # Testes de validação de etapas
├── setup.ts           # Configuração global de testes
└── example.test.ts    # Exemplo básico
```

## 🧪 Executando Testes

```bash
# Executar todos os testes
bun run test

# Executar testes específicos
bun run test -- --grep "RBAC"
bun run test -- --grep "OS Flow"

# Executar com cobertura
bun run test -- --coverage
```

## 📦 Fixtures

### Auth Fixtures
```typescript
import { createMockAuthContext, MOCK_ROLES } from "@/test/fixtures";

// Criar contexto autenticado
const ceoContext = createMockAuthContext("ceo");
const operadorContext = createMockAuthContext("operador");

// Criar contexto não autenticado
const unauthContext = createUnauthenticatedContext();
```

### OS Fixtures
```typescript
import { createMockOsFlow, OS_SCENARIOS } from "@/test/fixtures";

// Usar cenário predefinido
const osNova = OS_SCENARIOS.new();
const osSlaEstourado = OS_SCENARIOS.slaBreached();

// Criar fluxo completo para integração
const flow = createMockOsFlow("inPreparation");
```

## ✅ Boas Práticas

### 1. Nomes Descritivos
```typescript
// ✅ BOM - descreve comportamento
it("CEO deve ter acesso a todas as etapas do workflow")

// ❌ RUIM - descreve implementação
it("isCeo returns true when role is ceo")
```

### 2. Testes Parametrizados
```typescript
const testCases = [
  { role: "ceo", canValidate: true },
  { role: "operador", canValidate: false },
];

testCases.forEach(({ role, canValidate }) => {
  it(`${role} ${canValidate ? "pode" : "não pode"} validar`, () => {
    // ...
  });
});
```

### 3. Isolamento
```typescript
// Cada teste é independente
it("deve criar OS com ID único", () => {
  const os1 = createMockServiceOrder();
  const os2 = createMockServiceOrder();
  expect(os1.id).not.toBe(os2.id);
});
```

## 📋 Checklist de Cobertura

- [ ] Toda regra crítica de negócio tem teste
- [ ] Todo fluxo de OS é testável
- [ ] Toda validação de checklist tem cobertura
- [ ] Toda permissão (RBAC) é validada por teste
- [ ] Todo bug corrigido gera um novo teste

## 🚫 O Que Evitar

- Código sem teste mínimo
- Testes acoplados entre si
- Testes dependentes de ambiente instável
- Dados reais usados em testes
- "Testar depois"

## 🔄 Fluxo de Desenvolvimento

1. Escrever teste que falha (comportamento esperado)
2. Implementar código mínimo para passar
3. Refatorar mantendo testes verdes
4. Commit com testes passando
