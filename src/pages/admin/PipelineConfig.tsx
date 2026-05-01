import React, { useState, useEffect } from "react";
import { BoardLayout } from "@/components/layouts/BoardLayout";
import { FUNNEL_CONFIG, getStagesForFunnel } from "@/types/crm";
import type { FunnelType } from "@/types/crm";
import {
  FIELD_LABELS,
  DEFAULT_REQUIRED,
  usePipelineStageConfig,
  useUpsertPipelineStage,
} from "@/hooks/useCRMPipelineGating";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Cog, Save, ChevronRight } from "lucide-react";

const AVAILABLE_FIELDS = Object.keys(FIELD_LABELS) as (keyof typeof FIELD_LABELS)[];

export default function PipelineConfig() {
  const [selectedFunnel, setSelectedFunnel] = useState<FunnelType>("f1");
  const [localConfig, setLocalConfig] = useState<Record<string, string[]>>({});
  const [isDirty, setIsDirty] = useState(false);

  const { data: dbConfig = {}, isLoading } = usePipelineStageConfig(selectedFunnel);
  const upsert = useUpsertPipelineStage();

  useEffect(() => {
    setLocalConfig({});
    setIsDirty(false);
  }, [selectedFunnel]);

  const stages = getStagesForFunnel(selectedFunnel);

  const getConfigForStage = (stageSlug: string): string[] => {
    if (localConfig[stageSlug] !== undefined) return localConfig[stageSlug];
    if (dbConfig[stageSlug] !== undefined) return dbConfig[stageSlug];
    return DEFAULT_REQUIRED[selectedFunnel]?.[stageSlug] ?? [];
  };

  const toggleField = (stageSlug: string, field: string) => {
    const current = getConfigForStage(stageSlug);
    const next = current.includes(field)
      ? current.filter((f) => f !== field)
      : [...current, field];
    setLocalConfig((prev) => ({ ...prev, [stageSlug]: next }));
    setIsDirty(true);
  };

  const saveStage = (stageSlug: string) => {
    upsert.mutate({
      funnelType: selectedFunnel,
      stageSlug,
      requiredFields: getConfigForStage(stageSlug),
    });
    setLocalConfig((prev) => {
      const copy = { ...prev };
      delete copy[stageSlug];
      return copy;
    });
    setIsDirty(Object.keys(localConfig).length > 1);
  };

  const saveAll = () => {
    stages.forEach(({ id: stageSlug }) => {
      upsert.mutate({
        funnelType: selectedFunnel,
        stageSlug,
        requiredFields: getConfigForStage(stageSlug),
      });
    });
    setLocalConfig({});
    setIsDirty(false);
  };

  const selectedFunnelConfig = FUNNEL_CONFIG[selectedFunnel];

  return (
    <BoardLayout>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <Cog className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">Config. Pipeline CRM</h1>
              <p className="text-sm text-muted-foreground">
                Defina quais campos são obrigatórios para avançar em cada etapa
              </p>
            </div>
          </div>
          {isDirty && (
            <Button onClick={saveAll} disabled={upsert.isPending} className="gap-2">
              <Save className="h-4 w-4" />
              Salvar Tudo
            </Button>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[280px,1fr] gap-4">
          {/* Left panel — funnel selector */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                Funis
              </CardTitle>
            </CardHeader>
            <CardContent className="p-2">
              <div className="flex flex-col gap-1">
                {(Object.values(FUNNEL_CONFIG) as typeof FUNNEL_CONFIG[FunnelType][]).map((funnel) => (
                  <button
                    key={funnel.id}
                    onClick={() => setSelectedFunnel(funnel.id)}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors w-full ${
                      selectedFunnel === funnel.id
                        ? "bg-primary/10 text-primary font-semibold"
                        : "hover:bg-muted text-foreground"
                    }`}
                  >
                    <span className="text-lg">{funnel.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{funnel.shortName}</p>
                      <p className="text-xs text-muted-foreground truncate">{funnel.cycleLabel}</p>
                    </div>
                    {selectedFunnel === funnel.id && (
                      <ChevronRight className="h-4 w-4 text-primary flex-shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Right panel — stages */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">{selectedFunnelConfig.icon}</span>
                <div>
                  <CardTitle className="text-base">{selectedFunnelConfig.name}</CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">{selectedFunnelConfig.description}</p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="h-20 rounded-lg bg-muted animate-pulse" />
                  ))}
                </div>
              ) : (
                <ScrollArea className="max-h-[calc(100vh-280px)]">
                  <div className="space-y-3 pr-2">
                    {stages.map(({ id: stageSlug, label, icon, color }) => {
                      const currentFields = getConfigForStage(stageSlug);
                      const isStageModified = localConfig[stageSlug] !== undefined;
                      const isFromDB = dbConfig[stageSlug] !== undefined;
                      const isFromDefault = !isFromDB && (DEFAULT_REQUIRED[selectedFunnel]?.[stageSlug]?.length ?? 0) > 0;

                      return (
                        <div
                          key={stageSlug}
                          className={`rounded-xl border p-4 transition-colors ${
                            isStageModified ? "border-primary/40 bg-primary/5" : "border-border bg-card"
                          }`}
                        >
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                              <span>{icon}</span>
                              <p className="text-sm font-semibold text-foreground">{label}</p>
                              {isFromDB && !isStageModified && (
                                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">DB</Badge>
                              )}
                              {isFromDefault && !isStageModified && (
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground">padrão</Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground">
                                {currentFields.length} obrigatório{currentFields.length !== 1 ? "s" : ""}
                              </span>
                              {isStageModified && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => saveStage(stageSlug)}
                                  disabled={upsert.isPending}
                                  className="h-7 text-xs gap-1"
                                >
                                  <Save className="h-3 w-3" />
                                  Salvar
                                </Button>
                              )}
                            </div>
                          </div>

                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {AVAILABLE_FIELDS.map((field) => {
                              const checked = currentFields.includes(field);
                              return (
                                <div key={field} className="flex items-center gap-2">
                                  <Checkbox
                                    id={`${stageSlug}-${field}`}
                                    checked={checked}
                                    onCheckedChange={() => toggleField(stageSlug, field)}
                                  />
                                  <Label
                                    htmlFor={`${stageSlug}-${field}`}
                                    className="text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors"
                                  >
                                    {FIELD_LABELS[field]}
                                  </Label>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </BoardLayout>
  );
}
