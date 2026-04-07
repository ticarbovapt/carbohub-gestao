import { useState } from "react";
import { CarboCard, CarboCardContent, CarboCardHeader, CarboCardTitle } from "@/components/ui/carbo-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  KeyRound, Mail, UserX, RefreshCw, Copy, CheckCircle2,
  Clock, LogIn, Loader2, ShieldCheck, ShieldOff,
} from "lucide-react";
import {
  useLicenseeAccessInfo, useCreateLicenseeAccess,
  useResendLicenseeWelcome, useResetLicenseePassword, useRevokeLicenseeAccess,
  type LicenseeAccessStatus,
} from "@/hooks/useLicenseeAccess";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface Props {
  licenseeId: string;
  licenseeEmail?: string | null;
  licenseeName: string;
  licenseeCode?: string;
  isAdmin?: boolean;
}

const STATUS_CONFIG: Record<LicenseeAccessStatus, { label: string; color: string; icon: typeof ShieldCheck }> = {
  no_access: { label: "Sem acesso",          color: "bg-muted text-muted-foreground",   icon: ShieldOff },
  pending:   { label: "Aguardando ativação", color: "bg-amber-500/15 text-amber-500",   icon: Clock },
  active:    { label: "Ativo",               color: "bg-green-500/15 text-green-500",   icon: ShieldCheck },
};

export function LicenseeAccessCard({ licenseeId, licenseeEmail, licenseeName, licenseeCode, isAdmin }: Props) {
  const { data: access, isLoading } = useLicenseeAccessInfo(licenseeId);
  const createAccess   = useCreateLicenseeAccess();
  const resendWelcome  = useResendLicenseeWelcome();
  const resetPassword  = useResetLicenseePassword();
  const revokeAccess   = useRevokeLicenseeAccess();

  const [createOpen, setCreateOpen] = useState(false);
  const [revokeOpen, setRevokeOpen] = useState(false);
  const [createEmail, setCreateEmail] = useState(licenseeEmail || "");
  const [lastSetPasswordUrl, setLastSetPasswordUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleCreate() {
    if (!createEmail.trim()) return;
    const result = await createAccess.mutateAsync({
      licenseeId,
      email: createEmail.trim(),
      fullName: licenseeName,
      licenseeCode,
    });
    if (result.setPasswordUrl && !result.emailSent) {
      setLastSetPasswordUrl(result.setPasswordUrl);
    } else {
      setCreateOpen(false);
    }
  }

  async function handleResend() {
    if (!access?.userId || !access.email) return;
    const result = await resendWelcome.mutateAsync({
      userId: access.userId,
      email: access.email,
      fullName: licenseeName,
      licenseeCode,
    });
    if (result.setPasswordUrl && !result.emailSent) {
      setLastSetPasswordUrl(result.setPasswordUrl);
    }
  }

  function handleCopy(url: string) {
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (isLoading) return null;

  const status = access?.status ?? "no_access";
  const cfg    = STATUS_CONFIG[status];
  const Icon   = cfg.icon;

  return (
    <>
      <CarboCard>
        <CarboCardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CarboCardTitle className="text-base flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-primary" />
              Acesso ao Portal
            </CarboCardTitle>
            <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium", cfg.color)}>
              <Icon className="h-3.5 w-3.5" />
              {cfg.label}
            </span>
          </div>
        </CarboCardHeader>

        <CarboCardContent className="space-y-4">
          {/* No access state */}
          {status === "no_access" && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Este licenciado ainda não possui acesso ao portal{" "}
                <strong className="text-foreground">/licensee/dashboard</strong>.
              </p>
              {isAdmin && (
                <Button
                  size="sm"
                  className="w-full gap-2"
                  onClick={() => {
                    setCreateEmail(licenseeEmail || "");
                    setCreateOpen(true);
                  }}
                >
                  <KeyRound className="h-4 w-4" />
                  Criar Acesso
                </Button>
              )}
            </div>
          )}

          {/* Has access */}
          {status !== "no_access" && access && (
            <div className="space-y-4">
              {/* Info grid */}
              <div className="grid grid-cols-1 gap-2 text-sm">
                {access.email && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Mail className="h-4 w-4 flex-shrink-0" />
                    <span className="font-medium text-foreground">{access.email}</span>
                  </div>
                )}
                {access.lastAccess && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <LogIn className="h-4 w-4 flex-shrink-0" />
                    <span>
                      Último acesso:{" "}
                      <span className="text-foreground">
                        {format(new Date(access.lastAccess), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                      </span>
                    </span>
                  </div>
                )}
                {!access.lastAccess && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <LogIn className="h-4 w-4 flex-shrink-0" />
                    <span>Nunca acessou</span>
                  </div>
                )}
                {access.createdAt && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Clock className="h-4 w-4 flex-shrink-0" />
                    <span>
                      Acesso criado em{" "}
                      <span className="text-foreground">
                        {format(new Date(access.createdAt), "dd/MM/yyyy", { locale: ptBR })}
                      </span>
                    </span>
                  </div>
                )}
              </div>

              {/* Pending activation note */}
              {status === "pending" && (
                <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2 text-xs text-amber-600">
                  Aguardando o licenciado definir sua senha de primeiro acesso.
                </div>
              )}

              {/* Action buttons */}
              {isAdmin && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2 h-9"
                    onClick={handleResend}
                    disabled={resendWelcome.isPending}
                  >
                    {resendWelcome.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Mail className="h-4 w-4" />
                    )}
                    Reenviar E-mail
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2 h-9"
                    onClick={() => access.email && resetPassword.mutate({ email: access.email })}
                    disabled={resetPassword.isPending || !access.email}
                  >
                    {resetPassword.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                    Redefinir Senha
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2 h-9 col-span-full text-destructive border-destructive/30 hover:bg-destructive/10"
                    onClick={() => setRevokeOpen(true)}
                  >
                    <UserX className="h-4 w-4" />
                    Revogar Acesso
                  </Button>
                </div>
              )}
            </div>
          )}
        </CarboCardContent>
      </CarboCard>

      {/* ── Create Access Dialog ─────────────────────────────────── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-primary" />
              Criar Acesso — {licenseeName}
            </DialogTitle>
          </DialogHeader>

          {!lastSetPasswordUrl ? (
            <div className="space-y-4 py-2">
              <p className="text-sm text-muted-foreground">
                Será criado um login no portal Área Licenciados. O licenciado receberá um e-mail
                com o link para definir sua senha.
              </p>
              <div className="space-y-2">
                <Label>
                  E-mail de acesso <span className="text-destructive">*</span>
                </Label>
                <Input
                  type="email"
                  className="h-11"
                  placeholder="email@empresa.com.br"
                  value={createEmail}
                  onChange={e => setCreateEmail(e.target.value)}
                  autoFocus
                />
                <p className="text-xs text-muted-foreground">
                  Será o login do licenciado. Recomendado usar o e-mail do cadastro.
                </p>
              </div>
              <div className="rounded-lg bg-muted/50 border border-border p-3 text-xs text-muted-foreground space-y-1">
                <p>✓ Acesso restrito a <strong className="text-foreground">/licensee/dashboard</strong></p>
                <p>✓ Link de definição de senha expira em 72h</p>
                <p>✓ Primeiro acesso exige troca de senha</p>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
                <Button
                  onClick={handleCreate}
                  disabled={createAccess.isPending || !createEmail.trim()}
                >
                  {createAccess.isPending ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Criando...</>
                  ) : (
                    <><KeyRound className="h-4 w-4 mr-2" /> Criar Acesso</>
                  )}
                </Button>
              </DialogFooter>
            </div>
          ) : (
            /* Success — email not sent, show link to copy */
            <div className="space-y-4 py-2">
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle2 className="h-5 w-5" />
                <p className="font-medium">Acesso criado com sucesso!</p>
              </div>
              <p className="text-sm text-muted-foreground">
                O e-mail automático não foi enviado. Compartilhe o link abaixo com o licenciado:
              </p>
              <div className="flex gap-2">
                <Input
                  readOnly
                  className="font-mono text-xs h-10"
                  value={lastSetPasswordUrl}
                />
                <Button
                  variant="outline"
                  size="icon"
                  className="h-10 w-10 flex-shrink-0"
                  onClick={() => handleCopy(lastSetPasswordUrl!)}
                >
                  {copied ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-xs text-amber-600">⚠ Este link expira em 72 horas.</p>
              <DialogFooter>
                <Button onClick={() => { setCreateOpen(false); setLastSetPasswordUrl(null); }}>
                  Fechar
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Revoke Confirm Dialog ────────────────────────────────── */}
      <AlertDialog open={revokeOpen} onOpenChange={setRevokeOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revogar acesso ao portal?</AlertDialogTitle>
            <AlertDialogDescription>
              O licenciado <strong>{licenseeName}</strong> perderá o acesso ao portal imediatamente.
              O cadastro no sistema não será excluído. Esta ação pode ser desfeita criando um novo acesso.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => {
                if (access?.userId) {
                  revokeAccess.mutate({ licenseeId, userId: access.userId });
                }
                setRevokeOpen(false);
              }}
            >
              Revogar Acesso
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
