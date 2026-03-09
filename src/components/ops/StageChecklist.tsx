import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { 
  Check, 
  Save, 
  AlertCircle, 
  SkipForward,
  FileUp,
  Calendar
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { 
  useStageConfigs, 
  useOsStageValidations,
  useSaveChecklistResponses,
  useValidateStage,
  useSkipStage,
  useCanValidateStage,
  OsWorkflowStage,
  ChecklistItem
} from "@/hooks/useStageValidation";
import { Skeleton } from "@/components/ui/skeleton";

interface StageChecklistProps {
  osId: string;
  stage: OsWorkflowStage;
  onComplete?: () => void;
}

export function StageChecklist({ osId, stage, onComplete }: StageChecklistProps) {
  const { data: configs, isLoading: configsLoading } = useStageConfigs();
  const { data: validations, isLoading: validationsLoading } = useOsStageValidations(osId);
  
  const saveResponses = useSaveChecklistResponses();
  const validateStage = useValidateStage();
  const skipStage = useSkipStage();
  
  const canValidate = useCanValidateStage(stage);
  
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [notes, setNotes] = useState("");
  const [skipReason, setSkipReason] = useState("");
  const [hasChanges, setHasChanges] = useState(false);

  const stageConfig = configs?.find(c => c.stage === stage);
  const existingValidation = validations?.find(v => v.stage === stage);
  const isCompleted = existingValidation?.is_complete || existingValidation?.skipped;

  // Initialize items from config or existing validation
  useEffect(() => {
    if (!stageConfig) return;

    if (existingValidation?.checklist_responses?.length) {
      setItems(existingValidation.checklist_responses);
    } else {
      setItems(stageConfig.default_items.map(item => ({ ...item, value: undefined })));
    }
    
    setNotes(existingValidation?.validation_notes || "");
  }, [stageConfig, existingValidation]);

  // Calculate progress
  const requiredItems = items.filter(i => i.required);
  const completedRequired = requiredItems.filter(i => {
    if (i.type === "checkbox") return i.value === true;
    return !!i.value;
  });
  const progress = requiredItems.length > 0 
    ? Math.round((completedRequired.length / requiredItems.length) * 100)
    : 0;

  const updateItemValue = (itemId: string, value: string | boolean | number) => {
    setItems(prev => prev.map(item => 
      item.id === itemId ? { ...item, value } : item
    ));
    setHasChanges(true);
  };

  const handleSave = async () => {
    await saveResponses.mutateAsync({
      osId,
      stage,
      responses: items,
    });
    setHasChanges(false);
  };

  const handleValidate = async () => {
    await validateStage.mutateAsync({
      osId,
      stage,
      responses: items,
      notes: notes || undefined,
    });
    onComplete?.();
  };

  const handleSkip = async () => {
    if (!skipReason.trim()) return;
    
    await skipStage.mutateAsync({
      osId,
      stage,
      reason: skipReason,
    });
    onComplete?.();
  };

  if (configsLoading || validationsLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (!stageConfig) {
    return (
      <Card className="border-destructive/50">
        <CardContent className="py-8 text-center">
          <AlertCircle className="h-12 w-12 mx-auto text-destructive mb-4" />
          <p className="text-destructive">Configuração de etapa não encontrada</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn(
      "transition-all",
      isCompleted && "opacity-75"
    )}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              {stageConfig.stage_label}
              {isCompleted && (
                <Badge variant="outline" className="bg-success/10 text-success border-success/30">
                  <Check className="h-3 w-3 mr-1" />
                  Validado
                </Badge>
              )}
              {stageConfig.is_optional && !isCompleted && (
                <Badge variant="outline">Opcional</Badge>
              )}
            </CardTitle>
            <CardDescription>{stageConfig.description}</CardDescription>
          </div>
          
          {!isCompleted && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{progress}%</span>
              <Progress value={progress} className="w-20 h-2" />
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Checklist Items */}
        <div className="space-y-3">
          {items.map((item, index) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.05 }}
              className={cn(
                "p-3 rounded-lg border transition-colors",
                item.required && !item.value && !isCompleted
                  ? "border-warning/50 bg-warning/5"
                  : "border-border bg-card"
              )}
            >
              <div className="flex items-start gap-3">
                {/* Checkbox type */}
                {item.type === "checkbox" && (
                  <Checkbox
                    id={item.id}
                    checked={item.value === true}
                    onCheckedChange={(checked) => updateItemValue(item.id, !!checked)}
                    disabled={isCompleted || !canValidate}
                  />
                )}

                <div className="flex-1 space-y-2">
                  <Label 
                    htmlFor={item.id}
                    className={cn(
                      "text-sm font-medium cursor-pointer",
                      item.type === "checkbox" && item.value === true && "line-through text-muted-foreground"
                    )}
                  >
                    {item.label}
                    {item.required && <span className="text-destructive ml-1">*</span>}
                  </Label>

                  {/* Text input */}
                  {item.type === "text" && (
                    <Input
                      value={item.value as string || ""}
                      onChange={(e) => updateItemValue(item.id, e.target.value)}
                      disabled={isCompleted || !canValidate}
                      placeholder="Digite aqui..."
                    />
                  )}

                  {/* Textarea */}
                  {item.type === "textarea" && (
                    <Textarea
                      value={item.value as string || ""}
                      onChange={(e) => updateItemValue(item.id, e.target.value)}
                      disabled={isCompleted || !canValidate}
                      placeholder="Digite aqui..."
                      rows={3}
                    />
                  )}

                  {/* Select */}
                  {item.type === "select" && item.options && (
                    <Select
                      value={item.value as string || ""}
                      onValueChange={(v) => updateItemValue(item.id, v)}
                      disabled={isCompleted || !canValidate}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione..." />
                      </SelectTrigger>
                      <SelectContent>
                        {item.options.map((opt) => (
                          <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}

                  {/* Date */}
                  {item.type === "date" && (
                    <div className="relative">
                      <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        type="date"
                        value={item.value as string || ""}
                        onChange={(e) => updateItemValue(item.id, e.target.value)}
                        disabled={isCompleted || !canValidate}
                        className="pl-10"
                      />
                    </div>
                  )}

                  {/* Number */}
                  {item.type === "number" && (
                    <Input
                      type="number"
                      value={item.value as number || ""}
                      onChange={(e) => updateItemValue(item.id, parseFloat(e.target.value) || 0)}
                      disabled={isCompleted || !canValidate}
                      placeholder="0"
                    />
                  )}

                  {/* File upload placeholder */}
                  {item.type === "file" && (
                    <div className={cn(
                      "border-2 border-dashed rounded-lg p-4 text-center transition-colors",
                      isCompleted || !canValidate
                        ? "bg-muted/50 border-muted"
                        : "border-border hover:border-primary cursor-pointer"
                    )}>
                      <FileUp className="h-6 w-6 mx-auto text-muted-foreground mb-2" />
                      <p className="text-sm text-muted-foreground">
                        {item.value ? "Arquivo anexado" : "Clique para anexar"}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Notes */}
        {!isCompleted && canValidate && (
          <div className="pt-4 border-t">
            <Label htmlFor="notes">Observações da validação</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value);
                setHasChanges(true);
              }}
              placeholder="Observações opcionais..."
              rows={2}
              className="mt-2"
            />
          </div>
        )}

        {/* Actions */}
        {!isCompleted && canValidate && (
          <div className="flex items-center justify-between pt-4 border-t">
            <div className="flex items-center gap-2">
              {stageConfig.is_optional && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" size="sm">
                      <SkipForward className="h-4 w-4 mr-2" />
                      Pular etapa
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Pular etapa opcional?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Esta etapa é opcional. Informe o motivo para pular:
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <Textarea
                      value={skipReason}
                      onChange={(e) => setSkipReason(e.target.value)}
                      placeholder="Motivo..."
                      rows={2}
                    />
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction 
                        onClick={handleSkip}
                        disabled={!skipReason.trim() || skipStage.isPending}
                      >
                        Confirmar
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>

            <div className="flex items-center gap-2">
              {hasChanges && (
                <Button
                  variant="outline"
                  onClick={handleSave}
                  disabled={saveResponses.isPending}
                >
                  <Save className="h-4 w-4 mr-2" />
                  Salvar rascunho
                </Button>
              )}
              
              <Button
                onClick={handleValidate}
                disabled={progress < 100 || validateStage.isPending}
                className="bg-success hover:bg-success/90"
              >
                <Check className="h-4 w-4 mr-2" />
                Validar etapa
              </Button>
            </div>
          </div>
        )}

        {/* No permission message */}
        {!isCompleted && !canValidate && (
          <div className="pt-4 border-t">
            <div className="flex items-center gap-2 p-3 rounded-lg bg-warning/10 border border-warning/30">
              <AlertCircle className="h-4 w-4 text-warning" />
              <p className="text-sm text-warning">
                Você não tem permissão para validar esta etapa.
              </p>
            </div>
          </div>
        )}

        {/* Completed info */}
        {existingValidation?.validated_at && (
          <div className="pt-4 border-t">
            <p className="text-xs text-muted-foreground">
              {existingValidation.skipped ? "Ignorado" : "Validado"} em{" "}
              {new Date(existingValidation.validated_at).toLocaleString("pt-BR")}
              {existingValidation.validation_notes && (
                <span className="block mt-1">
                  Obs: {existingValidation.validation_notes}
                </span>
              )}
              {existingValidation.skip_reason && (
                <span className="block mt-1">
                  Motivo: {existingValidation.skip_reason}
                </span>
              )}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
