import { useInfiniteQuery, useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

// Notificações COMPARTILHADAS: mesma tabela `notifications` de todos os apps
// (admin, ops, finance, sales). Cada linha é por usuário (user_id) — o escopo
// já é decidido no fan-out que cria as notificações. Cliente sem tipo gerado.
const db = supabase as unknown as { from: (t: string) => any };
export interface Notification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  is_read: boolean;
  reference_type: string | null;
  reference_id: string | null;
  created_at: string;
}

// ⚠️ Era `.limit(50)` e PONTO (22/10/2026): a 51ª notificação empurrava a mais
// antiga para fora do sininho, e o contador de não lidas parava em 50 — quem
// ficou um dia fora perdia aviso sem saber que perdeu. Nada era apagado do
// banco; a tela é que não mostrava. Hoje:
//   • as CONTAGENS vêm do banco (`count: exact`), nunca do que foi baixado;
//   • a lista vem em PÁGINAS de 50 ("Carregar mais antigas"), nunca tudo;
//   • "Não lidas" é consulta PRÓPRIA — filtrar as 50 baixadas esconderia a
//     não lida de três dias atrás debaixo de 50 lidas de hoje.
// ⚠️ Ordem estável (created_at + id): sem o desempate, duas notificações do
// mesmo fan-out (mesmo instante) podem repetir ou sumir na troca de página.
// ⚠️ A chave começa com ["notifications", uid]: é esse PREFIXO que o Realtime
// e as mutações invalidam — chave fora dele não atualizaria ao vivo.
const POR_PAGINA = 50;

export function useNotifications() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const lerPagina = async (soNaoLidas: boolean, pagina: number) => {
    if (!user) return [] as Notification[];
    let q = db
      .from("notifications")
      .select("*")
      .eq("user_id", user.id);
    if (soNaoLidas) q = q.eq("is_read", false);
    const { data, error } = await q
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(pagina * POR_PAGINA, pagina * POR_PAGINA + POR_PAGINA - 1);
    if (error) throw error;
    return (data || []) as Notification[];
  };

  const lista = (soNaoLidas: boolean) => ({
    queryKey: ["notifications", user?.id, soNaoLidas ? "nao-lidas" : "todas"],
    queryFn: ({ pageParam }: { pageParam: number }) => lerPagina(soNaoLidas, pageParam),
    initialPageParam: 0,
    getNextPageParam: (ultima: Notification[], paginas: Notification[][]) =>
      ultima.length === POR_PAGINA ? paginas.length : undefined,
    enabled: !!user,
    // ⚠️ Rede de segurança, não o caminho principal: quem traz a notificação
    // nova na hora é o Realtime (useLiveNotifications invalida esta chave).
    refetchInterval: 120_000,
  });

  const todasQuery = useInfiniteQuery(lista(false));
  const naoLidasQuery = useInfiniteQuery(lista(true));

  const contagemQuery = useQuery({
    queryKey: ["notifications", user?.id, "contagem"],
    queryFn: async () => {
      if (!user) return { total: 0, naoLidas: 0 };
      const contar = async (soNaoLidas: boolean) => {
        let q = db
          .from("notifications")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id);
        if (soNaoLidas) q = q.eq("is_read", false);
        const { count, error } = await q;
        if (error) throw error;
        return count ?? 0;
      };
      const [total, naoLidas] = await Promise.all([contar(false), contar(true)]);
      return { total, naoLidas };
    },
    enabled: !!user,
    refetchInterval: 120_000,
  });

  const invalidar = () => queryClient.invalidateQueries({ queryKey: ["notifications", user?.id] });

  const markAsReadMutation = useMutation({
    mutationFn: async (notificationId: string) => {
      const { error } = await db
        .from("notifications")
        .update({ is_read: true })
        .eq("id", notificationId);
      if (error) throw error;
    },
    onSuccess: invalidar,
  });

  const markAllAsReadMutation = useMutation({
    mutationFn: async () => {
      if (!user) return;
      const { error } = await db
        .from("notifications")
        .update({ is_read: true })
        .eq("user_id", user.id)
        .eq("is_read", false);
      if (error) throw error;
    },
    onSuccess: invalidar,
  });

  const deleteNotificationMutation = useMutation({
    mutationFn: async (notificationId: string) => {
      const { error } = await db.from("notifications").delete().eq("id", notificationId);
      if (error) throw error;
    },
    onSuccess: invalidar,
  });

  // Páginas lidas por deslocamento: notificação nova entre duas páginas empurra
  // uma linha para a seguinte, e ela viria repetida — o id decide.
  const achatar = (paginas?: Notification[][]) => {
    const vistos = new Set<string>();
    return (paginas ?? []).flat().filter((n) => (vistos.has(n.id) ? false : (vistos.add(n.id), true)));
  };
  const notifications = achatar(todasQuery.data?.pages);
  const unreadNotifications = achatar(naoLidasQuery.data?.pages);

  return {
    notifications,
    unreadNotifications,
    readNotifications: notifications.filter((n) => n.is_read),
    unreadCount: contagemQuery.data?.naoLidas ?? unreadNotifications.length,
    totalCount: contagemQuery.data?.total ?? notifications.length,
    isLoading: todasQuery.isLoading,
    hasMore: !!todasQuery.hasNextPage,
    loadMore: () => todasQuery.fetchNextPage(),
    hasMoreUnread: !!naoLidasQuery.hasNextPage,
    loadMoreUnread: () => naoLidasQuery.fetchNextPage(),
    isLoadingMore: todasQuery.isFetchingNextPage || naoLidasQuery.isFetchingNextPage,
    markAsRead: markAsReadMutation.mutate,
    markAllAsRead: markAllAsReadMutation.mutate,
    deleteNotification: deleteNotificationMutation.mutate,
  };
}
