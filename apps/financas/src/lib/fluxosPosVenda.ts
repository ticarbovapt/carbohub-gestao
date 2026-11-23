// GERADO por docs/posvenda/publicar-nos-apps.mjs — não editar.
// Os slides de docs/posvenda/fluxos-pos-venda.pptx: título e conectores
// clicáveis (em polegadas, slide de 13.333 × 7.5).
export interface Caixa { x: number; y: number; w: number; h: number }
export interface LinkDoSlide extends Caixa { slide: number }
export interface VaiAoPasso extends Caixa { passo: number }
export interface SlideDoFluxo {
  n: number; titulo: string; sub?: string; links: LinkDoSlide[]; passos?: Record<string, Caixa>;
  /** A caixa de cada passo NUMERADO do slide (o número que aparece no desenho). */
  caixas?: Record<string, Caixa>;
  /** Os avisos "→ vá ao passo N": clicar acende a caixa do passo N. */
  vai?: VaiAoPasso[];
}

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
     "x": 0.512,
     "y": 4.639,
     "w": 1.266,
     "h": 0.352,
     "slide": 3
    },
    {
     "x": 1.928,
     "y": 4.639,
     "w": 1.266,
     "h": 0.352,
     "slide": 4
    },
    {
     "x": 3.343,
     "y": 4.639,
     "w": 1.266,
     "h": 0.352,
     "slide": 5
    },
    {
     "x": 4.759,
     "y": 4.639,
     "w": 1.266,
     "h": 0.352,
     "slide": 7
    },
    {
     "x": 6.174,
     "y": 4.639,
     "w": 1.266,
     "h": 0.352,
     "slide": 8
    },
    {
     "x": 7.59,
     "y": 4.639,
     "w": 1.266,
     "h": 0.352,
     "slide": 11
    },
    {
     "x": 9.005,
     "y": 4.639,
     "w": 1.266,
     "h": 0.352,
     "slide": 12
    },
    {
     "x": 10.421,
     "y": 4.639,
     "w": 1.266,
     "h": 0.352,
     "slide": 13
    }
   ],
   "sub": "O sistema lê a reclamação no WhatsApp e sugere o tipo; quem atende confirma ao abrir o caso.",
   "caixas": {
    "1": {
     "x": 6.138,
     "y": 3.65,
     "w": 1.343,
     "h": 0.276
    },
    "2": {
     "x": 6.174,
     "y": 4.081,
     "w": 1.266,
     "h": 0.258
    }
   },
   "passos": {
    "abrir": {
     "x": 6.138,
     "y": 3.65,
     "w": 1.343,
     "h": 0.276
    },
    "qual": {
     "x": 6.174,
     "y": 4.081,
     "w": 1.266,
     "h": 0.258
    }
   }
  },
  {
   "n": 3,
   "titulo": "1. Produto faltante",
   "links": [
    {
     "x": 8.484,
     "y": 4.287,
     "w": 2.028,
     "h": 0.596,
     "slide": 14
    },
    {
     "x": 10.753,
     "y": 4.287,
     "w": 2.028,
     "h": 0.596,
     "slide": 14
    }
   ],
   "sub": "Chegou incompleto · CDC Art. 19 · resolver em até 30 dias (Art. 18, § 1º)",
   "caixas": {
    "1": {
     "x": 1.195,
     "y": 2.319,
     "w": 2.152,
     "h": 0.442
    },
    "2": {
     "x": 1.253,
     "y": 3.009,
     "w": 2.028,
     "h": 0.496
    },
    "3": {
     "x": 1.526,
     "y": 4.191,
     "w": 2.152,
     "h": 0.718
    },
    "4": {
     "x": 1.253,
     "y": 5.158,
     "w": 2.028,
     "h": 0.496
    },
    "5": {
     "x": 4.975,
     "y": 1.629,
     "w": 2.028,
     "h": 0.496
    },
    "6": {
     "x": 6.672,
     "y": 2.934,
     "w": 2.028,
     "h": 0.478
    },
    "7": {
     "x": 6.1,
     "y": 4.287,
     "w": 2.152,
     "h": 0.596
    }
   },
   "passos": {
    "fotos": {
     "x": 1.195,
     "y": 2.319,
     "w": 2.152,
     "h": 0.442
    },
    "lacre": {
     "x": 1.253,
     "y": 3.009,
     "w": 2.028,
     "h": 0.496
    },
    "transportadora": {
     "x": 1.526,
     "y": 4.191,
     "w": 2.152,
     "h": 0.718
    },
    "conferir": {
     "x": 1.253,
     "y": 5.158,
     "w": 2.028,
     "h": 0.496
    },
    "explicar": {
     "x": 4.975,
     "y": 1.629,
     "w": 2.028,
     "h": 0.496
    },
    "escolha": {
     "x": 6.672,
     "y": 2.934,
     "w": 2.028,
     "h": 0.478
    },
    "reenvio": {
     "x": 6.1,
     "y": 4.287,
     "w": 2.152,
     "h": 0.596
    }
   },
   "vai": [
    {
     "x": 1.327,
     "y": 6.34,
     "w": 1.2,
     "h": 0.281,
     "passo": 6
    },
    {
     "x": 2.76,
     "y": 6.34,
     "w": 1.2,
     "h": 0.281,
     "passo": 5
    }
   ]
  },
  {
   "n": 4,
   "titulo": "2. Avaria / vazamento",
   "links": [
    {
     "x": 2.726,
     "y": 5.106,
     "w": 2.196,
     "h": 0.646,
     "slide": 5
    },
    {
     "x": 8.121,
     "y": 4.498,
     "w": 2.196,
     "h": 0.646,
     "slide": 14
    },
    {
     "x": 10.577,
     "y": 4.498,
     "w": 2.196,
     "h": 0.646,
     "slide": 14
    }
   ],
   "sub": "Chegou danificado · CDC Art. 18 · resolver em até 30 dias (Art. 18, § 1º)",
   "caixas": {
    "1": {
     "x": 1.033,
     "y": 2.901,
     "w": 2.33,
     "h": 0.479
    },
    "2": {
     "x": 1.095,
     "y": 3.649,
     "w": 2.196,
     "h": 0.448
    },
    "3": {
     "x": 6.096,
     "y": 1.987,
     "w": 2.33,
     "h": 0.778
    },
    "4": {
     "x": 6.159,
     "y": 3.034,
     "w": 2.196,
     "h": 0.517
    },
    "5": {
     "x": 5.54,
     "y": 4.498,
     "w": 2.33,
     "h": 0.646
    }
   },
   "passos": {
    "fotos": {
     "x": 1.033,
     "y": 2.901,
     "w": 2.33,
     "h": 0.479
    },
    "origem": {
     "x": 1.095,
     "y": 3.649,
     "w": 2.196,
     "h": 0.448
    },
    "transportadora": {
     "x": 6.096,
     "y": 1.987,
     "w": 2.33,
     "h": 0.778
    },
    "escolha": {
     "x": 6.159,
     "y": 3.034,
     "w": 2.196,
     "h": 0.517
    },
    "troca": {
     "x": 5.54,
     "y": 4.498,
     "w": 2.33,
     "h": 0.646
    }
   },
   "vai": [
    {
     "x": 1.176,
     "y": 5.106,
     "w": 1.299,
     "h": 0.305,
     "passo": 3
    }
   ]
  },
  {
   "n": 5,
   "titulo": "3. Defeito / não funcionou (1/2)",
   "links": [
    {
     "x": 2.772,
     "y": 4.95,
     "w": 1.486,
     "h": 0.324,
     "slide": 8
    },
    {
     "x": 6.247,
     "y": 3.513,
     "w": 1.486,
     "h": 0.55,
     "slide": 6
    },
    {
     "x": 7.908,
     "y": 4.565,
     "w": 1.486,
     "h": 0.437,
     "slide": 14
    },
    {
     "x": 9.569,
     "y": 4.565,
     "w": 1.486,
     "h": 0.437,
     "slide": 14
    },
    {
     "x": 8.781,
     "y": 3.007,
     "w": 1.486,
     "h": 0.324,
     "slide": 6
    },
    {
     "x": 11.322,
     "y": 3.007,
     "w": 1.486,
     "h": 0.324,
     "slide": 6
    }
   ],
   "sub": "Relato, fotos e decisão · Problema no produto · CDC Art. 18 · resolver em até 30 dias (Art. 18, § 1º)",
   "caixas": {
    "1": {
     "x": 1.056,
     "y": 3.094,
     "w": 1.486,
     "h": 0.303
    },
    "2": {
     "x": 2.227,
     "y": 4.002,
     "w": 1.486,
     "h": 0.303
    },
    "3": {
     "x": 1.026,
     "y": 4.95,
     "w": 1.576,
     "h": 0.437
    },
    "4": {
     "x": 7.241,
     "y": 2.475,
     "w": 1.486,
     "h": 0.35
    },
    "5": {
     "x": 11.019,
     "y": 3.52,
     "w": 1.576,
     "h": 0.526
    },
    "6": {
     "x": 7.908,
     "y": 3.633,
     "w": 1.486,
     "h": 0.35
    },
    "7": {
     "x": 6.162,
     "y": 4.565,
     "w": 1.576,
     "h": 0.437
    }
   },
   "passos": {
    "relato": {
     "x": 1.056,
     "y": 3.094,
     "w": 1.486,
     "h": 0.303
    },
    "orientar": {
     "x": 2.227,
     "y": 4.002,
     "w": 1.486,
     "h": 0.303
    },
    "fotos": {
     "x": 1.026,
     "y": 4.95,
     "w": 1.576,
     "h": 0.437
    },
    "analise": {
     "x": 7.241,
     "y": 2.475,
     "w": 1.486,
     "h": 0.35
    },
    "escolha": {
     "x": 7.908,
     "y": 3.633,
     "w": 1.486,
     "h": 0.35
    },
    "troca": {
     "x": 6.162,
     "y": 4.565,
     "w": 1.576,
     "h": 0.437
    },
    "recusa": {
     "x": 11.019,
     "y": 3.52,
     "w": 1.576,
     "h": 0.526
    }
   },
   "vai": [
    {
     "x": 1.372,
     "y": 5.569,
     "w": 0.879,
     "h": 0.206,
     "passo": 4
    }
   ]
  },
  {
   "n": 6,
   "titulo": "3. Defeito / não funcionou (2/2)",
   "links": [
    {
     "x": 3.762,
     "y": 5.901,
     "w": 2.741,
     "h": 0.806,
     "slide": 5
    },
    {
     "x": 6.827,
     "y": 5.901,
     "w": 2.741,
     "h": 1.014,
     "slide": 5
    },
    {
     "x": 4.22,
     "y": 1.334,
     "w": 2.741,
     "h": 0.597,
     "slide": 5
    }
   ],
   "sub": "O produto volta para análise · Problema no produto · CDC Art. 18 · resolver em até 30 dias (Art. 18, § 1º)",
   "caixas": {
    "1": {
     "x": 4.142,
     "y": 2.267,
     "w": 2.909,
     "h": 0.806
    },
    "2": {
     "x": 4.142,
     "y": 3.409,
     "w": 2.909,
     "h": 0.559
    },
    "3": {
     "x": 4.22,
     "y": 4.304,
     "w": 2.741,
     "h": 0.67
    }
   },
   "passos": {
    "recolher": {
     "x": 4.142,
     "y": 2.267,
     "w": 2.909,
     "h": 0.806
    },
    "chegou": {
     "x": 4.142,
     "y": 3.409,
     "w": 2.909,
     "h": 0.559
    },
    "conferir": {
     "x": 4.22,
     "y": 4.304,
     "w": 2.741,
     "h": 0.67
    }
   }
  },
  {
   "n": 7,
   "titulo": "4. Produto errado",
   "links": [
    {
     "x": 9.014,
     "y": 2.178,
     "w": 2.412,
     "h": 0.709,
     "slide": 14
    }
   ],
   "sub": "Veio outro produto · CDC Art. 18 · resolver em até 30 dias (Art. 18, § 1º)",
   "caixas": {
    "1": {
     "x": 5.113,
     "y": 2.139,
     "w": 2.56,
     "h": 0.709
    },
    "2": {
     "x": 5.182,
     "y": 3.144,
     "w": 2.412,
     "h": 0.59
    },
    "3": {
     "x": 5.507,
     "y": 4.696,
     "w": 2.56,
     "h": 0.709
    },
    "4": {
     "x": 2.809,
     "y": 4.841,
     "w": 2.412,
     "h": 0.492
    },
    "5": {
     "x": 8.945,
     "y": 1.318,
     "w": 2.56,
     "h": 0.564
    },
    "6": {
     "x": 8.945,
     "y": 3.084,
     "w": 2.56,
     "h": 0.709
    }
   },
   "passos": {
    "fotos": {
     "x": 5.113,
     "y": 2.139,
     "w": 2.56,
     "h": 0.709
    },
    "confere": {
     "x": 5.182,
     "y": 3.144,
     "w": 2.412,
     "h": 0.59
    },
    "escolha": {
     "x": 2.809,
     "y": 4.841,
     "w": 2.412,
     "h": 0.492
    },
    "troca": {
     "x": 8.945,
     "y": 3.084,
     "w": 2.56,
     "h": 0.709
    },
    "recolher": {
     "x": 8.945,
     "y": 1.318,
     "w": 2.56,
     "h": 0.564
    },
    "recusa": {
     "x": 5.507,
     "y": 4.696,
     "w": 2.56,
     "h": 0.709
    }
   },
   "vai": [
    {
     "x": 2.445,
     "y": 6.368,
     "w": 1.428,
     "h": 0.335,
     "passo": 6
    },
    {
     "x": 4.148,
     "y": 6.368,
     "w": 1.428,
     "h": 0.335,
     "passo": 5
    }
   ]
  },
  {
   "n": 8,
   "titulo": "5. Arrependimento (1/3)",
   "links": [
    {
     "x": 6.124,
     "y": 4.754,
     "w": 1.907,
     "h": 0.561,
     "slide": 14
    },
    {
     "x": 3.882,
     "y": 4.754,
     "w": 1.907,
     "h": 0.561,
     "slide": 10
    },
    {
     "x": 0.8,
     "y": 5.548,
     "w": 1.907,
     "h": 0.561,
     "slide": 9
    },
    {
     "x": 8.63,
     "y": 3.367,
     "w": 1.907,
     "h": 0.561,
     "slide": 5
    }
   ],
   "sub": "Entrega e prazo de 7 dias · Desistiu da compra · CDC Art. 49",
   "caixas": {
    "1": {
     "x": 3.882,
     "y": 2.905,
     "w": 1.907,
     "h": 0.389
    },
    "2": {
     "x": 1.119,
     "y": 3.939,
     "w": 1.907,
     "h": 0.581
    },
    "3": {
     "x": 3.828,
     "y": 4.007,
     "w": 2.024,
     "h": 0.446
    },
    "4": {
     "x": 6.07,
     "y": 4.007,
     "w": 2.024,
     "h": 0.446
    },
    "5": {
     "x": 10.506,
     "y": 2.141,
     "w": 1.907,
     "h": 0.581
    },
    "6": {
     "x": 10.763,
     "y": 3.367,
     "w": 2.024,
     "h": 0.676
    }
   },
   "passos": {
    "entregue": {
     "x": 3.882,
     "y": 2.905,
     "w": 1.907,
     "h": 0.389
    },
    "cancelar": {
     "x": 6.07,
     "y": 4.007,
     "w": 2.024,
     "h": 0.446
    },
    "recusar_entrega": {
     "x": 3.828,
     "y": 4.007,
     "w": 2.024,
     "h": 0.446
    },
    "prazo": {
     "x": 1.119,
     "y": 3.939,
     "w": 1.907,
     "h": 0.581
    },
    "fora_prazo": {
     "x": 10.506,
     "y": 2.141,
     "w": 1.907,
     "h": 0.581
    },
    "recusa_prazo": {
     "x": 10.763,
     "y": 3.367,
     "w": 2.024,
     "h": 0.676
    }
   },
   "vai": [
    {
     "x": 2.933,
     "y": 5.548,
     "w": 1.129,
     "h": 0.265,
     "passo": 5
    }
   ]
  },
  {
   "n": 9,
   "titulo": "5. Arrependimento (2/3)",
   "links": [
    {
     "x": 4.928,
     "y": 5.576,
     "w": 2.563,
     "h": 0.754,
     "slide": 5
    },
    {
     "x": 5.001,
     "y": 3.142,
     "w": 2.563,
     "h": 0.754,
     "slide": 10
    },
    {
     "x": 0.785,
     "y": 1.92,
     "w": 2.563,
     "h": 0.559,
     "slide": 8
    }
   ],
   "sub": "Fotos e etiqueta reversa · Desistiu da compra · CDC Art. 49",
   "caixas": {
    "1": {
     "x": 0.712,
     "y": 2.793,
     "w": 2.72,
     "h": 0.754
    },
    "2": {
     "x": 0.785,
     "y": 3.86,
     "w": 2.563,
     "h": 0.627
    },
    "3": {
     "x": 4.928,
     "y": 1.92,
     "w": 2.72,
     "h": 0.908
    },
    "4": {
     "x": 5.357,
     "y": 4.105,
     "w": 2.563,
     "h": 0.604
    },
    "5": {
     "x": 10.034,
     "y": 1.92,
     "w": 2.72,
     "h": 0.908
    }
   },
   "passos": {
    "fotos": {
     "x": 0.712,
     "y": 2.793,
     "w": 2.72,
     "h": 0.754
    },
    "estado": {
     "x": 0.785,
     "y": 3.86,
     "w": 2.563,
     "h": 0.627
    },
    "aberto": {
     "x": 5.357,
     "y": 4.105,
     "w": 2.563,
     "h": 0.604
    },
    "recusa_aberto": {
     "x": 10.034,
     "y": 1.92,
     "w": 2.72,
     "h": 0.908
    },
    "reversa": {
     "x": 4.928,
     "y": 1.92,
     "w": 2.72,
     "h": 0.908
    }
   },
   "vai": [
    {
     "x": 0.879,
     "y": 5.354,
     "w": 1.517,
     "h": 0.356,
     "passo": 3
    },
    {
     "x": 2.689,
     "y": 5.354,
     "w": 1.517,
     "h": 0.356,
     "passo": 4
    },
    {
     "x": 7.795,
     "y": 5.576,
     "w": 1.517,
     "h": 0.356,
     "passo": 5
    }
   ]
  },
  {
   "n": 10,
   "titulo": "5. Arrependimento (3/3)",
   "links": [
    {
     "x": 4.485,
     "y": 5.171,
     "w": 2.054,
     "h": 0.604,
     "slide": 14
    },
    {
     "x": 6.782,
     "y": 5.171,
     "w": 2.054,
     "h": 0.604,
     "slide": 14
    },
    {
     "x": 4.091,
     "y": 1.301,
     "w": 2.054,
     "h": 0.448,
     "slide": 8
    }
   ],
   "sub": "O produto volta à LogHouse · Desistiu da compra · CDC Art. 49",
   "caixas": {
    "1": {
     "x": 4.033,
     "y": 2,
     "w": 2.18,
     "h": 0.419
    },
    "2": {
     "x": 4.091,
     "y": 2.67,
     "w": 2.054,
     "h": 0.502
    },
    "3": {
     "x": 3.748,
     "y": 3.867,
     "w": 2.054,
     "h": 0.484
    },
    "4": {
     "x": 6.782,
     "y": 3.916,
     "w": 2.054,
     "h": 0.419
    },
    "5": {
     "x": 9.079,
     "y": 5.171,
     "w": 2.18,
     "h": 0.604
    },
    "6": {
     "x": 2.071,
     "y": 5.249,
     "w": 2.18,
     "h": 0.448
    }
   },
   "passos": {
    "chegou": {
     "x": 4.033,
     "y": 2,
     "w": 2.18,
     "h": 0.419
    },
    "conferir": {
     "x": 4.091,
     "y": 2.67,
     "w": 2.054,
     "h": 0.502
    },
    "reavaliar": {
     "x": 6.782,
     "y": 3.916,
     "w": 2.054,
     "h": 0.419
    },
    "escolha": {
     "x": 3.748,
     "y": 3.867,
     "w": 2.054,
     "h": 0.484
    },
    "troca": {
     "x": 2.071,
     "y": 5.249,
     "w": 2.18,
     "h": 0.448
    },
    "recusa_conferencia": {
     "x": 9.079,
     "y": 5.171,
     "w": 2.18,
     "h": 0.604
    }
   }
  },
  {
   "n": 11,
   "titulo": "6. Entregue e não recebido",
   "links": [
    {
     "x": 9.936,
     "y": 3.4,
     "w": 1.825,
     "h": 0.537,
     "slide": 14
    }
   ],
   "sub": "Rastreio diz entregue · CDC Art. 35",
   "caixas": {
    "1": {
     "x": 3.044,
     "y": 2.05,
     "w": 1.937,
     "h": 0.427
    },
    "2": {
     "x": 3.044,
     "y": 2.7,
     "w": 1.937,
     "h": 0.676
    },
    "3": {
     "x": 3.096,
     "y": 3.599,
     "w": 1.825,
     "h": 0.446
    },
    "4": {
     "x": 3.342,
     "y": 4.663,
     "w": 1.937,
     "h": 0.647
    },
    "5": {
     "x": 3.394,
     "y": 5.533,
     "w": 1.825,
     "h": 0.446
    },
    "6": {
     "x": 6.792,
     "y": 1.289,
     "w": 1.825,
     "h": 0.446
    },
    "7": {
     "x": 8.148,
     "y": 2.353,
     "w": 1.825,
     "h": 0.43
    },
    "8": {
     "x": 7.79,
     "y": 3.4,
     "w": 1.937,
     "h": 0.537
    }
   },
   "passos": {
    "comprovante": {
     "x": 3.044,
     "y": 2.05,
     "w": 1.937,
     "h": 0.427
    },
    "vizinhos": {
     "x": 3.044,
     "y": 2.7,
     "w": 1.937,
     "h": 0.676
    },
    "achou": {
     "x": 3.096,
     "y": 3.599,
     "w": 1.825,
     "h": 0.446
    },
    "chamado": {
     "x": 3.342,
     "y": 4.663,
     "w": 1.937,
     "h": 0.647
    },
    "resultado": {
     "x": 3.394,
     "y": 5.533,
     "w": 1.825,
     "h": 0.446
    },
    "comprovada": {
     "x": 6.792,
     "y": 1.289,
     "w": 1.825,
     "h": 0.446
    },
    "escolha": {
     "x": 8.148,
     "y": 2.353,
     "w": 1.825,
     "h": 0.43
    },
    "reenvio": {
     "x": 7.79,
     "y": 3.4,
     "w": 1.937,
     "h": 0.537
    }
   },
   "vai": [
    {
     "x": 3.461,
     "y": 6.707,
     "w": 1.08,
     "h": 0.253,
     "passo": 6
    },
    {
     "x": 4.75,
     "y": 6.707,
     "w": 1.08,
     "h": 0.253,
     "passo": 7
    }
   ]
  },
  {
   "n": 12,
   "titulo": "7. Atraso / extravio",
   "links": [
    {
     "x": 4.376,
     "y": 3.599,
     "w": 1.927,
     "h": 0.567,
     "slide": 13
    },
    {
     "x": 10.858,
     "y": 4.983,
     "w": 1.927,
     "h": 0.567,
     "slide": 14
    }
   ],
   "sub": "Ainda não chegou · CDC Art. 35",
   "caixas": {
    "1": {
     "x": 1.292,
     "y": 2.374,
     "w": 1.927,
     "h": 0.393
    },
    "2": {
     "x": 0.749,
     "y": 3.673,
     "w": 2.045,
     "h": 0.42
    },
    "3": {
     "x": 0.804,
     "y": 4.402,
     "w": 1.927,
     "h": 0.393
    },
    "4": {
     "x": 7.483,
     "y": 1.718,
     "w": 2.045,
     "h": 0.683
    },
    "5": {
     "x": 7.538,
     "y": 2.637,
     "w": 1.927,
     "h": 0.471
    },
    "6": {
     "x": 8.97,
     "y": 3.877,
     "w": 1.927,
     "h": 0.454
    },
    "7": {
     "x": 8.592,
     "y": 4.983,
     "w": 2.045,
     "h": 0.567
    }
   },
   "passos": {
    "rastreio": {
     "x": 1.292,
     "y": 2.374,
     "w": 1.927,
     "h": 0.393
    },
    "informar": {
     "x": 0.749,
     "y": 3.673,
     "w": 2.045,
     "h": 0.42
    },
    "acompanhar": {
     "x": 0.804,
     "y": 4.402,
     "w": 1.927,
     "h": 0.393
    },
    "chamado": {
     "x": 7.483,
     "y": 1.718,
     "w": 2.045,
     "h": 0.683
    },
    "resultado": {
     "x": 7.538,
     "y": 2.637,
     "w": 1.927,
     "h": 0.471
    },
    "escolha": {
     "x": 8.97,
     "y": 3.877,
     "w": 1.927,
     "h": 0.454
    },
    "reenvio": {
     "x": 8.592,
     "y": 4.983,
     "w": 2.045,
     "h": 0.567
    }
   },
   "vai": [
    {
     "x": 3.015,
     "y": 3.599,
     "w": 1.141,
     "h": 0.267,
     "passo": 4
    },
    {
     "x": 2.417,
     "y": 5.447,
     "w": 1.141,
     "h": 0.267,
     "passo": 4
    },
    {
     "x": 7.609,
     "y": 3.877,
     "w": 1.141,
     "h": 0.267,
     "passo": 3
    }
   ]
  },
  {
   "n": 13,
   "titulo": "8. Devolvido ao remetente",
   "links": [
    {
     "x": 4.704,
     "y": 4.4,
     "w": 2.326,
     "h": 0.507,
     "slide": 8
    },
    {
     "x": 10.44,
     "y": 4.352,
     "w": 2.326,
     "h": 0.684,
     "slide": 14
    }
   ],
   "sub": "Voltou para nós · CDC Art. 35",
   "caixas": {
    "1": {
     "x": 2.587,
     "y": 2.997,
     "w": 2.326,
     "h": 0.475
    },
    "2": {
     "x": 8.094,
     "y": 2.028,
     "w": 2.469,
     "h": 0.684
    },
    "3": {
     "x": 8.161,
     "y": 2.997,
     "w": 2.326,
     "h": 0.569
    },
    "4": {
     "x": 7.705,
     "y": 4.352,
     "w": 2.469,
     "h": 0.684
    }
   },
   "passos": {
    "motivo": {
     "x": 2.587,
     "y": 2.997,
     "w": 2.326,
     "h": 0.475
    },
    "endereco": {
     "x": 8.094,
     "y": 2.028,
     "w": 2.469,
     "h": 0.684
    },
    "quer": {
     "x": 8.161,
     "y": 2.997,
     "w": 2.326,
     "h": 0.569
    },
    "reenvio": {
     "x": 7.705,
     "y": 4.352,
     "w": 2.469,
     "h": 0.684
    }
   },
   "vai": [
    {
     "x": 1.419,
     "y": 4.4,
     "w": 1.377,
     "h": 0.323,
     "passo": 2
    },
    {
     "x": 3.061,
     "y": 4.4,
     "w": 1.377,
     "h": 0.323,
     "passo": 2
    }
   ]
  },
  {
   "n": 14,
   "titulo": "Reembolso pelo Financeiro",
   "links": [],
   "sub": "Quem atende não faz reembolso: pede ao Financeiro, que paga com comprovante; o caso volta para avisar o cliente.",
   "caixas": {
    "1": {
     "x": 3.055,
     "y": 2.453,
     "w": 2.709,
     "h": 1.058
    },
    "2": {
     "x": 0.575,
     "y": 3.824,
     "w": 2.709,
     "h": 0.556
    },
    "3": {
     "x": 3.503,
     "y": 4.693,
     "w": 2.709,
     "h": 0.556
    },
    "4": {
     "x": 0.648,
     "y": 4.716,
     "w": 2.553,
     "h": 0.521
    },
    "5": {
     "x": 6.931,
     "y": 1.584,
     "w": 2.709,
     "h": 0.556
    },
    "6": {
     "x": 10.046,
     "y": 1.584,
     "w": 2.709,
     "h": 0.71
    },
    "7": {
     "x": 6.931,
     "y": 2.453,
     "w": 2.709,
     "h": 0.556
    },
    "8": {
     "x": 10.046,
     "y": 2.607,
     "w": 2.709,
     "h": 1.058
    }
   },
   "passos": {
    "pedir": {
     "x": 3.055,
     "y": 2.453,
     "w": 2.709,
     "h": 1.058
    },
    "aviso": {
     "x": 0.575,
     "y": 3.824,
     "w": 2.709,
     "h": 0.556
    },
    "ok": {
     "x": 0.648,
     "y": 4.716,
     "w": 2.553,
     "h": 0.521
    },
    "pagar": {
     "x": 10.046,
     "y": 1.584,
     "w": 2.709,
     "h": 0.71
    },
    "devolver": {
     "x": 6.931,
     "y": 1.584,
     "w": 2.709,
     "h": 0.556
    },
    "corrigir": {
     "x": 6.931,
     "y": 2.453,
     "w": 2.709,
     "h": 0.556
    },
    "comprovante": {
     "x": 10.046,
     "y": 2.607,
     "w": 2.709,
     "h": 1.058
    },
    "voltar": {
     "x": 3.503,
     "y": 4.693,
     "w": 2.709,
     "h": 0.556
    },
    "reembolso_parcial": {
     "x": 3.055,
     "y": 2.453,
     "w": 2.709,
     "h": 1.058
    },
    "reembolso_parcial_financeiro": {
     "x": 0.575,
     "y": 3.824,
     "w": 2.709,
     "h": 0.556
    },
    "reembolso_parcial_comprovante": {
     "x": 10.046,
     "y": 2.607,
     "w": 2.709,
     "h": 1.058
    },
    "reembolso_integral": {
     "x": 3.055,
     "y": 2.453,
     "w": 2.709,
     "h": 1.058
    },
    "reembolso_integral_financeiro": {
     "x": 0.575,
     "y": 3.824,
     "w": 2.709,
     "h": 0.556
    },
    "reembolso_integral_comprovante": {
     "x": 10.046,
     "y": 2.607,
     "w": 2.709,
     "h": 1.058
    }
   },
   "vai": [
    {
     "x": 0.742,
     "y": 6.312,
     "w": 1.511,
     "h": 0.354,
     "passo": 6
    },
    {
     "x": 2.544,
     "y": 6.312,
     "w": 1.511,
     "h": 0.354,
     "passo": 5
    },
    {
     "x": 7.525,
     "y": 3.322,
     "w": 1.511,
     "h": 0.354,
     "passo": 1
    }
   ]
  }
 ]
} as {
  largura: number; altura: number; reembolso: number;
  tipos: Record<string, number>;
  /** tipo → passo → slide em que ele está desenhado. */
  passos: Record<string, Record<string, number>>;
  slides: SlideDoFluxo[];
};
