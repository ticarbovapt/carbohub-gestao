export interface ChecklistItem {
  id: string;
  title: string;
  description?: string;
  icon: string;
  hasNSA?: boolean; // "Não Se Aplica" option
  hasQuantity?: boolean;
  hasObservation?: boolean;
}

export interface ChecklistSection {
  id: string;
  title: string;
  items: ChecklistItem[];
}

export interface ChecklistTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  responsavelLabel: string; // Label for the person responsible at end
  sections: ChecklistSection[];
}

export const checklistTemplates: ChecklistTemplate[] = [
  {
    id: "pre-operacao",
    name: "1. Pré-Operação",
    description: "Liberar envio e instalação somente com 100% dos itens concluídos",
    icon: "📋",
    responsavelLabel: "Responsável Pré-Operação",
    sections: [
      {
        id: "documentacao",
        title: "1.1 Documentação e Cadastro",
        items: [
          { id: "doc-1", title: "Termo de licenciamento assinado", icon: "📝" },
          { id: "doc-2", title: "Contrato social atualizado", icon: "📄" },
          { id: "doc-3", title: "RG/CNH do representante legal", icon: "🪪" },
          { id: "doc-4", title: "E-mail do representante legal", icon: "📧" },
          { id: "doc-5", title: "RG/CNH da testemunha", icon: "🪪" },
          { id: "doc-6", title: "E-mail da testemunha", icon: "📧" },
          { id: "doc-7", title: "Autorização de operação confirmada", icon: "✅" },
        ],
      },
      {
        id: "contatos",
        title: "1.2 Contatos e Estrutura do Licenciado",
        items: [
          { id: "cont-1", title: "Gerente definido e contato registrado", icon: "👤" },
          { id: "cont-2", title: "Ponto focal definido", icon: "📍" },
          { id: "cont-3", title: "Responsável financeiro definido", icon: "💰" },
        ],
      },
      {
        id: "kit-pdv",
        title: "1.3 Kit PDV CarboVapt",
        items: [
          { id: "pdv-1", title: "Banner infográfico de tecnologia", icon: "🖼️", hasNSA: true },
          { id: "pdv-2", title: "Wind banner", icon: "🎌", hasNSA: true },
        ],
      },
      {
        id: "kit-carboze",
        title: "1.4 Kit CarboZé",
        items: [
          { id: "cz-1", title: "Display de panfleto", icon: "📰", hasNSA: true },
          { id: "cz-2", title: "Panfletos", icon: "📑", hasQuantity: true, hasNSA: true },
          { id: "cz-3", title: "Expositor", icon: "🗄️", hasNSA: true },
          { id: "cz-4", title: "Wind banner", icon: "🎌", hasNSA: true },
          { id: "cz-5", title: "Mini banner de balcão", icon: "🏷️", hasNSA: true },
          { id: "cz-6", title: "Banner informativo", icon: "📢", hasNSA: true },
        ],
      },
      {
        id: "maleta-experimento",
        title: "Maleta Experimento",
        items: [
          { id: "mal-1", title: "Diesel S10", icon: "⛽", hasNSA: true },
          { id: "mal-2", title: "Ácido sulfúrico", icon: "🧪", hasNSA: true },
          { id: "mal-3", title: "Estabilizador CarboZé", icon: "💧", hasNSA: true },
          { id: "mal-4", title: "Proveta", icon: "🧫", hasNSA: true },
          { id: "mal-5", title: "Tubos de ensaio", icon: "🧪", hasNSA: true },
          { id: "mal-6", title: "Becker medidor", icon: "🥛", hasNSA: true },
          { id: "mal-7", title: "Algodão ou papel toalha", icon: "🧻", hasNSA: true },
          { id: "mal-8", title: "Fósforos", icon: "🔥", hasNSA: true },
          { id: "mal-9", title: "Superfície para líquido", icon: "🍽️", hasNSA: true },
          { id: "mal-10", title: "EPIs do experimento (luvas, óculos, máscara)", icon: "🥽", hasNSA: true },
        ],
      },
      {
        id: "equipamento-carbovapt",
        title: "1.5 Equipamento CarboVapt",
        items: [
          { id: "eq-1", title: "Máquina em bom estado", icon: "🔧", hasObservation: true },
          { id: "eq-2", title: "Mangueira", icon: "🔌" },
          { id: "eq-3", title: "Flange", icon: "⚙️" },
          { id: "eq-4", title: "Decibelímetro", icon: "📊" },
          { id: "eq-5", title: "Reagentes para teste", icon: "🧪", hasQuantity: true },
          { id: "eq-6", title: "Reagentes para estoque", icon: "📦", hasQuantity: true },
        ],
      },
      {
        id: "equipamentos-gravacao",
        title: "1.6 Equipamentos de Gravação",
        items: [
          { id: "grav-1", title: "Microfones carregados", icon: "🎤" },
        ],
      },
      {
        id: "equipe-epis",
        title: "1.7 Equipe e EPIs",
        items: [
          { id: "epi-1", title: "Uniforme", icon: "👕", hasObservation: true },
          { id: "epi-2", title: "EPIs disponíveis", icon: "🦺", hasObservation: true },
          { id: "epi-3", title: "Extensão elétrica 50m+", icon: "🔌", hasObservation: true },
          { id: "epi-4", title: "Maleta de ferramentas completa", icon: "🧰", hasObservation: true },
        ],
      },
    ],
  },
  {
    id: "entrega-tecnica",
    name: "2. Entrega Técnica",
    description: "Garantir equipamento instalado e operador apto",
    icon: "🔧",
    responsavelLabel: "Responsável Técnico",
    sections: [
      {
        id: "recebimento",
        title: "2.1 Recebimento e Inspeção",
        items: [
          { id: "rec-1", title: "Horário de chegada registrado", icon: "🕐" },
          { id: "rec-2", title: "Equipamentos íntegros", icon: "✅" },
          { id: "rec-3", title: "Todos os itens do checklist pré-operação conferidos", icon: "📋" },
          { id: "rec-4", title: "Nenhum dano identificado", icon: "🔍" },
        ],
      },
      {
        id: "testes-tecnicos",
        title: "2.2 Testes Técnicos",
        items: [
          { id: "test-1", title: "Ligação inicial OK", icon: "⚡" },
          { id: "test-2", title: "Teste de funcionamento aprovado", icon: "✅" },
          { id: "test-3", title: "Nenhum vazamento detectado", icon: "💧" },
        ],
      },
      {
        id: "treinamento-tecnico",
        title: "2.3 Treinamento Técnico",
        items: [
          { id: "trein-1", title: "Apresentação da máquina", icon: "🎓" },
          { id: "trein-2", title: "Funcionamento passo a passo explicado", icon: "📖" },
          { id: "trein-3", title: "Demonstração prática realizada", icon: "🎬" },
          { id: "trein-4", title: "Operador praticou sob supervisão", icon: "👁️" },
          { id: "trein-5", title: "Pontos críticos explicados", icon: "⚠️" },
          { id: "trein-6", title: "Manutenção básica orientada", icon: "🔧" },
          { id: "trein-7", title: "Adesivo de instruções explicado", icon: "🏷️" },
          { id: "trein-8", title: "Operador apto para operar sozinho", icon: "🎯" },
        ],
      },
      {
        id: "experiencia-carboze",
        title: "2.4 Experiência Química CarboZé (se aplicável)",
        items: [
          { id: "exp-1", title: "Experimento realizado", icon: "🧪", hasNSA: true },
          { id: "exp-2", title: "Comparação explicada", icon: "📊", hasNSA: true },
          { id: "exp-3", title: "Materiais descartados corretamente", icon: "🗑️", hasNSA: true },
        ],
      },
      {
        id: "encerramento-tecnico",
        title: "2.5 Encerramento Técnico",
        items: [
          { id: "enc-1", title: "Área limpa e organizada", icon: "🧹" },
          { id: "enc-2", title: "Embalagens recolhidas", icon: "📦" },
          { id: "enc-3", title: "Contatos de suporte fornecidos", icon: "📞" },
          { id: "enc-4", title: "Horário de finalização registrado", icon: "🕐" },
          { id: "enc-5", title: "Liberação técnica para operação comercial", icon: "✅" },
        ],
      },
    ],
  },
  {
    id: "aceite-tecnico",
    name: "3. Aceite Técnico",
    description: "Confirmar recebimento dos equipamentos e conclusão do treinamento",
    icon: "✍️",
    responsavelLabel: "Licenciado",
    sections: [
      {
        id: "aceite",
        title: "3.1 Aceite do Licenciado",
        items: [
          { id: "ace-1", title: "Confirmo o recebimento dos equipamentos", icon: "📦" },
          { id: "ace-2", title: "Confirmo a conclusão do treinamento técnico", icon: "🎓" },
        ],
      },
    ],
  },
  {
    id: "entrega-comercial",
    name: "4. Entrega Comercial",
    description: "Deixar o licenciado apto para vender",
    icon: "💼",
    responsavelLabel: "Responsável Comercial",
    sections: [
      {
        id: "sistema-processos",
        title: "4.1 Sistema e Processos",
        items: [
          { id: "sist-1", title: "Sistema CarboVapt apresentado", icon: "💻" },
          { id: "sist-2", title: "Contatos para grupo WhatsApp validados", icon: "📱" },
          { id: "sist-3", title: "Reagentes registrados no sistema", icon: "🧪" },
          { id: "sist-4", title: "Processo mensal explicado", icon: "📅" },
          { id: "sist-5", title: "Termo de reagentes assinado", icon: "✍️" },
        ],
      },
      {
        id: "treinamento-comercial",
        title: "4.2 Treinamento Comercial e Marca",
        items: [
          { id: "com-1", title: "Tecnologia apresentada", icon: "🔬" },
          { id: "com-2", title: "Diferenciais explicados", icon: "⭐" },
          { id: "com-3", title: "Processo de vendas definido", icon: "📈" },
          { id: "com-4", title: "Matriz de objeções apresentada", icon: "🎯" },
          { id: "com-5", title: "Estratégia para frotas explicada", icon: "🚚" },
          { id: "com-6", title: "Portaria 192 apresentada", icon: "📜" },
          { id: "com-7", title: "Posicionamento de mercado alinhado", icon: "📊" },
          { id: "com-8", title: "Suporte e marketing apresentados", icon: "📣" },
          { id: "com-9", title: "Grupos e canais explicados", icon: "📢" },
        ],
      },
      {
        id: "pdv-local",
        title: "4.3 PDV no Local (se aplicável)",
        items: [
          { id: "pdvl-1", title: "Infográfico posicionado", icon: "🖼️", hasNSA: true },
          { id: "pdvl-2", title: "Display posicionado", icon: "📰", hasNSA: true },
          { id: "pdvl-3", title: "Panfletos disponíveis", icon: "📑", hasNSA: true },
        ],
      },
      {
        id: "conteudo-gravacoes",
        title: "4.4 Conteúdo e Gravações",
        items: [
          { id: "grav-1", title: "Vídeo inauguração gravado", icon: "🎥" },
          { id: "grav-2", title: "Mídias enviadas no grupo", icon: "📤" },
        ],
      },
      {
        id: "integracao-carboze",
        title: "4.5 Integração CarboZé",
        items: [
          { id: "int-1", title: "Kit verificado", icon: "📦", hasNSA: true },
          { id: "int-2", title: "PDVs instalados", icon: "🏪", hasNSA: true },
          { id: "int-3", title: "Alinhamento comercial realizado", icon: "🤝", hasNSA: true },
          { id: "int-4", title: "Licenciado apto para iniciar vendas", icon: "🚀", hasNSA: true },
        ],
      },
    ],
  },
  {
    id: "pos-operacao",
    name: "5. Pós-Operação",
    description: "Registrar, comunicar e garantir follow-up",
    icon: "📊",
    responsavelLabel: "Responsável Pós-Operação",
    sections: [
      {
        id: "pos-items",
        title: "5.1 Registro e Comunicação",
        items: [
          { id: "pos-1", title: "Fotos e Vídeos armazenadas no Drive", icon: "☁️" },
          { id: "pos-2", title: "Termo de aceite enviado por e-mail", icon: "📧" },
          { id: "pos-3", title: "Operação registrada no CRM", icon: "💾" },
          { id: "pos-4", title: "Status: Abertura Concluída", icon: "✅" },
          { id: "pos-5", title: "Grupo do licenciado criado", icon: "👥" },
          { id: "pos-6", title: "Mensagem de agradecimento enviada no grupo", icon: "🙏" },
          { id: "pos-7", title: "Guia do Licenciado enviado", icon: "📚" },
          { id: "pos-8", title: "Próximo contato agendado (30 dias)", icon: "📅" },
          { id: "pos-9", title: "Cartão de ativação", icon: "💳", hasNSA: true, hasQuantity: true },
        ],
      },
    ],
  },
];

// Helper to get total items count
export const getTotalItems = (template: ChecklistTemplate): number => {
  return template.sections.reduce((acc, section) => acc + section.items.length, 0);
};

// Helper to flatten all items
export const getAllItems = (template: ChecklistTemplate): ChecklistItem[] => {
  return template.sections.flatMap(section => section.items);
};
