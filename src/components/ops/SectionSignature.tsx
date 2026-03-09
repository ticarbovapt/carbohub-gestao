import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Check, RotateCcw } from "lucide-react";

export interface SignatureData {
  responsavel: string;
  observacoes: string;
  assinatura: string; // base64 image data
  data: string;
  hora: string;
}

interface SectionSignatureProps {
  sectionName: string;
  responsavelLabel?: string;
  onComplete: (data: SignatureData) => void;
}

export function SectionSignature({ 
  sectionName, 
  responsavelLabel = "Responsável",
  onComplete 
}: SectionSignatureProps) {
  const [responsavel, setResponsavel] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [isDrawing, setIsDrawing] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hasSignature, setHasSignature] = useState(false);

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    setIsDrawing(true);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    let x, y;
    
    if ('touches' in e) {
      x = e.touches[0].clientX - rect.left;
      y = e.touches[0].clientY - rect.top;
    } else {
      x = e.clientX - rect.left;
      y = e.clientY - rect.top;
    }

    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    let x, y;
    
    if ('touches' in e) {
      e.preventDefault();
      x = e.touches[0].clientX - rect.left;
      y = e.touches[0].clientY - rect.top;
    } else {
      x = e.clientX - rect.left;
      y = e.clientY - rect.top;
    }

    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasSignature(true);
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
  };

  const handleComplete = () => {
    const canvas = canvasRef.current;
    const assinatura = canvas ? canvas.toDataURL("image/png") : "";
    const now = new Date();
    
    onComplete({
      responsavel,
      observacoes,
      assinatura,
      data: now.toLocaleDateString("pt-BR"),
      hora: now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
    });
  };

  const isValid = responsavel.trim() !== "" && hasSignature;

  return (
    <div className="flex flex-col px-6 py-8 ops-slide-up">
      {/* Header */}
      <div className="text-center mb-6">
        <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-ops-green/20 text-3xl mb-4">
          ✍️
        </div>
        <h2 className="text-xl font-bold text-ops-text mb-2">
          Finalizar: {sectionName}
        </h2>
        <p className="text-ops-muted">
          Preencha os dados e assine para concluir esta seção
        </p>
      </div>

      {/* Form */}
      <div className="space-y-5 w-full max-w-md mx-auto">
        {/* Observações */}
        <div>
          <Label htmlFor="observacoes" className="text-ops-text font-semibold">
            Observações/Pendências
          </Label>
          <Textarea
            id="observacoes"
            value={observacoes}
            onChange={(e) => setObservacoes(e.target.value)}
            placeholder="Adicione observações ou pendências..."
            className="mt-1 rounded-xl border-2 border-gray-200 focus:border-ops-yellow min-h-[100px]"
          />
        </div>

        {/* Responsável */}
        <div>
          <Label htmlFor="responsavel" className="text-ops-text font-semibold">
            {responsavelLabel} *
          </Label>
          <Input
            id="responsavel"
            value={responsavel}
            onChange={(e) => setResponsavel(e.target.value)}
            placeholder="Nome do responsável"
            className="mt-1 h-12 rounded-xl border-2 border-gray-200 focus:border-ops-yellow"
          />
        </div>

        {/* Signature */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <Label className="text-ops-text font-semibold">
              Assinatura *
            </Label>
            {hasSignature && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={clearSignature}
                className="text-ops-muted hover:text-ops-coral"
              >
                <RotateCcw className="h-4 w-4 mr-1" />
                Limpar
              </Button>
            )}
          </div>
          <div className="relative rounded-xl border-2 border-dashed border-gray-300 bg-white overflow-hidden">
            <canvas
              ref={canvasRef}
              width={320}
              height={150}
              className="w-full touch-none cursor-crosshair"
              onMouseDown={startDrawing}
              onMouseMove={draw}
              onMouseUp={stopDrawing}
              onMouseLeave={stopDrawing}
              onTouchStart={startDrawing}
              onTouchMove={draw}
              onTouchEnd={stopDrawing}
            />
            {!hasSignature && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <span className="text-gray-400">Assine aqui ✍️</span>
              </div>
            )}
          </div>
        </div>

        {/* Date display */}
        <div className="flex items-center justify-between text-sm text-ops-muted bg-gray-50 rounded-xl px-4 py-3">
          <span>📅 Data: {new Date().toLocaleDateString("pt-BR")}</span>
          <span>🕐 Hora: {new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
        </div>

        <Button
          variant="ops-green"
          size="ops-full"
          onClick={handleComplete}
          disabled={!isValid}
          className="mt-4"
        >
          <Check className="h-5 w-5 mr-2" />
          Confirmar e Finalizar Seção
        </Button>
      </div>
    </div>
  );
}
