import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { BoardLayout } from "@/components/layouts/BoardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useConfetti } from "@/hooks/useConfetti";
import { SuccessAnimation } from "@/components/animations/SuccessAnimation";
import { 
  Building2, 
  MapPin, 
  User, 
  Phone, 
  Mail, 
  ArrowLeft,
  Sparkles,
  CheckCircle2,
  Loader2,
} from "lucide-react";

const BRAZILIAN_STATES = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA",
  "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN",
  "RS", "RO", "RR", "SC", "SP", "SE", "TO",
];

export default function NewLicensee() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const { fireSuccess } = useConfetti();
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [createdLicensee, setCreatedLicensee] = useState<{ name: string; id: string } | null>(null);
  
  const [formData, setFormData] = useState({
    name: "",
    company: "",
    email: "",
    phone: "",
    city: "",
    state: "",
    notes: "",
  });

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user) {
      toast({
        title: "Erro",
        description: "Você precisa estar logado para criar um licenciado.",
        variant: "destructive",
      });
      return;
    }

    if (!formData.name.trim()) {
      toast({
        title: "Campo obrigatório",
        description: "O nome do licenciado é obrigatório.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const { data, error } = await supabase
        .from("customers")
        .insert({
          name: formData.name.trim(),
          company: formData.company.trim() || null,
          email: formData.email.trim() || null,
          phone: formData.phone.trim() || null,
          notes: [
            formData.city && formData.state 
              ? `📍 ${formData.city} - ${formData.state}` 
              : null,
            formData.notes.trim() || null,
          ].filter(Boolean).join("\n") || null,
          created_by: user.id,
        })
        .select("id, name")
        .single();

      if (error) throw error;

      setCreatedLicensee({ name: data.name, id: data.id });
      setShowSuccess(true);
      fireSuccess();
      
    } catch (error: any) {
      console.error("Error creating licensee:", error);
      toast({
        title: "Erro ao criar licenciado",
        description: error.message || "Tente novamente mais tarde.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSuccessComplete = () => {
    setShowSuccess(false);
    navigate("/os");
  };

  return (
    <BoardLayout>
      <SuccessAnimation
        show={showSuccess}
        message="Licenciado Criado! 🎉"
        subMessage={`${createdLicensee?.name} agora faz parte da Carbo!`}
        variant="celebration"
        onComplete={handleSuccessComplete}
      />

      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(-1)}
            className="mb-4 hover:text-carbo-green"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar
          </Button>

          <div className="flex items-center gap-3 mb-2">
            <div className="h-12 w-12 rounded-xl carbo-gradient flex items-center justify-center shadow-carbo">
              <Sparkles className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground font-plex">
                Novo Licenciado
              </h1>
              <p className="text-muted-foreground">
                Faça parte do crescimento da Carbo
              </p>
            </div>
          </div>
        </div>

        {/* Motivational Card */}
        <Card className="mb-6 carbo-gradient-soft border-carbo-green/20">
          <CardContent className="p-4 flex items-center gap-4">
            <span className="text-4xl">🌱</span>
            <div>
              <p className="font-semibold text-foreground">
                Você também faz a Carbo crescer!
              </p>
              <p className="text-sm text-muted-foreground">
                Cada novo licenciado é um passo para nosso sucesso compartilhado.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Form */}
        <Card className="shadow-board-lg">
          <CardHeader>
            <CardTitle className="font-plex">Dados do Licenciado</CardTitle>
            <CardDescription>
              Preencha as informações básicas para começar
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Name - Required */}
              <div className="space-y-2">
                <Label htmlFor="name" className="flex items-center gap-2">
                  <User className="h-4 w-4 text-carbo-green" />
                  Nome do Responsável *
                </Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => handleChange("name", e.target.value)}
                  placeholder="Nome completo do responsável"
                  className="h-11"
                  required
                />
              </div>

              {/* Company */}
              <div className="space-y-2">
                <Label htmlFor="company" className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-carbo-blue" />
                  Nome da Empresa / Unidade
                </Label>
                <Input
                  id="company"
                  value={formData.company}
                  onChange={(e) => handleChange("company", e.target.value)}
                  placeholder="Razão social ou nome fantasia"
                  className="h-11"
                />
              </div>

              {/* Contact */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="email" className="flex items-center gap-2">
                    <Mail className="h-4 w-4" />
                    E-mail
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => handleChange("email", e.target.value)}
                    placeholder="email@empresa.com"
                    className="h-11"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone" className="flex items-center gap-2">
                    <Phone className="h-4 w-4" />
                    Telefone
                  </Label>
                  <Input
                    id="phone"
                    value={formData.phone}
                    onChange={(e) => handleChange("phone", e.target.value)}
                    placeholder="(00) 00000-0000"
                    className="h-11"
                  />
                </div>
              </div>

              {/* Location */}
              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-2 space-y-2">
                  <Label htmlFor="city" className="flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    Cidade
                  </Label>
                  <Input
                    id="city"
                    value={formData.city}
                    onChange={(e) => handleChange("city", e.target.value)}
                    placeholder="Nome da cidade"
                    className="h-11"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="state">UF</Label>
                  <Select value={formData.state} onValueChange={(v) => handleChange("state", v)}>
                    <SelectTrigger className="h-11">
                      <SelectValue placeholder="UF" />
                    </SelectTrigger>
                    <SelectContent>
                      {BRAZILIAN_STATES.map((state) => (
                        <SelectItem key={state} value={state}>
                          {state}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Notes */}
              <div className="space-y-2">
                <Label htmlFor="notes">Observações</Label>
                <Textarea
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => handleChange("notes", e.target.value)}
                  placeholder="Informações adicionais sobre o licenciado..."
                  rows={3}
                />
              </div>

              {/* Submit */}
              <Button
                type="submit"
                size="lg"
                className="w-full h-14 text-lg font-semibold carbo-gradient text-white hover:opacity-90 shadow-carbo"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                    Criando...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-5 w-5 mr-2" />
                    Cadastrar Licenciado
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Help text */}
        <p className="text-center text-sm text-muted-foreground mt-6">
          Vamos crescer juntos? 🚀 Cada novo licenciado é uma vitória compartilhada.
        </p>
      </div>
    </BoardLayout>
  );
}
