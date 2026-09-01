import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Plus, Trash2 } from "lucide-react";
import {
  useCrmSettings,
  useDeleteStage,
  usePipelines,
  useSaveCrmSetting,
  useSavePipeline,
  useSaveStage,
  useStages,
} from "@/hooks/useAgendor";

interface AgendorSettingsPanelProps {
  pipelineId: string | null;
  onPipelineChange: (id: string) => void;
}

/** Configurações do módulo: funis, etapas, motivos de perda, origens e regras de saúde. */
export function AgendorSettingsPanel({ pipelineId, onPipelineChange }: AgendorSettingsPanelProps) {
  const { data: pipelines = [] } = usePipelines();
  const { data: stages = [] } = useStages(pipelineId);
  const { data: settings } = useCrmSettings();
  const savePipeline = useSavePipeline();
  const saveStage = useSaveStage();
  const deleteStage = useDeleteStage();
  const saveSetting = useSaveCrmSetting();

  const [newPipeline, setNewPipeline] = useState("");
  const [newStage, setNewStage] = useState("");
  const [newReason, setNewReason] = useState("");
  const [newSource, setNewSource] = useState("");
  const [staleDays, setStaleDays] = useState("");
  const [warningDays, setWarningDays] = useState("");

  const rules = settings?.health_rules ?? { stale_days: 7, warning_days: 3 };

  const removeFromList = (key: "loss_reasons" | "sources", item: string) => {
    const current = settings?.[key] ?? [];
    saveSetting.mutate({ key, value: current.filter((i) => i !== item) });
  };

  const addToList = (key: "loss_reasons" | "sources", item: string) => {
    const value = item.trim();
    if (!value) return;
    const current = settings?.[key] ?? [];
    if (current.includes(value)) return;
    saveSetting.mutate({ key, value: [...current, value] });
  };

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-4">
        <h3 className="text-sm font-semibold">Funis</h3>
        <div className="flex flex-wrap gap-2">
          {pipelines.map((p) => (
            <Button
              key={p.id}
              size="sm"
              variant={p.id === pipelineId ? "default" : "outline"}
              onClick={() => onPipelineChange(p.id)}
            >
              {p.name}
              {p.is_default && <span className="ml-1.5 text-[10px] opacity-80">padrão</span>}
            </Button>
          ))}
        </div>
        <div className="flex gap-2">
          <Input
            placeholder="Nome do novo funil (ex.: Pré-vendas)"
            value={newPipeline}
            onChange={(e) => setNewPipeline(e.target.value)}
          />
          <Button
            className="gap-1.5 shrink-0"
            onClick={() => {
              if (!newPipeline.trim()) return;
              savePipeline.mutate({ name: newPipeline.trim(), sort_order: pipelines.length });
              setNewPipeline("");
            }}
          >
            <Plus className="w-4 h-4" />
            Criar
          </Button>
        </div>
        {pipelineId && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => savePipeline.mutate({ id: pipelineId, name: pipelines.find((p) => p.id === pipelineId)?.name ?? "", is_default: true })}
          >
            Definir funil atual como padrão
          </Button>
        )}
      </Card>

      <Card className="p-4 space-y-3">
        <h3 className="text-sm font-semibold">Etapas do funil selecionado</h3>
        {stages.map((stage) => (
          <div key={stage.id} className="flex items-center gap-2 py-1.5 border-b last:border-b-0">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{stage.name}</p>
              <p className="text-xs text-muted-foreground">
                Probabilidade {stage.probability}%
                {stage.is_won ? " • etapa de ganho" : stage.is_lost ? " • etapa de perda" : ""}
              </p>
            </div>
            <Input
              type="number"
              min={0}
              max={100}
              className="w-20"
              defaultValue={stage.probability}
              aria-label={`Probabilidade de ${stage.name}`}
              onBlur={(e) =>
                saveStage.mutate({
                  id: stage.id,
                  name: stage.name,
                  pipeline_id: stage.pipeline_id,
                  probability: Number(e.target.value) || 0,
                })
              }
            />
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Remover etapa ${stage.name}`}
              onClick={() => deleteStage.mutate(stage.id)}
            >
              <Trash2 className="w-4 h-4 text-destructive" />
            </Button>
          </div>
        ))}
        <div className="flex gap-2">
          <Input placeholder="Nova etapa" value={newStage} onChange={(e) => setNewStage(e.target.value)} />
          <Button
            className="gap-1.5 shrink-0"
            disabled={!pipelineId}
            onClick={() => {
              if (!newStage.trim() || !pipelineId) return;
              saveStage.mutate({
                name: newStage.trim(),
                pipeline_id: pipelineId,
                sort_order: stages.length,
                probability: 50,
                color: "slate",
              });
              setNewStage("");
            }}
          >
            <Plus className="w-4 h-4" />
            Adicionar
          </Button>
        </div>
      </Card>

      <Card className="p-4 space-y-4">
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Motivos de perda</h3>
          <div className="flex flex-wrap gap-2">
            {(settings?.loss_reasons ?? []).map((reason) => (
              <Badge key={reason} variant="secondary" className="gap-1.5">
                {reason}
                <button type="button" aria-label={`Remover ${reason}`} onClick={() => removeFromList("loss_reasons", reason)}>
                  ×
                </button>
              </Badge>
            ))}
          </div>
          <div className="flex gap-2">
            <Input placeholder="Novo motivo" value={newReason} onChange={(e) => setNewReason(e.target.value)} />
            <Button
              variant="outline"
              className="shrink-0"
              onClick={() => {
                addToList("loss_reasons", newReason);
                setNewReason("");
              }}
            >
              Adicionar
            </Button>
          </div>
        </div>

        <Separator />

        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Origens de lead</h3>
          <div className="flex flex-wrap gap-2">
            {(settings?.sources ?? []).map((source) => (
              <Badge key={source} variant="outline" className="gap-1.5">
                {source}
                <button type="button" aria-label={`Remover ${source}`} onClick={() => removeFromList("sources", source)}>
                  ×
                </button>
              </Badge>
            ))}
          </div>
          <div className="flex gap-2">
            <Input placeholder="Nova origem" value={newSource} onChange={(e) => setNewSource(e.target.value)} />
            <Button
              variant="outline"
              className="shrink-0"
              onClick={() => {
                addToList("sources", newSource);
                setNewSource("");
              }}
            >
              Adicionar
            </Button>
          </div>
        </div>

        <Separator />

        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Saúde do funil</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="warning-days">Dias sem movimentação para "atenção"</Label>
              <Input
                id="warning-days"
                type="number"
                min={1}
                placeholder={String(rules.warning_days)}
                value={warningDays}
                onChange={(e) => setWarningDays(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="stale-days">Dias sem movimentação para "crítico"</Label>
              <Input
                id="stale-days"
                type="number"
                min={1}
                placeholder={String(rules.stale_days)}
                value={staleDays}
                onChange={(e) => setStaleDays(e.target.value)}
              />
            </div>
          </div>
          <Button
            size="sm"
            onClick={() =>
              saveSetting.mutate({
                key: "health_rules",
                value: {
                  warning_days: Number(warningDays) || rules.warning_days,
                  stale_days: Number(staleDays) || rules.stale_days,
                },
              })
            }
          >
            Salvar regras
          </Button>
        </div>
      </Card>
    </div>
  );
}
