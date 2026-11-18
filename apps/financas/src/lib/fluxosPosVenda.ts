// GERADO por docs/posvenda/publicar-nos-apps.mjs — não editar.
// Os slides de docs/posvenda/fluxos-pos-venda.pptx: título e conectores
// clicáveis (em polegadas, slide de 13.333 × 7.5).
export interface Caixa { x: number; y: number; w: number; h: number }
export interface LinkDoSlide extends Caixa { slide: number }
export interface SlideDoFluxo { n: number; titulo: string; sub?: string; links: LinkDoSlide[]; passos?: Record<string, Caixa> }

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
 "passos": {
  "faltante": {
   "fotos": 3,
   "lacre": 3,
   "transportadora": 3,
   "conferir": 3,
   "explicar": 3,
   "escolha": 3,
   "reenvio": 3,
   "reembolso_parcial": 14,
   "reembolso_parcial_financeiro": 14,
   "reembolso_parcial_comprovante": 14,
   "reembolso_integral": 14,
   "reembolso_integral_financeiro": 14,
   "reembolso_integral_comprovante": 14
  },
  "avaria": {
   "fotos": 4,
   "origem": 4,
   "transportadora": 4,
   "escolha": 4,
   "troca": 4,
   "reembolso_parcial": 14,
   "reembolso_parcial_financeiro": 14,
   "reembolso_parcial_comprovante": 14,
   "reembolso_integral": 14,
   "reembolso_integral_financeiro": 14,
   "reembolso_integral_comprovante": 14
  },
  "defeito": {
   "relato": 5,
   "orientar": 5,
   "fotos": 5,
   "analise": 5,
   "recolher": 6,
   "chegou": 6,
   "conferir": 6,
   "escolha": 5,
   "troca": 5,
   "reembolso_parcial": 14,
   "reembolso_parcial_financeiro": 14,
   "reembolso_parcial_comprovante": 14,
   "reembolso_integral": 14,
   "reembolso_integral_financeiro": 14,
   "reembolso_integral_comprovante": 14,
   "recusa": 5
  },
  "errado": {
   "fotos": 7,
   "confere": 7,
   "escolha": 7,
   "troca": 7,
   "recolher": 7,
   "reembolso_integral": 14,
   "reembolso_integral_financeiro": 14,
   "reembolso_integral_comprovante": 14,
   "recusa": 7
  },
  "arrependimento": {
   "entregue": 8,
   "cancelar": 8,
   "recusar_entrega": 8,
   "prazo": 8,
   "fora_prazo": 8,
   "recusa_prazo": 8,
   "fotos": 9,
   "estado": 9,
   "aberto": 9,
   "recusa_aberto": 9,
   "reversa": 9,
   "chegou": 10,
   "conferir": 10,
   "reavaliar": 10,
   "escolha": 10,
   "troca": 10,
   "recusa_conferencia": 10,
   "reembolso_parcial": 14,
   "reembolso_parcial_financeiro": 14,
   "reembolso_parcial_comprovante": 14,
   "reembolso_integral": 14,
   "reembolso_integral_financeiro": 14,
   "reembolso_integral_comprovante": 14
  },
  "nao_recebido": {
   "comprovante": 11,
   "vizinhos": 11,
   "achou": 11,
   "chamado": 11,
   "resultado": 11,
   "comprovada": 11,
   "escolha": 11,
   "reenvio": 11,
   "reembolso_integral": 14,
   "reembolso_integral_financeiro": 14,
   "reembolso_integral_comprovante": 14
  },
  "atraso": {
   "rastreio": 12,
   "informar": 12,
   "acompanhar": 12,
   "chamado": 12,
   "resultado": 12,
   "escolha": 12,
   "reenvio": 12,
   "reembolso_integral": 14,
   "reembolso_integral_financeiro": 14,
   "reembolso_integral_comprovante": 14
  },
  "devolvido": {
   "motivo": 13,
   "endereco": 13,
   "quer": 13,
   "reenvio": 13,
   "reembolso_integral": 14,
   "reembolso_integral_financeiro": 14,
   "reembolso_integral_comprovante": 14
  },
  "outro": {
   "registro": 2
  }
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
   "sub": "O sistema lê a reclamação no WhatsApp e sugere o tipo; quem atende confirma ao abrir o caso.",
   "passos": {
    "abrir": {
     "x": 4.06,
     "y": 3.644,
     "w": 1.78,
     "h": 0.788
    },
    "qual": {
     "x": 6.467,
     "y": 3.775,
     "w": 1.578,
     "h": 0.525
    }
   }
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
   "sub": "Chegou incompleto · CDC Art. 19 · resolver em até 30 dias (Art. 18, § 1º)",
   "passos": {
    "fotos": {
     "x": 2.483,
     "y": 2.64,
     "w": 1.485,
     "h": 0.405
    },
    "lacre": {
     "x": 2.213,
     "y": 3.72,
     "w": 1.822,
     "h": 0.99
    },
    "transportadora": {
     "x": 1.549,
     "y": 5.227,
     "w": 1.62,
     "h": 0.731
    },
    "conferir": {
     "x": 1.887,
     "y": 6.285,
     "w": 2.25,
     "h": 0.765
    },
    "explicar": {
     "x": 6.038,
     "y": 1.2,
     "w": 1.98,
     "h": 0.765
    },
    "escolha": {
     "x": 7.872,
     "y": 2.482,
     "w": 1.733,
     "h": 0.72
    },
    "reenvio": {
     "x": 10.127,
     "y": 3.911,
     "w": 1.654,
     "h": 0.607
    }
   }
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
   "sub": "Chegou danificado · CDC Art. 18 · resolver em até 30 dias (Art. 18, § 1º)",
   "passos": {
    "fotos": {
     "x": 1.441,
     "y": 3.218,
     "w": 2.013,
     "h": 0.549
    },
    "origem": {
     "x": 1.334,
     "y": 4.468,
     "w": 2.228,
     "h": 0.549
    },
    "transportadora": {
     "x": 3.5,
     "y": 5.856,
     "w": 2.196,
     "h": 0.991
    },
    "escolha": {
     "x": 7.13,
     "y": 1.403,
     "w": 2.349,
     "h": 0.976
    },
    "troca": {
     "x": 10.348,
     "y": 3.08,
     "w": 2.532,
     "h": 0.824
    }
   }
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
   "sub": "Relato, fotos e decisão · Problema no produto · CDC Art. 18 · resolver em até 30 dias (Art. 18, § 1º)",
   "passos": {
    "relato": {
     "x": 3.263,
     "y": 3.57,
     "w": 1.522,
     "h": 0.375
    },
    "orientar": {
     "x": 1.916,
     "y": 4.669,
     "w": 1.443,
     "h": 0.375
    },
    "fotos": {
     "x": 3.122,
     "y": 5.617,
     "w": 1.615,
     "h": 0.479
    },
    "analise": {
     "x": 9.046,
     "y": 2.273,
     "w": 1.875,
     "h": 0.667
    },
    "escolha": {
     "x": 7.379,
     "y": 3.424,
     "w": 1.605,
     "h": 0.667
    },
    "troca": {
     "x": 5.462,
     "y": 4.576,
     "w": 1.73,
     "h": 0.563
    },
    "recusa": {
     "x": 11.255,
     "y": 3.419,
     "w": 1.625,
     "h": 0.677
    }
   }
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
   "sub": "O produto volta para análise · Problema no produto · CDC Art. 18 · resolver em até 30 dias (Art. 18, § 1º)",
   "passos": {
    "recolher": {
     "x": 5.523,
     "y": 2.217,
     "w": 2.299,
     "h": 0.892
    },
    "chegou": {
     "x": 5.742,
     "y": 3.562,
     "w": 1.861,
     "h": 0.594
    },
    "conferir": {
     "x": 5.249,
     "y": 4.61,
     "w": 2.847,
     "h": 1.064
    }
   }
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
   "sub": "Veio outro produto · CDC Art. 18 · resolver em até 30 dias (Art. 18, § 1º)",
   "passos": {
    "fotos": {
     "x": 0.737,
     "y": 3.78,
     "w": 2.328,
     "h": 0.661
    },
    "confere": {
     "x": 0.45,
     "y": 5.03,
     "w": 2.903,
     "h": 0.977
    },
    "escolha": {
     "x": 4.329,
     "y": 2.393,
     "w": 2.099,
     "h": 0.517
    },
    "troca": {
     "x": 4.236,
     "y": 3.723,
     "w": 2.285,
     "h": 0.776
    },
    "recolher": {
     "x": 6.837,
     "y": 3.759,
     "w": 2.199,
     "h": 0.704
    },
    "recusa": {
     "x": 10.638,
     "y": 2.243,
     "w": 2.242,
     "h": 0.819
    }
   }
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
   "sub": "Entrega e prazo de 7 dias · Desistiu da compra · CDC Art. 49",
   "passos": {
    "entregue": {
     "x": 4.105,
     "y": 2.045,
     "w": 1.625,
     "h": 0.406
    },
    "cancelar": {
     "x": 1.937,
     "y": 3.127,
     "w": 1.837,
     "h": 0.428
    },
    "recusar_entrega": {
     "x": 4.242,
     "y": 3.127,
     "w": 1.353,
     "h": 0.428
    },
    "prazo": {
     "x": 6.304,
     "y": 2.868,
     "w": 1.826,
     "h": 0.947
    },
    "fora_prazo": {
     "x": 8.457,
     "y": 4.334,
     "w": 1.713,
     "h": 0.721
    },
    "recusa_prazo": {
     "x": 9.911,
     "y": 5.472,
     "w": 1.758,
     "h": 0.733
    }
   }
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
   "sub": "Fotos e etiqueta reversa · Desistiu da compra · CDC Art. 49",
   "passos": {
    "fotos": {
     "x": 1.51,
     "y": 3.796,
     "w": 2.227,
     "h": 0.617
    },
    "estado": {
     "x": 1.376,
     "y": 5.037,
     "w": 2.495,
     "h": 0.912
    },
    "aberto": {
     "x": 4.489,
     "y": 2.307,
     "w": 1.476,
     "h": 0.859
    },
    "recusa_aberto": {
     "x": 6.716,
     "y": 3.669,
     "w": 2.093,
     "h": 0.872
    },
    "reversa": {
     "x": 10.626,
     "y": 2.3,
     "w": 1.972,
     "h": 0.872
    }
   }
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
   "sub": "O produto volta à LogHouse · Desistiu da compra · CDC Art. 49",
   "passos": {
    "chegou": {
     "x": 5.811,
     "y": 2.051,
     "w": 1.557,
     "h": 0.497
    },
    "conferir": {
     "x": 5.485,
     "y": 2.928,
     "w": 2.21,
     "h": 0.471
    },
    "reavaliar": {
     "x": 4.688,
     "y": 4.066,
     "w": 1.71,
     "h": 0.471
    },
    "escolha": {
     "x": 6.878,
     "y": 3.883,
     "w": 1.963,
     "h": 0.838
    },
    "troca": {
     "x": 9.279,
     "y": 5.414,
     "w": 2.133,
     "h": 0.563
    },
    "recusa_conferencia": {
     "x": 1.918,
     "y": 5.322,
     "w": 2.042,
     "h": 0.746
    }
   }
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
   "sub": "Rastreio diz entregue · CDC Art. 35",
   "passos": {
    "comprovante": {
     "x": 3.197,
     "y": 2.74,
     "w": 1.934,
     "h": 0.454
    },
    "vizinhos": {
     "x": 3.334,
     "y": 3.856,
     "w": 1.66,
     "h": 0.681
    },
    "achou": {
     "x": 3.364,
     "y": 5.02,
     "w": 1.6,
     "h": 0.812
    },
    "chamado": {
     "x": 3.304,
     "y": 6.274,
     "w": 1.719,
     "h": 0.776
    },
    "resultado": {
     "x": 6.026,
     "y": 1.2,
     "w": 1.791,
     "h": 0.812
    },
    "comprovada": {
     "x": 5.943,
     "y": 2.561,
     "w": 1.958,
     "h": 0.812
    },
    "escolha": {
     "x": 7.256,
     "y": 3.815,
     "w": 1.839,
     "h": 0.764
    },
    "reenvio": {
     "x": 8.414,
     "y": 5.104,
     "w": 1.719,
     "h": 0.645
    }
   }
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
   "sub": "Ainda não chegou · CDC Art. 35",
   "passos": {
    "rastreio": {
     "x": 3.914,
     "y": 2.768,
     "w": 2.05,
     "h": 0.474
    },
    "informar": {
     "x": 3.806,
     "y": 4.085,
     "w": 1.818,
     "h": 0.606
    },
    "acompanhar": {
     "x": 3.84,
     "y": 5.232,
     "w": 1.75,
     "h": 0.474
    },
    "chamado": {
     "x": 5.097,
     "y": 6.194,
     "w": 1.897,
     "h": 0.856
    },
    "resultado": {
     "x": 7.047,
     "y": 1.2,
     "w": 1.976,
     "h": 0.896
    },
    "escolha": {
     "x": 7.851,
     "y": 2.583,
     "w": 2.029,
     "h": 0.843
    },
    "reenvio": {
     "x": 10.288,
     "y": 4.033,
     "w": 1.897,
     "h": 0.711
    }
   }
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
   "sub": "Voltou para nós · CDC Art. 35",
   "passos": {
    "motivo": {
     "x": 4.743,
     "y": 2.19,
     "w": 1.685,
     "h": 0.475
    },
    "endereco": {
     "x": 5.751,
     "y": 3.273,
     "w": 1.783,
     "h": 0.753
    },
    "quer": {
     "x": 5.69,
     "y": 4.409,
     "w": 1.904,
     "h": 0.475
    },
    "reenvio": {
     "x": 7.797,
     "y": 5.373,
     "w": 2.047,
     "h": 0.713
    }
   }
  },
  {
   "n": 14,
   "titulo": "Reembolso pelo Financeiro",
   "links": [],
   "sub": "Quem atende não faz reembolso: pede ao Financeiro, que paga com comprovante; o caso volta para avisar o cliente.",
   "passos": {
    "pedir": {
     "x": 6.507,
     "y": 1.919,
     "w": 1.46,
     "h": 0.774
    },
    "aviso": {
     "x": 4.467,
     "y": 3.157,
     "w": 1.714,
     "h": 0.398
    },
    "ok": {
     "x": 4.8,
     "y": 3.931,
     "w": 1.49,
     "h": 0.398
    },
    "pagar": {
     "x": 4.948,
     "y": 4.739,
     "w": 1.194,
     "h": 0.476
    },
    "devolver": {
     "x": 6.491,
     "y": 4.777,
     "w": 1.471,
     "h": 0.398
    },
    "corrigir": {
     "x": 7.248,
     "y": 5.679,
     "w": 1.615,
     "h": 0.398
    },
    "comprovante": {
     "x": 4.705,
     "y": 5.535,
     "w": 1.681,
     "h": 0.686
    },
    "voltar": {
     "x": 6.424,
     "y": 3.102,
     "w": 1.626,
     "h": 0.509
    },
    "reembolso_parcial": {
     "x": 6.507,
     "y": 1.919,
     "w": 1.46,
     "h": 0.774
    },
    "reembolso_parcial_financeiro": {
     "x": 4.467,
     "y": 3.157,
     "w": 1.714,
     "h": 0.398
    },
    "reembolso_parcial_comprovante": {
     "x": 4.705,
     "y": 5.535,
     "w": 1.681,
     "h": 0.686
    },
    "reembolso_integral": {
     "x": 6.507,
     "y": 1.919,
     "w": 1.46,
     "h": 0.774
    },
    "reembolso_integral_financeiro": {
     "x": 4.467,
     "y": 3.157,
     "w": 1.714,
     "h": 0.398
    },
    "reembolso_integral_comprovante": {
     "x": 4.705,
     "y": 5.535,
     "w": 1.681,
     "h": 0.686
    }
   }
  }
 ]
} as {
  largura: number; altura: number; reembolso: number;
  tipos: Record<string, number>;
  /** tipo → passo → slide em que ele está desenhado. */
  passos: Record<string, Record<string, number>>;
  slides: SlideDoFluxo[];
};
