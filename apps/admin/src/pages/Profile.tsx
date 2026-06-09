import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { diceBearUrl } from "@/components/ui/profile-avatar";
import { AvatarCropDialog } from "@/components/ui/AvatarCropDialog";
import { CarboCard, CarboCardContent } from "@/components/ui/carbo-card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Camera, Loader2, User, Mail, Building2, Briefcase } from "lucide-react";

interface ProfileData {
  id: string;
  full_name: string | null;
  username: string | null;
  avatar_url: string | null;
  email: string | null;
  department: string | null;
  funcao: string | null;
  secondary_department: string | null;
  secondary_funcao: string | null;
  escopo: string | null;
}

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

// Meu Perfil — COMPARTILHADO entre os apps. Autocontido (busca os próprios dados
// e os labels de departamento/função no banco, refletindo renomeações).
export default function Profile() {
  const [data, setData] = useState<ProfileData | null>(null);
  const [deptLabels, setDeptLabels] = useState<Record<string, string>>({});
  const [fnLabels, setFnLabels] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [cropMime, setCropMime] = useState("image/jpeg");
  const inputRef = useRef<HTMLInputElement>(null);

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: p } = await supabase
      .from("profiles")
      .select("id, full_name, username, avatar_url, department, funcao, secondary_department, secondary_funcao, escopo")
      .eq("id", user.id)
      .maybeSingle();
    setData({ ...(p as Omit<ProfileData, "email">), email: user.email ?? null });

    const { data: deps } = await supabase.from("carbo_departments").select("key,label");
    setDeptLabels(Object.fromEntries((deps ?? []).map((d) => [d.key, d.label])));
    const { data: fns } = await supabase.from("carbo_functions").select("department,function_key,label");
    setFnLabels(Object.fromEntries((fns ?? []).map((f) => [`${f.department}:${f.function_key}`, f.label])));
  }

  useEffect(() => { load(); }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Selecione uma imagem (JPG, PNG, WebP)."); return; }
    if (file.size > 10 * 1024 * 1024) { toast.error("Imagem deve ter no máximo 10MB."); return; }
    const reader = new FileReader();
    reader.onload = () => { setCropMime(file.type); setCropSrc(reader.result as string); };
    reader.readAsDataURL(file);
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleCropConfirm = async (blob: Blob) => {
    if (!data) return;
    setCropSrc(null);
    setUploading(true);
    try {
      const ext = cropMime === "image/png" ? "png" : "jpg";
      const path = `${data.id}.${ext}`;
      const { error: upErr } = await supabase.storage.from("avatars")
        .upload(path, blob, { upsert: true, contentType: cropMime });
      if (upErr) throw upErr;
      const { data: { publicUrl } } = supabase.storage.from("avatars").getPublicUrl(path);
      const { error: updErr } = await supabase.from("profiles").update({ avatar_url: publicUrl }).eq("id", data.id);
      if (updErr) throw updErr;
      await load();
      toast.success("Foto atualizada!");
    } catch (err) {
      toast.error("Erro ao enviar foto: " + (err instanceof Error ? err.message : "tente novamente"));
    } finally {
      setUploading(false);
    }
  };

  const deptLabel = data?.department ? (deptLabels[data.department] ?? data.department) : null;
  const funcaoLabel = data?.funcao ? (fnLabels[`${data.department}:${data.funcao}`] ?? data.funcao) : null;
  const secDeptLabel = data?.secondary_department ? (deptLabels[data.secondary_department] ?? data.secondary_department) : null;
  const secFuncaoLabel = data?.secondary_funcao ? (fnLabels[`${data.secondary_department}:${data.secondary_funcao}`] ?? data.secondary_funcao) : null;

  const primary = deptLabel && funcaoLabel ? `${funcaoLabel} · ${deptLabel}` : deptLabel || funcaoLabel;
  const secondary = secDeptLabel && secFuncaoLabel ? `${secFuncaoLabel} · ${secDeptLabel}` : secDeptLabel || secFuncaoLabel || null;

  return (
    <div className="p-4 md:p-6 max-w-md mx-auto w-full space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Meu Perfil</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Suas informações no sistema</p>
      </div>

      <CarboCard>
        <CarboCardContent className="p-6 flex flex-col items-center gap-4">
          <div className="relative">
            <div className="w-24 h-24 rounded-full overflow-hidden ring-4 ring-border">
              <img src={data?.avatar_url || (data?.id ? diceBearUrl(data.id) : "")} alt="avatar" className="w-full h-full object-cover" />
            </div>
            <button onClick={() => inputRef.current?.click()} disabled={uploading}
              className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-carbo-green text-white flex items-center justify-center shadow-md hover:bg-carbo-green/90 transition-colors disabled:opacity-60">
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
            </button>
            <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
          </div>
          <div className="text-center">
            <p className="font-semibold text-lg">{data?.full_name || "—"}</p>
            {data?.username && <p className="text-sm text-muted-foreground">@{data.username}</p>}
          </div>
          <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()} disabled={uploading}>
            {uploading ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Enviando...</> : <><Camera className="h-4 w-4 mr-1.5" /> Alterar foto</>}
          </Button>
        </CarboCardContent>
      </CarboCard>

      <CarboCard>
        <CarboCardContent className="p-4">
          <InfoRow icon={User} label="Nome completo" value={data?.full_name} />
          <InfoRow icon={Mail} label="E-mail" value={data?.email} />
          <InfoRow icon={Building2} label="Departamento" value={primary} />
          {secondary && <InfoRow icon={Building2} label="Papel secundário" value={secondary} />}
          <InfoRow icon={Briefcase} label="Escopo" value={data?.escopo} />
        </CarboCardContent>
      </CarboCard>

      <p className="text-xs text-center text-muted-foreground">
        Para alterar outras informações, solicite ao seu gestor.
      </p>

      <AvatarCropDialog imageSrc={cropSrc} mimeType={cropMime} onConfirm={handleCropConfirm} onCancel={() => setCropSrc(null)} />
    </div>
  );
}
