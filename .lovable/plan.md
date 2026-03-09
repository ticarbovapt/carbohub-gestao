# Ajuste do Botao "+" com Gradiente no Hover/Click

## Resumo

Uma unica alteracao de UX/UI no botao "+" de acoes rapidas no header: o gradiente Carbo deve aparecer **somente** quando o usuario passa o mouse (hover) ou clica no botao. No estado padrao, o botao permanece com estilo neutro (outline).

---

## Detalhes Tecnicos

### Arquivo: `src/components/layouts/BoardLayout.tsx`

**Alterar o className do botao PopoverTrigger (linha 70)**

Estado atual:

```
border-2 border-primary/30 hover:border-primary hover:bg-primary/10
```

Novo comportamento:

- **Padrao**: borda sutil, fundo transparente, icone em cor neutra (muted-foreground)
- **Hover**: aplica `carbo-gradient` com texto/icone branco
- **Aberto (data-[state=open])**: mantém `carbo-gradient` com texto/icone branco

Implementacao com classes Tailwind + atributo data-state do Radix Popover:

```
h-9 w-9 rounded-full border-2 border-border text-muted-foreground
hover:carbo-gradient hover:text-white hover:border-transparent
data-[state=open]:carbo-gradient data-[state=open]:text-white data-[state=open]:border-transparent
transition-all
```

Como `carbo-gradient` e uma classe CSS customizada (nao utility do Tailwind), os prefixos `hover:` e `data-[state=open]:` nao funcionam diretamente. A solucao sera usar `group` + CSS condicional ou aplicar o gradiente via estilos inline condicionais baseados no estado `open` do Popover, combinado com uma classe CSS adicional para hover:

1. Adicionar ao `src/index.css` uma classe `.carbo-gradient-hover:hover` que aplica o gradiente
2. No componente, usar o estado `open` do Popover para aplicar `carbo-gradient` quando aberto
3. Ajustar a cor do icone `Plus` para branco quando hover/aberto

### Arquivo: `src/index.css`

Adicionar classe auxiliar:

```css
.carbo-gradient-hover:hover {
  background: linear-gradient(135deg, hsl(var(--carbo-green)) 0%, hsl(var(--carbo-blue)) 100%);
  color: white;
  border-color: transparent;
}
```

---

## Resultado Esperado

- Botao "+" no header: estado padrao com borda sutil e cor neutra
- Ao passar o mouse: gradiente verde-azul aparece com icone branco
- Ao clicar (popover aberto): gradiente permanece ativo
- Ao fechar o popover e tirar o mouse: volta ao estado neutro  
  
  
Faça os ajustes necessarios contidos no Wireframe