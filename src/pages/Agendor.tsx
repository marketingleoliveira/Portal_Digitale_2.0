import { useEffect, useMemo, useState } from "react";
import DashboardLayout from "@/components/layouts/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Plus, Search } from "lucide-react";
import { AgendorStats } from "@/components/agendor/AgendorStats";
import { AgendorKanban } from "@/components/agendor/AgendorKanban";
import { DealFormDialog } from "@/components/agendor/DealFormDialog";
import { DealDetailSheet } from "@/components/agendor/DealDetailSheet";
import { OrganizationsPanel } from "@/components/agendor/OrganizationsPanel";
import { PeoplePanel } from "@/components/agendor/PeoplePanel";
import { ActivitiesPanel } from "@/components/agendor/ActivitiesPanel";
import {
  useAgendorRealtime,
  useDeals,
  usePipelines,
  useStages,
  type CrmDeal,
} from "@/hooks/useAgendor";

const Agendor = () => {
  useAgendorRealtime();
  const { data: pipelines = [], isLoading: loadingPipelines } = usePipelines();
  const [pipelineId, setPipelineId] = useState<string | null>(null);

  useEffect(() => {
    if (!pipelineId && pipelines.length > 0) {
      setPipelineId((pipelines.find((p) => p.is_default) ?? pipelines[0]).id);
    }
  }, [pipelines, pipelineId]);

  const { data: stages = [] } = useStages(pipelineId);
  const { data: deals = [], isLoading: loadingDeals } = useDeals(pipelineId);

  const [search, setSearch] = useState("");
  const [showDealForm, setShowDealForm] = useState(false);
  const [selectedDeal, setSelectedDeal] = useState<CrmDeal | null>(null);
  const [showDetail, setShowDetail] = useState(false);

  const filteredDeals = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return deals;
    return deals.filter((d) =>
      [d.title, d.organization?.name, d.person?.name]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(q))
    );
  }, [deals, search]);

  // Mantém o negócio aberto sincronizado com o realtime.
  const currentDeal = selectedDeal
    ? deals.find((d) => d.id === selectedDeal.id) ?? selectedDeal
    : null;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Agendor</h1>
            <p className="text-sm text-muted-foreground">
              CRM completo: organizações, contatos, negócios em funil e atividades.
            </p>
          </div>
          <Button className="gap-2" onClick={() => setShowDealForm(true)} disabled={!pipelineId}>
            <Plus className="w-4 h-4" />
            Novo negócio
          </Button>
        </div>

        <AgendorStats deals={deals} />

        <Tabs defaultValue="funil" className="space-y-4">
          <TabsList>
            <TabsTrigger value="funil">Funil</TabsTrigger>
            <TabsTrigger value="organizacoes">Organizações</TabsTrigger>
            <TabsTrigger value="contatos">Contatos</TabsTrigger>
            <TabsTrigger value="atividades">Atividades</TabsTrigger>
          </TabsList>

          <TabsContent value="funil" className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative w-full sm:max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Buscar negócios..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              {pipelines.length > 1 && (
                <Select value={pipelineId ?? ""} onValueChange={setPipelineId}>
                  <SelectTrigger className="w-[220px]">
                    <SelectValue placeholder="Funil" />
                  </SelectTrigger>
                  <SelectContent>
                    {pipelines.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {loadingPipelines || loadingDeals ? (
              <div className="flex justify-center py-16">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <AgendorKanban
                deals={filteredDeals}
                stages={stages}
                onSelectDeal={(deal) => {
                  setSelectedDeal(deal);
                  setShowDetail(true);
                }}
              />
            )}
          </TabsContent>

          <TabsContent value="organizacoes">
            <OrganizationsPanel />
          </TabsContent>

          <TabsContent value="contatos">
            <PeoplePanel />
          </TabsContent>

          <TabsContent value="atividades">
            <ActivitiesPanel />
          </TabsContent>
        </Tabs>
      </div>

      <DealFormDialog
        open={showDealForm}
        onOpenChange={setShowDealForm}
        pipelineId={pipelineId}
        stages={stages}
      />
      <DealDetailSheet
        deal={currentDeal}
        stages={stages}
        pipelineId={pipelineId}
        open={showDetail}
        onOpenChange={setShowDetail}
      />
    </DashboardLayout>
  );
};

export default Agendor;
