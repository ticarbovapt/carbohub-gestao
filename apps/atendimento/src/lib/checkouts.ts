/**
 * Os links de checkout da PayT que o atendimento manda ao cliente.
 *
 * Eles existem porque a oferta de recompra TERMINA SEM LINK — ela acaba em
 * "Bora repor?" de propósito, e quem manda o link é uma PESSOA, dentro da
 * janela de 24 h. Até aqui esse link morava num bloco de notas de quem atende,
 * e link colado de memória é link errado sobre DINHEIRO: um desconto de 20%
 * mandado como preço cheio é uma venda perdida, e o contrário é margem dada.
 *
 * ⚠️ ISTO É CADASTRO MORANDO EM CÓDIGO, e está escrito aqui para ninguém
 * descobrir sozinho depois. Preço e URL mudam sem deploy em todo lugar deste
 * projeto — faixa de preço é tabela, tipo de demanda é tabela, motivo de visita
 * é tabela, e a razão é sempre a mesma: valor que muda e vive no código diverge
 * do que está no ar sem dar erro nenhum. Na PRIMEIRA vez que um preço ou uma
 * URL mudar, isto vira tabela (`carbo_checkouts`, lida por
 * `carbo_e_time_interno()`) e a tela passa a ler dela. Foi aceito assim porque
 * o pedido era de polimento de front, e porque seis links errados num arquivo
 * versionado ainda são melhores que seis links errados em seis cabeças.
 *
 * ⚠️ A ordem dentro de cada kit é do mais CARO para o mais barato, e não é
 * estética: o atendente desce a lista até onde precisa. Começando pelo
 * desconto, o caminho mais curto é dar desconto.
 */

export interface LinkCheckout {
  /** O que o cliente lê na oferta — nunca o código interno do produto. */
  rotulo: string;
  /** Preço CHEIO que sai na nota naquele link, em reais. */
  preco: number;
  url: string;
}

export interface KitCheckout {
  kit: string;
  /** Curto o bastante para caber num painel de ~18rem. */
  curto: string;
  links: LinkCheckout[];
}

export const CHECKOUTS: KitCheckout[] = [
  {
    kit: "Kit 10 Sachês 10ml",
    curto: "10 Sachês 10ml",
    links: [
      { rotulo: "Preço cheio", preco: 59, url: "https://payt.site/6mC8xxM" },
      { rotulo: "5% OFF",      preco: 56, url: "https://payt.site/p7CBR4a" },
      { rotulo: "20% OFF",     preco: 47, url: "https://payt.site/bbC2rVm" },
    ],
  },
  {
    kit: "Kit 5 Frascos 100ml",
    curto: "5 Frascos 100ml",
    links: [
      { rotulo: "Preço cheio", preco: 149, url: "https://payt.site/gGCmnnL" },
      { rotulo: "5% OFF",      preco: 142, url: "https://payt.site/xdCDa6W" },
      { rotulo: "20% OFF",     preco: 119, url: "https://payt.site/5wCroJA" },
    ],
  },
];
