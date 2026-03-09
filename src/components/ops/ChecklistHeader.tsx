import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronRight } from "lucide-react";

export interface HeaderData {
  licenciado: string;
  local: string;
  cidadeUF: string;
  gestorResponsavel: string;
  gestorTecnico: string;
  dataPrevistaAbertura: string;
  tecnicoCarboVapt: string;
  responsavelComercial: string;
  dataEntregaTecnica: string;
  dataTreinamentoComercial: string;
}

interface ChecklistHeaderProps {
  onComplete: (data: HeaderData) => void;
}

// Estados brasileiros
const estadosBrasileiros = [
  { sigla: "AC", nome: "Acre" },
  { sigla: "AL", nome: "Alagoas" },
  { sigla: "AP", nome: "Amapá" },
  { sigla: "AM", nome: "Amazonas" },
  { sigla: "BA", nome: "Bahia" },
  { sigla: "CE", nome: "Ceará" },
  { sigla: "DF", nome: "Distrito Federal" },
  { sigla: "ES", nome: "Espírito Santo" },
  { sigla: "GO", nome: "Goiás" },
  { sigla: "MA", nome: "Maranhão" },
  { sigla: "MT", nome: "Mato Grosso" },
  { sigla: "MS", nome: "Mato Grosso do Sul" },
  { sigla: "MG", nome: "Minas Gerais" },
  { sigla: "PA", nome: "Pará" },
  { sigla: "PB", nome: "Paraíba" },
  { sigla: "PR", nome: "Paraná" },
  { sigla: "PE", nome: "Pernambuco" },
  { sigla: "PI", nome: "Piauí" },
  { sigla: "RJ", nome: "Rio de Janeiro" },
  { sigla: "RN", nome: "Rio Grande do Norte" },
  { sigla: "RS", nome: "Rio Grande do Sul" },
  { sigla: "RO", nome: "Rondônia" },
  { sigla: "RR", nome: "Roraima" },
  { sigla: "SC", nome: "Santa Catarina" },
  { sigla: "SP", nome: "São Paulo" },
  { sigla: "SE", nome: "Sergipe" },
  { sigla: "TO", nome: "Tocantins" },
];

// Lista de técnicos (exemplo - pode ser carregada do backend futuramente)
const tecnicosCarboVapt = [
  "Carlos Silva",
  "João Pereira",
  "Maria Santos",
  "Pedro Oliveira",
  "Ana Costa",
  "Lucas Rodrigues",
];

// Lista de responsáveis comerciais (exemplo - pode ser carregada do backend futuramente)
const responsaveisComerciais = [
  "Fernando Almeida",
  "Juliana Martins",
  "Roberto Souza",
  "Camila Lima",
  "Marcos Ribeiro",
  "Patricia Fernandes",
];

export function ChecklistHeader({ onComplete }: ChecklistHeaderProps) {
  const [formData, setFormData] = useState<HeaderData>({
    licenciado: "",
    local: "",
    cidadeUF: "",
    gestorResponsavel: "",
    gestorTecnico: "",
    dataPrevistaAbertura: "",
    tecnicoCarboVapt: "",
    responsavelComercial: "",
    dataEntregaTecnica: "",
    dataTreinamentoComercial: "",
  });

  const handleChange = (field: keyof HeaderData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = () => {
    onComplete(formData);
  };

  const isValid = formData.licenciado.trim() !== "";

  return (
    <div className="flex flex-col px-6 py-8 ops-slide-up">
      {/* Header */}
      <div className="text-center mb-6">
        <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-ops-yellow/20 text-3xl mb-4">
          📋
        </div>
        <h1 className="text-2xl font-extrabold text-ops-text mb-2">
          Abertura de Licenciado
        </h1>
        <p className="text-ops-muted">
          Preencha os dados do licenciado para começar
        </p>
      </div>

      {/* Form */}
      <div className="space-y-4 w-full max-w-md mx-auto">
        <div>
          <Label htmlFor="licenciado" className="text-ops-text font-semibold">
            Licenciado *
          </Label>
          <Input
            id="licenciado"
            value={formData.licenciado}
            onChange={(e) => handleChange("licenciado", e.target.value)}
            placeholder="Nome do licenciado"
            className="mt-1 h-12 rounded-xl border-2 border-gray-200 focus:border-ops-yellow"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="local" className="text-ops-text font-semibold">
              Local
            </Label>
            <Input
              id="local"
              value={formData.local}
              onChange={(e) => handleChange("local", e.target.value)}
              placeholder="Local"
              className="mt-1 h-12 rounded-xl border-2 border-gray-200 focus:border-ops-yellow"
            />
          </div>
          <div>
            <Label className="text-ops-text font-semibold">
              Estado (UF)
            </Label>
            <Select
              value={formData.cidadeUF}
              onValueChange={(value) => handleChange("cidadeUF", value)}
            >
              <SelectTrigger className="mt-1 h-12 rounded-xl border-2 border-gray-200 focus:border-ops-yellow bg-white">
                <SelectValue placeholder="Selecione o UF" />
              </SelectTrigger>
              <SelectContent className="bg-white border-2 border-gray-200 rounded-xl shadow-lg z-50">
                {estadosBrasileiros.map((estado) => (
                  <SelectItem 
                    key={estado.sigla} 
                    value={estado.sigla}
                    className="hover:bg-ops-yellow/10 cursor-pointer"
                  >
                    {estado.sigla} - {estado.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <Label htmlFor="gestorResponsavel" className="text-ops-text font-semibold">
            Gestor Responsável (Licenciado)
          </Label>
          <Input
            id="gestorResponsavel"
            value={formData.gestorResponsavel}
            onChange={(e) => handleChange("gestorResponsavel", e.target.value)}
            placeholder="Nome do gestor responsável"
            className="mt-1 h-12 rounded-xl border-2 border-gray-200 focus:border-ops-yellow"
          />
        </div>

        <div>
          <Label htmlFor="gestorTecnico" className="text-ops-text font-semibold">
            Gestor Técnico (Licenciado)
          </Label>
          <Input
            id="gestorTecnico"
            value={formData.gestorTecnico}
            onChange={(e) => handleChange("gestorTecnico", e.target.value)}
            placeholder="Nome do gestor técnico"
            className="mt-1 h-12 rounded-xl border-2 border-gray-200 focus:border-ops-yellow"
          />
        </div>

        <div>
          <Label htmlFor="dataPrevistaAbertura" className="text-ops-text font-semibold">
            Data prevista para abertura
          </Label>
          <Input
            id="dataPrevistaAbertura"
            type="date"
            value={formData.dataPrevistaAbertura}
            onChange={(e) => handleChange("dataPrevistaAbertura", e.target.value)}
            className="mt-1 h-12 rounded-xl border-2 border-gray-200 focus:border-ops-yellow"
          />
        </div>

        <div>
          <Label className="text-ops-text font-semibold">
            Técnico CarboVapt
          </Label>
          <Select
            value={formData.tecnicoCarboVapt}
            onValueChange={(value) => handleChange("tecnicoCarboVapt", value)}
          >
            <SelectTrigger className="mt-1 h-12 rounded-xl border-2 border-gray-200 focus:border-ops-yellow bg-white">
              <SelectValue placeholder="Selecione o técnico" />
            </SelectTrigger>
            <SelectContent className="bg-white border-2 border-gray-200 rounded-xl shadow-lg z-50">
              {tecnicosCarboVapt.map((tecnico) => (
                <SelectItem 
                  key={tecnico} 
                  value={tecnico}
                  className="hover:bg-ops-yellow/10 cursor-pointer"
                >
                  {tecnico}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-ops-text font-semibold">
            Responsável Comercial CarboVapt
          </Label>
          <Select
            value={formData.responsavelComercial}
            onValueChange={(value) => handleChange("responsavelComercial", value)}
          >
            <SelectTrigger className="mt-1 h-12 rounded-xl border-2 border-gray-200 focus:border-ops-yellow bg-white">
              <SelectValue placeholder="Selecione o responsável" />
            </SelectTrigger>
            <SelectContent className="bg-white border-2 border-gray-200 rounded-xl shadow-lg z-50">
              {responsaveisComerciais.map((responsavel) => (
                <SelectItem 
                  key={responsavel} 
                  value={responsavel}
                  className="hover:bg-ops-yellow/10 cursor-pointer"
                >
                  {responsavel}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="dataEntregaTecnica" className="text-ops-text font-semibold">
            Data da Entrega Técnica
          </Label>
          <Input
            id="dataEntregaTecnica"
            type="date"
            value={formData.dataEntregaTecnica}
            onChange={(e) => handleChange("dataEntregaTecnica", e.target.value)}
            className="mt-1 h-12 rounded-xl border-2 border-gray-200 focus:border-ops-yellow"
          />
        </div>

        <div>
          <Label htmlFor="dataTreinamentoComercial" className="text-ops-text font-semibold">
            Data do Treinamento Comercial
          </Label>
          <Input
            id="dataTreinamentoComercial"
            type="date"
            value={formData.dataTreinamentoComercial}
            onChange={(e) => handleChange("dataTreinamentoComercial", e.target.value)}
            className="mt-1 h-12 rounded-xl border-2 border-gray-200 focus:border-ops-yellow"
          />
        </div>

        <Button
          variant="ops"
          size="ops-full"
          onClick={handleSubmit}
          disabled={!isValid}
          className="mt-6"
        >
          Continuar
          <ChevronRight className="h-5 w-5 ml-2" />
        </Button>
      </div>
    </div>
  );
}
