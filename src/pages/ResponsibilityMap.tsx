import { BoardLayout } from "@/components/layouts/BoardLayout";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { CarboCard, CarboCardContent } from "@/components/ui/carbo-card";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { Users } from "lucide-react";

// ── Data from Mapa_Responsabilidades_CarboVapt — aba Resumo ────────────────

const DEPT_COLORS: Record<string, string> = {
  Command:  "bg-indigo-500",
  OPS:      "bg-blue-500",
  Growth:   "bg-green-500",
  Finance:  "bg-amber-500",
  "Expansão": "bg-violet-500",
  B2B:      "bg-pink-500",
};

const ROLE_BADGE: Record<string, "default" | "secondary" | "outline"> = {
  CEO:                      "default",
  Head:                     "default",
  Manager:                  "secondary",
  "Coordenator/supervisor": "secondary",
  Operacional:              "outline",
  Assistente:               "outline",
};

interface Person {
  name: string;
  department: string;
  role: string;
  jobTitle: string;
  details: string;
  reportsTo: string;
  email?: string;
}

const PEOPLE: Person[] = [
  // Command
  { name: "Thelis Botelho",    department: "Command", role: "CEO",    jobTitle: "CEO / Liderança Comercial",                   reportsTo: "Conselho / Sócios",  email: "thelis@carbovapt.com.br",
    details: "Define visão estratégica, governança, prioridades, cultura, decisões estruturantes, representação institucional e desenvolvimento de lideranças" },
  { name: "Emmily Moreira",    department: "Command", role: "Assistente", jobTitle: "Assistente Executiva",                    reportsTo: "Thelis Botelho",
    details: "Suporte executivo ao CEO e B2B, organização administrativa e apoio estratégico" },

  // Finance
  { name: "Priscilla",         department: "Finance", role: "Head",   jobTitle: "Sócia-Adm / Financeiro",                     reportsTo: "Thelis Botelho", email: "priscilla@carbovapt.com.br",
    details: "Pagamentos e outras responsabilidades inerentes a decisões da empresa" },
  { name: "Jayane",            department: "Finance", role: "Coordenator/supervisor", jobTitle: "Coordenadora Administrativo", reportsTo: "Thelis Botelho", email: "administrativo@carbovapt.com.br",
    details: "RH, comissões, apurações, relacionamento com contabilidade, facilities, supervisão do administrativo" },
  { name: "Sueilha",           department: "Finance", role: "Operacional", jobTitle: "Financeiro",                            reportsTo: "Priscilla", email: "financeiro@carbovapt.com.br",
    details: "Cobrança, contabilidade e outras atividades relacionadas ao financeiro" },
  { name: "Ana",               department: "Finance", role: "Operacional", jobTitle: "Fiscal",                                reportsTo: "Jayane", email: "fiscal@carbovapt.com.br",
    details: "Emissão de NFs e de boletos, estoque de máquinas e reagentes, apuração de licenciados/investidores, acompanhamento da rede" },
  { name: "Lígia",             department: "Finance", role: "Operacional", jobTitle: "Marketing / Kits",                      reportsTo: "Jayane", email: "ccocarboflix1@gmail.com",
    details: "Separação e montagem de kits de marketing, contato com fornecedores, atendimento" },

  // Growth
  { name: "Marina O. Rodrigues", department: "Growth", role: "Head", jobTitle: "Diretora de Estratégia, Marca e Crescimento", reportsTo: "Thelis Botelho",
    details: "Posicionamento institucional, narrativa estratégica, marketing, geração de demanda, integração marketing–expansão–comercial, indicadores e rituais" },
  { name: "Dyanne",            department: "Growth", role: "Operacional", jobTitle: "Marketing / Operacional",                reportsTo: "Marina", email: "operacao.mkt@carbovapt.com.br",
    details: "Negociação com fornecedor, captações externas, postagem nas redes sociais, mídias digitais" },
  { name: "Mirian",            department: "Growth", role: "Operacional", jobTitle: "Social Media / Analista Mkt",            reportsTo: "Marina",
    details: "Gestão de redes sociais e conteúdo institucional" },
  { name: "Dyane",             department: "Growth", role: "Operacional", jobTitle: "Assistente de Marketing",                reportsTo: "Marina",
    details: "Apoio operacional ao marketing e campanhas" },
  { name: "Remo",              department: "Growth", role: "Operacional", jobTitle: "Editor de Vídeos",                       reportsTo: "Marina",
    details: "Produção e edição de vídeos institucionais" },
  { name: "Arthur",            department: "Growth", role: "Operacional", jobTitle: "Designer e Editor de Vídeos",            reportsTo: "Marina",
    details: "Design gráfico e edição audiovisual" },

  // B2B
  { name: "Vinicius Constantino", department: "B2B", role: "Head",  jobTitle: "Diretor de Desenvolvimento de Negócios Corporativos (B2B)", reportsTo: "Thelis Botelho",
    details: "Vendas consultivas, contratos corporativos, parcerias estratégicas, previsibilidade de receita, pipeline e forecast" },
  { name: "Rodrigo Torquato",  department: "B2B", role: "Coordenator/supervisor", jobTitle: "Consultor de Vendas Corporativas – Nordeste", reportsTo: "Vinicius Constantino", email: "rodrigo.torquato@carbovapt.com.br",
    details: "Vendas consultivas e gestão de contas corporativas" },
  { name: "Marcius D'Ávilla",  department: "B2B", role: "Operacional", jobTitle: "PRV e Consultor B2B – Sudeste",             reportsTo: "Erick Almeida",
    details: "Vendas corporativas, prospecção e relacionamento estratégico" },

  // OPS
  { name: "Peterson Oliveira", department: "OPS", role: "Manager",  jobTitle: "Gerente de Operações e Logística",             reportsTo: "Thelis Botelho",
    details: "Execução operacional, logística, qualidade, padronização de processos e suporte à expansão" },
  { name: "Jeane",             department: "OPS", role: "Operacional", jobTitle: "Compras / Envios",                          reportsTo: "Peterson", email: "comercial1@carbovapt.com.br",
    details: "Compras de insumos e materiais, reservas (passagens, hotéis, agenda de equipe), envio e recebimento de materiais, orçamentos, interface com fornecedores e transportadoras" },
  { name: "David",             department: "OPS", role: "Operacional", jobTitle: "Operacional",                               reportsTo: "Peterson",
    details: "Execução em campo, preparo de materiais, EPIs" },
  { name: "Reinaldo",          department: "OPS", role: "Operacional", jobTitle: "Operacional / Suporte Técnico",             reportsTo: "Peterson",
    details: "Execução, logística, relatórios técnicos e suporte técnico aos licenciados CarboVapt" },
  { name: "Luis Carlos",       department: "OPS", role: "Operacional", jobTitle: "Operacional / Envase",                     reportsTo: "Peterson",
    details: "Execução em campo, preparo de materiais, EPIs, envase de produtos" },
  { name: "Ronaldo",           department: "OPS", role: "Operacional", jobTitle: "Operacional",                               reportsTo: "Peterson",
    details: "Execução em campo, preparo de materiais, EPIs" },
  { name: "Iury",              department: "OPS", role: "Operacional", jobTitle: "Desenvolvedor Back-end",                    reportsTo: "Peterson",
    details: "Desenvolvimento e manutenção de sistemas" },

  // Expansão
  { name: "Erick Almeida",     department: "Expansão", role: "Head", jobTitle: "Diretor de Expansão Nacional do Varejo",      reportsTo: "Thelis Botelho",
    details: "Crescimento da rede de licenciados, ativação, padronização, suporte e performance nacional" },
  { name: "Lorran Barba",      department: "Expansão", role: "Operacional", jobTitle: "Sucesso do Licenciado (Base)",         reportsTo: "Erick Almeida",
    details: "Acompanhamento, suporte e evolução de licenciados ativos" },
  { name: "Thiago Damasceno",  department: "Expansão", role: "Operacional", jobTitle: "Ativador de Licenciados – BA",         reportsTo: "Erick Almeida",
    details: "Ativação de novos licenciados e suporte regional" },
  { name: "Edson França",      department: "Expansão", role: "Operacional", jobTitle: "Ativador e Técnico – Sul",             reportsTo: "Erick Almeida",
    details: "Ativação, suporte técnico e acompanhamento regional" },
  { name: "Ricardo",           department: "Expansão", role: "Operacional", jobTitle: "Técnico Operacional – Baixada Santista", reportsTo: "Erick Almeida",
    details: "Execução técnica de serviços CarboVapt" },
  { name: "Jonathas",          department: "Expansão", role: "Operacional", jobTitle: "Técnico Operacional – Sudeste",        reportsTo: "Erick Almeida",
    details: "Execução técnica e suporte operacional" },
  { name: "Ivo Scarpin",       department: "Expansão", role: "Operacional", jobTitle: "PAP e Técnico – Sul",                  reportsTo: "Erick Almeida",
    details: "Prospecção PAP e suporte técnico regional" },
];

const DEPARTMENTS = ["Command", "Finance", "Growth", "B2B", "OPS", "Expansão"] as const;

export default function ResponsibilityMap() {
  const total = PEOPLE.length;
  const byDept = DEPARTMENTS.map((d) => ({ dept: d, count: PEOPLE.filter((p) => p.department === d).length }));

  return (
    <BoardLayout>
      <div className="space-y-6">
        <CarboPageHeader
          title="Mapa de Responsabilidades"
          description="Quem faz o quê — estrutura de funções por departamento"
          icon={Users}
        />

        {/* Summary */}
        <div className="flex flex-wrap gap-3">
          <CarboBadge variant="secondary">{total} colaboradores</CarboBadge>
          {byDept.map(({ dept, count }) => (
            <div key={dept} className="flex items-center gap-1.5 text-sm">
              <span className={`w-2 h-2 rounded-full ${DEPT_COLORS[dept] || "bg-gray-500"}`} />
              <span className="text-muted-foreground">{dept} <strong>{count}</strong></span>
            </div>
          ))}
        </div>

        {/* Per-department tables */}
        {DEPARTMENTS.map((dept) => {
          const people = PEOPLE.filter((p) => p.department === dept);
          if (!people.length) return null;

          return (
            <CarboCard key={dept} padding="none">
              {/* Dept header */}
              <div className={`px-4 py-2 flex items-center gap-2 rounded-t-xl ${DEPT_COLORS[dept] || "bg-gray-500"} bg-opacity-10`}>
                <span className={`w-2.5 h-2.5 rounded-full ${DEPT_COLORS[dept]}`} />
                <span className="font-semibold text-sm">{dept}</span>
                <CarboBadge variant="secondary" className="text-[10px]">{people.length} pessoas</CarboBadge>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/20">
                      <th className="text-left p-3 font-medium w-36">Nome</th>
                      <th className="text-left p-3 font-medium w-40">Cargo / Função</th>
                      <th className="text-left p-3 font-medium w-28">Nível</th>
                      <th className="text-left p-3 font-medium w-32">Responde a</th>
                      <th className="text-left p-3 font-medium">Responsabilidades</th>
                    </tr>
                  </thead>
                  <tbody>
                    {people.map((p) => (
                      <tr key={p.name} className="border-b hover:bg-muted/10 transition-colors">
                        <td className="p-3">
                          <div className="font-medium">{p.name}</div>
                          {p.email && (
                            <div className="text-[10px] text-muted-foreground truncate max-w-[130px]">{p.email}</div>
                          )}
                        </td>
                        <td className="p-3 text-muted-foreground">{p.jobTitle}</td>
                        <td className="p-3">
                          <CarboBadge variant={ROLE_BADGE[p.role] ?? "outline"} className="text-[10px]">
                            {p.role}
                          </CarboBadge>
                        </td>
                        <td className="p-3 text-muted-foreground text-xs">{p.reportsTo}</td>
                        <td className="p-3 text-xs text-muted-foreground leading-relaxed">{p.details}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CarboCard>
          );
        })}
      </div>
    </BoardLayout>
  );
}
