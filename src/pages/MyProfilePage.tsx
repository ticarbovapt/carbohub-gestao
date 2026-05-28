import { useRef, useState } from "react";
import { BoardLayout } from "@/components/layouts/BoardLayout";
import { CarboCard, CarboCardContent } from "@/components/ui/carbo-card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Camera, Loader2, User, Mail, Building2, Briefcase } from "lucide-react";

const DEPARTMENTS_LABEL: Record<string, string> = {
  command: "Command", ops: "OPS", cgc: "Comercial GC", finance: "Finance",
  growth: "Growth", expansao: "Expansão", ti_suporte: "TI / Suporte",
  venda: "Venda", preparacao: "Preparação", expedicao: "Expedição",
  operacao: "Operação", pos_venda: "Pós-Venda",
};

const FUNCAO_LABEL: Record<string, string> = {
  ceo: "CEO", head: "Head", gerente: "Gerente", coordenador: "Coordenador(a)",
  supervisor: "Supervisor(a)", analista: "Analista", staff: "Colaborador",
  assistente_executiva: "Assistente Executiva",
  vendedor_b2b: "Vendedor GC", vendedor_b2c: "Vendedor Carbozé",
};

function InfoRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-border last:border-0">
      <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
      <div>
        <p className="text-[11px] text-muted-foreground uppercase tracking-wide">{label}</p>
        <p className="text-sm font-medium">{value}</p>
      </div>
    </div>
  );
}

export default function MyProfilePage() {
  const { profile, user, refreshProfile } = useAuth();
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const initials = profile?.full_name
    ?.split(" ")
    .filter(Boolean)
    .map(w => w[0].toUpperCase())
    .slice(0, 2)
    .join("") || "?";

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Selecione uma imagem (JPG, PNG, WebP).");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Imagem deve ter no máximo 5MB.");
      return;
    }

    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${user.id}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true, contentType: file.type });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from("avatars").getPublicUrl(path);

      const { error: updateError } = await supabase
        .from("profiles")
        .update({ avatar_url: publicUrl })
        .eq("id", user.id);

      if (updateError) throw updateError;

      await refreshProfile();
      toast.success("Foto atualizada!");
    } catch (err: any) {
      toast.error("Erro ao enviar foto: " + (err.message || "tente novamente"));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const deptLabel = profile?.department ? (DEPARTMENTS_LABEL[profile.department] ?? profile.department) : null;
  const secDeptLabel = profile?.secondary_department ? (DEPARTMENTS_LABEL[profile.secondary_department] ?? profile.secondary_department) : null;
  const funcaoLabel = profile?.funcao ? (FUNCAO_LABEL[profile.funcao] ?? profile.funcao) : null;
  const secFuncaoLabel = profile?.secondary_funcao ? (FUNCAO_LABEL[profile.secondary_funcao] ?? profile.secondary_funcao) : null;

  const secondaryRole = secDeptLabel && secFuncaoLabel ? `${secFuncaoLabel} · ${secDeptLabel}` : secDeptLabel || secFuncaoLabel || null;

  return (
    <BoardLayout>
      <div className="p-4 md:p-6 max-w-md mx-auto space-y-5">
        <div>
          <h1 className="text-2xl font-bold">Meu Perfil</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Suas informações no sistema</p>
        </div>

        {/* Avatar */}
        <CarboCard>
          <CarboCardContent className="p-6 flex flex-col items-center gap-4">
            <div className="relative">
              <div className="w-24 h-24 rounded-full overflow-hidden ring-4 ring-border">
                {profile?.avatar_url
                  ? <img src={profile.avatar_url} alt="avatar" className="w-full h-full object-cover" />
                  : <div className="w-full h-full carbo-gradient flex items-center justify-center">
                      <span className="text-3xl font-bold text-white">{initials}</span>
                    </div>
                }
              </div>
              <button
                onClick={() => inputRef.current?.click()}
                disabled={uploading}
                className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-carbo-green text-white flex items-center justify-center shadow-md hover:bg-carbo-green/90 transition-colors disabled:opacity-60"
              >
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
              </button>
              <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
            </div>
            <div className="text-center">
              <p className="font-semibold text-lg">{profile?.full_name || "—"}</p>
              {profile?.username && <p className="text-sm text-muted-foreground">@{profile.username}</p>}
            </div>
            <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()} disabled={uploading}>
              {uploading ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Enviando...</> : <><Camera className="h-4 w-4 mr-1.5" /> Alterar foto</>}
            </Button>
          </CarboCardContent>
        </CarboCard>

        {/* Info */}
        <CarboCard>
          <CarboCardContent className="p-4">
            <InfoRow icon={User} label="Nome completo" value={profile?.full_name} />
            <InfoRow icon={Mail} label="E-mail" value={user?.email} />
            <InfoRow icon={Building2} label="Departamento" value={deptLabel && funcaoLabel ? `${funcaoLabel} · ${deptLabel}` : deptLabel || funcaoLabel} />
            {secondaryRole && <InfoRow icon={Building2} label="Papel secundário" value={secondaryRole} />}
            <InfoRow icon={Briefcase} label="Escopo" value={profile?.escopo} />
          </CarboCardContent>
        </CarboCard>

        <p className="text-xs text-center text-muted-foreground">
          Para alterar outras informações, solicite ao seu gestor.
        </p>
      </div>
    </BoardLayout>
  );
}
