// GERADO por docs/posvenda/publicar-nos-apps.mjs — não editar.
// Os slides de docs/posvenda/fluxos-pos-venda.pptx: título e conectores
// clicáveis (em polegadas, slide de 13.333 × 7.5).
export interface LinkDoSlide { x: number; y: number; w: number; h: number; slide: number }
export interface SlideDoFluxo { n: number; titulo: string; sub?: string; links: LinkDoSlide[] }

export const FLUXOS_SLIDES = {
 "largura": 13.333,
 "altura": 7.5,
 "reembolso": 14,
 "tipos": {
  "faltante": 3,
  "avaria": 4,
  "defeito": 5,
  "errado": 7,
  "arrependimento": 8,
  "nao_recebido": 11,
  "atraso": 12,
  "devolvido": 13
 },
 "slides": [
  {
   "n": 1,
   "titulo": "Pós-venda · fluxos de atendimento",
   "links": [
    {
     "x": 0.45,
     "y": 1.45,
     "w": 4.05,
     "h": 0.64,
     "slide": 2
    },
    {
     "x": 0.45,
     "y": 2.21,
     "w": 4.05,
     "h": 0.64,
     "slide": 3
    },
    {
     "x": 0.45,
     "y": 2.97,
     "w": 4.05,
     "h": 0.64,
     "slide": 4
    },
    {
     "x": 0.45,
     "y": 3.73,
     "w": 4.05,
     "h": 0.64,
     "slide": 5
    },
    {
     "x": 0.45,
     "y": 4.49,
     "w": 4.05,
     "h": 0.64,
     "slide": 6
    },
    {
     "x": 0.45,
     "y": 5.25,
     "w": 4.05,
     "h": 0.64,
     "slide": 7
    },
    {
     "x": 0.45,
     "y": 6.01,
     "w": 4.05,
     "h": 0.64,
     "slide": 8
    },
    {
     "x": 4.8,
     "y": 1.45,
     "w": 4.05,
     "h": 0.64,
     "slide": 9
    },
    {
     "x": 4.8,
     "y": 2.21,
     "w": 4.05,
     "h": 0.64,
     "slide": 10
    },
    {
     "x": 4.8,
     "y": 2.97,
     "w": 4.05,
     "h": 0.64,
     "slide": 11
    },
    {
     "x": 4.8,
     "y": 3.73,
     "w": 4.05,
     "h": 0.64,
     "slide": 12
    },
    {
     "x": 4.8,
     "y": 4.49,
     "w": 4.05,
     "h": 0.64,
     "slide": 13
    },
    {
     "x": 4.8,
     "y": 5.25,
     "w": 4.05,
     "h": 0.64,
     "slide": 14
    }
   ],
   "sub": "Um slide por tipo de caso. Clique no nome para ir à página; nos fluxos, o conector “→ pág. N” leva ao trecho seguinte."
  },
  {
   "n": 2,
   "titulo": "Qual fluxo seguir",
   "links": [
    {
     "x": 9.088,
     "y": 1.2,
     "w": 1.882,
     "h": 0.54,
     "slide": 3
    },
    {
     "x": 8.672,
     "y": 1.842,
     "w": 2.713,
     "h": 0.54,
     "slide": 4
    },
    {
     "x": 8.811,
     "y": 2.484,
     "w": 2.436,
     "h": 0.54,
     "slide": 5
    },
    {
     "x": 9.117,
     "y": 3.126,
     "w": 1.824,
     "h": 0.54,
     "slide": 7
    },
    {
     "x": 9.08,
     "y": 3.768,
     "w": 1.897,
     "h": 0.54,
     "slide": 8
    },
    {
     "x": 8.767,
     "y": 4.409,
     "w": 2.524,
     "h": 0.54,
     "slide": 11
    },
    {
     "x": 9.073,
     "y": 5.051,
     "w": 1.911,
     "h": 0.54,
     "slide": 12
    },
    {
     "x": 8.803,
     "y": 5.693,
     "w": 2.451,
     "h": 0.54,
     "slide": 13
    }
   ],
   "sub": "O sistema lê a reclamação no WhatsApp e sugere o tipo; quem atende confirma ao abrir o caso."
  },
  {
   "n": 3,
   "titulo": "1. Produto faltante",
   "links": [
    {
     "x": 5.802,
     "y": 3.99,
     "w": 1.89,
     "h": 0.45,
     "slide": 14
    },
    {
     "x": 7.939,
     "y": 3.99,
     "w": 1.935,
     "h": 0.45,
     "slide": 14
    }
   ],
   "sub": "Chegou incompleto · CDC Art. 19 · resolver em até 30 dias (Art. 18, § 1º)"
  },
  {
   "n": 4,
   "titulo": "2. Avaria / vazamento",
   "links": [
    {
     "x": 0.45,
     "y": 6.047,
     "w": 2.715,
     "h": 0.61,
     "slide": 5
    },
    {
     "x": 4.492,
     "y": 3.187,
     "w": 2.623,
     "h": 0.61,
     "slide": 14
    },
    {
     "x": 7.45,
     "y": 3.187,
     "w": 2.562,
     "h": 0.61,
     "slide": 14
    }
   ],
   "sub": "Chegou danificado · CDC Art. 18 · resolver em até 30 dias (Art. 18, § 1º)"
  },
  {
   "n": 5,
   "titulo": "3. Defeito / não funcionou (1/2)",
   "links": [
    {
     "x": 0.45,
     "y": 5.649,
     "w": 1.355,
     "h": 0.417,
     "slide": 8
    },
    {
     "x": 9.212,
     "y": 3.492,
     "w": 1.813,
     "h": 0.531,
     "slide": 6
    },
    {
     "x": 7.42,
     "y": 4.648,
     "w": 1.792,
     "h": 0.417,
     "slide": 14
    },
    {
     "x": 9.442,
     "y": 4.648,
     "w": 1.75,
     "h": 0.417,
     "slide": 14
    },
    {
     "x": 7.696,
     "y": 2.419,
     "w": 0.969,
     "h": 0.375,
     "slide": 6
    },
    {
     "x": 11.583,
     "y": 2.419,
     "w": 0.969,
     "h": 0.375,
     "slide": 6
    }
   ],
   "sub": "Relato, fotos e decisão · Problema no produto · CDC Art. 18 · resolver em até 30 dias (Art. 18, § 1º)"
  },
  {
   "n": 6,
   "titulo": "3. Defeito / não funcionou (2/2)",
   "links": [
    {
     "x": 3.756,
     "y": 6.338,
     "w": 2.769,
     "h": 0.626,
     "slide": 5
    },
    {
     "x": 6.868,
     "y": 6.252,
     "w": 2.706,
     "h": 0.798,
     "slide": 5
    },
    {
     "x": 5.914,
     "y": 1.2,
     "w": 1.517,
     "h": 0.563,
     "slide": 5
    }
   ],
   "sub": "O produto volta para análise · Problema no produto · CDC Art. 18 · resolver em até 30 dias (Art. 18, § 1º)"
  },
  {
   "n": 7,
   "titulo": "4. Produto errado",
   "links": [
    {
     "x": 6.701,
     "y": 5.231,
     "w": 2.472,
     "h": 0.575,
     "slide": 14
    }
   ],
   "sub": "Veio outro produto · CDC Art. 18 · resolver em até 30 dias (Art. 18, § 1º)"
  },
  {
   "n": 8,
   "titulo": "5. Arrependimento (1/3)",
   "links": [
    {
     "x": 1.66,
     "y": 4.469,
     "w": 1.939,
     "h": 0.451,
     "slide": 14
    },
    {
     "x": 3.853,
     "y": 4.469,
     "w": 2.13,
     "h": 0.451,
     "slide": 10
    },
    {
     "x": 6.231,
     "y": 4.469,
     "w": 1.973,
     "h": 0.451,
     "slide": 9
    },
    {
     "x": 7.657,
     "y": 5.613,
     "w": 2.006,
     "h": 0.451,
     "slide": 5
    }
   ],
   "sub": "Entrega e prazo de 7 dias · Desistiu da compra · CDC Art. 49"
  },
  {
   "n": 9,
   "titulo": "5. Arrependimento (2/3)",
   "links": [
    {
     "x": 4.032,
     "y": 3.837,
     "w": 2.388,
     "h": 0.537,
     "slide": 5
    },
    {
     "x": 10.344,
     "y": 3.837,
     "w": 2.536,
     "h": 0.537,
     "slide": 10
    },
    {
     "x": 2.302,
     "y": 2.495,
     "w": 1.288,
     "h": 0.483,
     "slide": 8
    }
   ],
   "sub": "Fotos e etiqueta reversa · Desistiu da compra · CDC Art. 49"
  },
  {
   "n": 10,
   "titulo": "5. Arrependimento (3/3)",
   "links": [
    {
     "x": 6.734,
     "y": 5.434,
     "w": 2.251,
     "h": 0.523,
     "slide": 14
    },
    {
     "x": 4.247,
     "y": 5.434,
     "w": 2.199,
     "h": 0.523,
     "slide": 14
    },
    {
     "x": 5.981,
     "y": 1.2,
     "w": 1.217,
     "h": 0.471,
     "slide": 8
    }
   ],
   "sub": "O produto volta à LogHouse · Desistiu da compra · CDC Art. 49"
  },
  {
   "n": 11,
   "titulo": "6. Entregue e não recebido",
   "links": [
    {
     "x": 6.098,
     "y": 5.188,
     "w": 2.053,
     "h": 0.478,
     "slide": 14
    }
   ],
   "sub": "Rastreio diz entregue · CDC Art. 35"
  },
  {
   "n": 12,
   "titulo": "7. Atraso / extravio",
   "links": [
    {
     "x": 1.144,
     "y": 4.125,
     "w": 2.372,
     "h": 0.527,
     "slide": 13
    },
    {
     "x": 7.732,
     "y": 4.125,
     "w": 2.266,
     "h": 0.527,
     "slide": 14
    }
   ],
   "sub": "Ainda não chegou · CDC Art. 35"
  },
  {
   "n": 13,
   "titulo": "8. Devolvido ao remetente",
   "links": [
    {
     "x": 3.486,
     "y": 3.385,
     "w": 1.717,
     "h": 0.528,
     "slide": 8
    },
    {
     "x": 5.229,
     "y": 5.465,
     "w": 2.271,
     "h": 0.528,
     "slide": 14
    }
   ],
   "sub": "Voltou para nós · CDC Art. 35"
  },
  {
   "n": 14,
   "titulo": "Reembolso pelo Financeiro",
   "links": [],
   "sub": "Quem atende não faz reembolso: pede ao Financeiro, que paga com comprovante; o caso volta para avisar o cliente."
  }
 ]
} as {
  largura: number; altura: number; reembolso: number;
  tipos: Record<string, number>;
  slides: SlideDoFluxo[];
};
