import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// ── Types ──────────────────────────────────────────────────────────────
export type LicenseeAccessStatus = "no_access" | "pending" | "active";

export interface LicenseeAccessInfo {
  hasAccess: boolean;
  status: LicenseeAccessStatus;
  userId: string | null;
  email: string | null;
  lastAccess: string | null;
  passwordMustChange: boolean;
  createdAt: string | null;
}

// ── Query: single licensee access info ────────────────────────────────
export function useLicenseeAccessInfo(licenseeId: string | undefined) {
  return useQuery({
    queryKey: ["licensee-access", licenseeId],
    queryFn: async (): Promise<LicenseeAccessInfo> => {
      const empty: LicenseeAccessInfo = {
        hasAccess: false, status: "no_access", userId: null,
        email: null, lastAccess: null, passwordMustChange: false, createdAt: null,
      };
      if (!licenseeId) return empty;

      const { data, error } = await supabase
        .from("licensee_users")
        .select("user_id, created_at")
        .eq("licensee_id", licenseeId)
        .maybeSingle();

      if (error) throw error;
      if (!data) return empty;

      // Fetch profile details (email, last_access, password_must_change)
      const { data: profile } = await (supabase as any)
        .from("profiles")
        .select("email, last_access, password_must_change")
        .eq("id", data.user_id)
        .maybeSingle();

      const pwdMust = profile?.password_must_change ?? true;
      return {
        hasAccess: true,
        status: pwdMust ? "pending" : "active",
        userId: data.user_id,
        email: profile?.email ?? null,
        lastAccess: profile?.last_access ?? null,
        passwordMustChange: pwdMust,
        createdAt: data.created_at,
      };
    },
    enabled: !!licenseeId,
  });
}

// ── Query: all licensee access (for table column) ──────────────────────
export function useLicenseeAccessMap() {
  return useQuery({
    queryKey: ["licensee-access-map"],
    queryFn: async (): Promise<Record<string, LicenseeAccessStatus>> => {
      const { data, error } = await supabase
        .from("licensee_users")
        .select("licensee_id, user_id");
      if (error) throw error;
      if (!data || data.length === 0) return {};

      // Fetch password_must_change for all user_ids in one query
      const userIds = data.map(r => r.user_id);
      const { data: profiles } = await (supabase as any)
        .from("profiles")
        .select("id, password_must_change")
        .in("id", userIds);

      const profileMap: Record<string, boolean> = {};
      (profiles ?? []).forEach((p: any) => { profileMap[p.id] = p.password_must_change; });

      const result: Record<string, LicenseeAccessStatus> = {};
      data.forEach(r => {
        const pending = profileMap[r.user_id] ?? true;
        result[r.licensee_id] = pending ? "pending" : "active";
      });
      return result;
    },
    staleTime: 60_000,
  });
}

// ── Mutation: create licensee access ──────────────────────────────────
export function useCreateLicenseeAccess() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      licenseeId,
      email,
      fullName,
      licenseeCode,
    }: {
      licenseeId: string;
      email: string;
      fullName: string;
      licenseeCode?: string;
    }) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Você precisa estar logado");

      const response = await supabase.functions.invoke("create-licensee-access", {
        body: { licenseeId, email, fullName, licenseeCode, platformUrl: window.location.origin },
      });

      if (response.error) throw new Error(response.error.message);
      if (!response.data?.success) throw new Error(response.data?.error || "Erro ao criar acesso");

      return response.data.data as {
        userId: string;
        email: string;
        setPasswordUrl: string;
        emailSent: boolean;
        emailWarning?: string;
      };
    },
    onSuccess: (result, vars) => {
      qc.invalidateQueries({ queryKey: ["licensee-access", vars.licenseeId] });
      qc.invalidateQueries({ queryKey: ["licensee-access-map"] });
      if (result.emailSent) {
        toast.success("Acesso criado e e-mail enviado!");
      } else {
        toast.warning("Acesso criado. E-mail não enviado — compartilhe o link manualmente.", {
          duration: 8000,
        });
      }
    },
    onError: (e: Error) => toast.error("Erro ao criar acesso: " + e.message),
  });
}

// ── Mutation: resend welcome email ─────────────────────────────────────
export function useResendLicenseeWelcome() {
  return useMutation({
    mutationFn: async ({
      userId,
      email,
      fullName,
      licenseeCode,
    }: {
      userId: string;
      email: string;
      fullName: string;
      licenseeCode?: string;
    }) => {
      const { data: inviteToken, error: tokenError } = await supabase.rpc("generate_invite_token");
      if (tokenError || !inviteToken) throw new Error("Erro ao gerar novo convite");

      const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();
      await (supabase as any)
        .from("profiles")
        .update({ invite_token: inviteToken, invite_token_expires_at: expiresAt })
        .eq("id", userId);

      const setPasswordUrl = `${window.location.origin}/set-password?token=${inviteToken}`;

      const response = await supabase.functions.invoke("send-welcome-email", {
        body: {
          email,
          fullName,
          username: licenseeCode || email,
          setPasswordUrl,
          platformUrl: window.location.origin,
        },
      });

      if (response.error) throw new Error(response.error.message);
      return { setPasswordUrl, emailSent: response.data?.success ?? false };
    },
    onSuccess: (r) => {
      if (r.emailSent) {
        toast.success("E-mail de acesso reenviado!");
      } else {
        toast.warning("Token renovado. E-mail não enviado — compartilhe o link manualmente.", { duration: 8000 });
      }
    },
    onError: (e: Error) => toast.error("Erro: " + e.message),
  });
}

// ── Mutation: reset password (forgot password flow) ────────────────────
export function useResetLicenseePassword() {
  return useMutation({
    mutationFn: async ({ email }: { email: string }) => {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/set-password`,
      });
      if (error) throw error;
    },
    onSuccess: () => toast.success("E-mail de redefinição de senha enviado!"),
    onError: (e: Error) => toast.error("Erro ao enviar redefinição: " + e.message),
  });
}

// ── Mutation: revoke licensee access ──────────────────────────────────
export function useRevokeLicenseeAccess() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ licenseeId, userId }: { licenseeId: string; userId: string }) => {
      // Remove licensee_users link (does NOT delete auth user — preserves audit trail)
      const { error } = await supabase
        .from("licensee_users")
        .delete()
        .eq("licensee_id", licenseeId)
        .eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["licensee-access", vars.licenseeId] });
      qc.invalidateQueries({ queryKey: ["licensee-access-map"] });
      toast.success("Acesso ao portal revogado.");
    },
    onError: (e: Error) => toast.error("Erro ao revogar acesso: " + e.message),
  });
}
