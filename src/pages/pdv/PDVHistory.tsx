import React, { useState } from "react";
import { motion } from "framer-motion";
import { 
  History, 
  Package, 
  CheckCircle,
  ArrowUpCircle,
  Calendar,
  FileText,
  TrendingUp,
  Link as LinkIcon,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { usePDVStatus, usePDVData, usePDVReplenishmentHistory } from "@/hooks/usePDV";
import { useAuth } from "@/contexts/AuthContext";
import { LinkPDVDialog } from "@/components/pdv/LinkPDVDialog";
import { CarboSkeleton } from "@/components/ui/CarboSkeleton";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function PDVHistory() {
  const { data: pdvStatus, isLoading: statusLoading } = usePDVStatus();
  const { isAdmin, isCeo } = useAuth();
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const pdvId = pdvStatus?.pdv?.id;
  const { data: pdv, isLoading: pdvLoading } = usePDVData(pdvId);
  const { data: history, isLoading: historyLoading } = usePDVReplenishmentHistory(pdvId);

  const isLoading = statusLoading || pdvLoading || historyLoading;

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <CarboSkeleton className="h-10 w-64" />
        <div className="space-y-4">
          <CarboSkeleton className="h-24" />
          <CarboSkeleton className="h-24" />
          <CarboSkeleton className="h-24" />
        </div>
      </div>
    );
  }

  if (!pdv) {
    return (
      <div className="p-6">
        <div className="text-center py-12">
          <Package className="h-16 w-16 mx-auto text-muted-foreground/50 mb-4" />
          <h2 className="text-xl font-semibold text-foreground mb-2">PDV não encontrado</h2>
          <p className="text-muted-foreground mb-6">
            Seu usuário não está vinculado a nenhum PDV.
          </p>
          {(isAdmin || isCeo) && (
            <>
              <Button onClick={() => setLinkDialogOpen(true)} variant="default">
                <LinkIcon className="h-4 w-4 mr-2" />
                Vincular PDV
              </Button>
              <LinkPDVDialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen} />
            </>
          )}
        </div>
      </div>
    );
  }

  // Calculate stats
  const totalReplenishments = history?.length || 0;
  const totalUnitsReceived = history?.reduce((sum, h) => sum + h.quantity, 0) || 0;
  const avgReplenishmentQty = totalReplenishments > 0 
    ? Math.round(totalUnitsReceived / totalReplenishments) 
    : 0;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <PageHeader
        title="Histórico de Reposições"
        description="Acompanhe todas as reposições de estoque do seu PDV"
        icon={<History className="h-6 w-6 text-primary" />}
      />

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-primary/10 rounded-xl">
                <History className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{totalReplenishments}</p>
                <p className="text-sm text-muted-foreground">Reposições</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-carbo-green/10 rounded-xl">
                <ArrowUpCircle className="h-6 w-6 text-carbo-green" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{totalUnitsReceived}</p>
                <p className="text-sm text-muted-foreground">Unidades Recebidas</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-amber-500/10 rounded-xl">
                <TrendingUp className="h-6 w-6 text-amber-500" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{avgReplenishmentQty}</p>
                <p className="text-sm text-muted-foreground">Média por Reposição</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* History List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Histórico Detalhado
          </CardTitle>
        </CardHeader>
        <CardContent>
          {history && history.length > 0 ? (
            <div className="space-y-4">
              {history.map((item, index) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="flex items-center gap-4 p-4 bg-muted/50 rounded-xl hover:bg-muted transition-colors"
                >
                  {/* Icon */}
                  <div className="p-3 bg-carbo-green/10 rounded-lg shrink-0">
                    <CheckCircle className="h-5 w-5 text-carbo-green" />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-foreground">
                        +{item.quantity} unidades
                      </span>
                      <Badge variant="outline" className="text-xs">
                        Reposição #{history.length - index}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5" />
                        {format(new Date(item.createdAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                      </span>
                      <span>
                        Estoque: {item.previousStock} → {item.newStock}
                      </span>
                    </div>
                    {item.notes && (
                      <p className="text-xs text-muted-foreground mt-1 truncate">
                        {item.notes}
                      </p>
                    )}
                  </div>

                  {/* Status Badge */}
                  <Badge variant="secondary" className="bg-carbo-green/10 text-carbo-green shrink-0">
                    Concluído
                  </Badge>
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <History className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground">
                Nenhum histórico de reposição ainda.
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Suas reposições aparecerão aqui.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
