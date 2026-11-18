import { useCallback, useEffect, useMemo, useState } from "react";
import DashboardLayout from "@/components/layouts/DashboardLayout";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Handshake, LockKeyhole, PhoneCall, Search, RefreshCcw, Clock, CalendarCheck, MessageSquareText, RotateCcw, PhoneOff, PhoneForwarded, Building2, ChevronRight, UserRound, Phone, Tag, Sparkles, Trash2 } from "lucide-react";

const filters = [
  { key: "todos", label: "Todos" },
  { key: "agendado", label: "Agendado" },
  { key: "em_contato", label: "Em contato" },
  { key: "recusado", label: "Recusado" },
  { key: "recuperar", label: "Recuperar" },
  { key: "sem_resposta", label: "Sem resposta" },
  { key: "retorno_autorizado", label: "Retorno autorizado" },
  { key: "fora_perfil", label: "Fora do perfil" },
] as const;
type Status = typeof filters[number]["key"];
type Call = { id: string; channel: string; status: string; do_not_contact: number | boolean; contact_name: string | null; company_name: string | null; dialed_phone: string | null; contact_role: string | null; segment: string | null; customer_need: string | null; article_presented: string | null; article_interest: number | boolean; interest_evidence: string | null; next_action: string | null; last_stage: string | null; started_at: string; ended_at: string | null; updated_at: string };
type Turn = { speaker: "cliente" | "rafael"; text: string; turn_number: number; created_at: string };
const labelStatus = (status: string) => filters.find(x => x.key === status)?.label || (status === "nao_contatar" ? "Recusado" : status === "agendamento_simulado" ? "Recuperar" : status);
const localTime = (stamp: string | null) => {
  if (!stamp) return "—";
  const normalized = stamp.includes("T") ? stamp : stamp.replace(" ", "T") + "Z";
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

export default function AtendimentoDev() {
  const { session } = useAuth();
  const token = session?.access_token || "";
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Status>("todos");
  const [calls, setCalls] = useState<Call[]>([]);
  const [totals, setTotals] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Call | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [detail, setDetail] = useState<Call | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Call | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [pendingBatchIds, setPendingBatchIds] = useState<string[]>([]);
  const [successNotice, setSuccessNotice] = useState("");

  const load = useCallback(async (quiet = false) => {
    if (!token) return;
    if (!quiet) setLoading(true);
    try {
      const params = new URLSearchParams({ status: filter, q: query });
      const response = await fetch(`/api/rafael-attendance?${params}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      if (!response.ok) throw Error(response.status === 403 ? "Acesso exclusivo do cargo Desenvolvedor." : "Não foi possível carregar o histórico.");
      const data = await response.json();
      setCalls(Array.isArray(data.calls) ? data.calls : []);
      setTotals(data.totals || {});
      setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "Erro ao consultar atendimentos"); }
    finally { if (!quiet) setLoading(false); }
  }, [filter, query, token]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 250); return () => clearTimeout(timer); }, [load]);
  useEffect(() => { const timer = window.setInterval(() => void load(true), 20000); return () => clearInterval(timer); }, [load]);
  const open = async (call: Call) => {
    setSelected(call); setDetail(call); setTurns([]); setDetailLoading(true);
    try { const r = await fetch(`/api/rafael-attendance/${encodeURIComponent(call.id)}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }); if (!r.ok) throw Error("Não foi possível abrir a conversa."); const result = await r.json(); setTurns(result.turns || []); setDetail(result.call || call); }
    catch (e) { setError(e instanceof Error ? e.message : "Erro no histórico"); }
    finally { setDetailLoading(false); }
  };

  const removeCall = async () => {
    const call = pendingDelete;
    if (!call || deleting || !token) return;
    setDeleting(true);
    try {
      const response = await fetch(`/api/rafael-attendance/${encodeURIComponent(call.id)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (!response.ok) {
        const result = await response.json().catch(() => null);
        throw new Error(result?.error || "Não foi possível excluir a ligação.");
      }
      setCalls(current => current.filter(item => item.id !== call.id));
      setSelectedIds(current => new Set([...current].filter(id => id !== call.id)));
      setTotals(current => {
        const next = { ...current };
        const status = call.status === "nao_contatar" ? "recusado" : call.status;
        next.total = Math.max(0, Number(next.total || 0) - 1);
        next[status] = Math.max(0, Number(next[status] || 0) - 1);
        return next;
      });
      if (selected?.id === call.id) { setSelected(null); setDetail(null); }
      setPendingDelete(null);
      setError("");
      await load(true);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Erro ao excluir a ligação.");
    } finally {
      setDeleting(false);
    }
  };

  const statusCards = useMemo(() => ([
    { key: "agendado" as Status, label: "Agendado", description: "Reunião confirmada", icon: CalendarCheck, color: "text-emerald-700 dark:text-emerald-400", border: "border-l-emerald-500" },
    { key: "em_contato" as Status, label: "Em contato", description: "Abordagem em andamento", icon: PhoneCall, color: "text-blue-700 dark:text-blue-400", border: "border-l-blue-500" },
    { key: "recusado" as Status, label: "Recusado", description: "Sem interesse ou bloqueado", icon: PhoneOff, color: "text-red-700 dark:text-red-400", border: "border-l-red-500" },
    { key: "recuperar" as Status, label: "Recuperar", description: "Oportunidade futura", icon: RotateCcw, color: "text-amber-700 dark:text-amber-400", border: "border-l-amber-500" },
    { key: "sem_resposta" as Status, label: "Sem resposta", description: "Nova tentativa futura", icon: Clock, color: "text-slate-600 dark:text-slate-400", border: "border-l-slate-400" },
    { key: "retorno_autorizado" as Status, label: "Retorno autorizado", description: "Permissão e histórico", icon: PhoneForwarded, color: "text-violet-700 dark:text-violet-400", border: "border-l-violet-500" },
    { key: "fora_perfil" as Status, label: "Fora do perfil", description: "Empresa não é confecção", icon: Building2, color: "text-zinc-600 dark:text-zinc-400", border: "border-l-zinc-400" },
  ]), []);
  const visibleColumns = filter === "todos" ? statusCards : statusCards.filter(c => c.key === filter);
  const groupedCalls = useMemo(() => Object.fromEntries(statusCards.map(c => [c.key, calls.filter(call => call.status === c.key)])) as Record<string, Call[]>, [calls, statusCards]);
  const visibleIds = useMemo(() => calls.filter(call => filter === "todos" || call.status === filter).map(call => call.id), [calls, filter]);
  const selectedVisibleCount = visibleIds.filter(id => selectedIds.has(id)).length;
  const allVisibleSelected = visibleIds.length > 0 && selectedVisibleCount === visibleIds.length;
  const toggleCallSelection = (id: string, checked: boolean) => {
    setSuccessNotice("");
    setSelectedIds(previous => {
      const next = new Set(previous);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  };
  const toggleVisibleSelection = (checked: boolean) => {
    setSuccessNotice("");
    setSelectedIds(previous => {
      const next = new Set(previous);
      for (const id of visibleIds) {
        if (checked) next.add(id); else next.delete(id);
      }
      return next;
    });
  };
  const deleteSelectedCalls = async () => {
    if (deleting || !token || pendingBatchIds.length === 0) return;
    const ids = [...pendingBatchIds];
    setDeleting(true);
    try {
      const response = await fetch("/api/rafael-attendance/batch-delete", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
        cache: "no-store",
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.ok) throw new Error(result?.error || "Não foi possível excluir as ligações.");
      const deleted = new Set(ids);
      setCalls(previous => previous.filter(call => !deleted.has(call.id)));
      setSelectedIds(previous => new Set([...previous].filter(id => !deleted.has(id))));
      if (selected && deleted.has(selected.id)) { setSelected(null); setDetail(null); }
      setPendingBatchIds([]);
      setError("");
      setSuccessNotice(`${ids.length} ${ids.length === 1 ? "ligação excluída" : "ligações excluídas"} com sucesso.`);
      await load(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao excluir ligações.");
    } finally {
      setDeleting(false);
    }
  };

  return <DashboardLayout>
    <div className="w-full max-w-none space-y-6 pb-12">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-primary"><Handshake className="h-5 w-5"/><span className="text-sm font-medium">Portal Digitale · Rafael</span></div>
          <h1 className="text-3xl font-semibold tracking-tight">Atendimento</h1>
          <p className="text-sm text-muted-foreground">Histórico de ligações, andamento e resultados da abordagem comercial.</p>
        </div>
        <Badge variant="secondary" className="gap-2"><LockKeyhole className="h-4 w-4" /> Apenas Desenvolvedor</Badge>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><PhoneCall className="h-4 w-4"/><span><strong className="font-semibold text-foreground">{Number(totals.total || 0)}</strong> ligações registradas</span></div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}><RefreshCcw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`}/>Atualizar</Button>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4" aria-label="Status dos atendimentos">
        {statusCards.map(item => <button key={item.key} type="button" onClick={() => setFilter(filter === item.key ? "todos" : item.key)} aria-pressed={filter === item.key} className={`rounded-xl border border-l-4 ${item.border} bg-card p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${filter === item.key ? "ring-2 ring-primary/70" : ""}`}>
          <div className="flex items-start justify-between gap-2"><item.icon className={`h-5 w-5 ${item.color}`}/><span className="text-2xl font-semibold tabular-nums leading-none">{Number(totals[item.key] || 0)}</span></div>
          <p className="mt-3 text-sm font-semibold">{item.label}</p><p className="mt-1 text-xs text-muted-foreground">{item.description}</p>
        </button>)}
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"/><Input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar empresa, telefone, contato, segmento ou artigo" className="pl-9" aria-label="Buscar ligações" /></div>
        <Button variant={filter === "todos" ? "default" : "outline"} onClick={() => setFilter("todos")} className="sm:min-w-[130px]">{filter === "todos" ? "Todos os status" : "Limpar filtro"}</Button>
      </div>
      {error && <div role="alert" className="rounded-md border border-destructive/30 p-3 text-sm text-destructive">{error}</div>}
      <section aria-label="Quadro de atendimentos">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-lg font-semibold">Quadro de atendimentos</h2><p className="text-xs text-muted-foreground">Selecione um status acima para visualizar somente seus contatos.</p></div><Badge variant="outline">{filter === "todos" ? "Todos" : labelStatus(filter)}</Badge></div>
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border bg-card px-3 py-3">
          <label className="flex cursor-pointer items-center gap-2 text-xs font-medium">
            <Checkbox
              aria-label="Selecionar todas as ligações visíveis"
              checked={allVisibleSelected ? true : selectedVisibleCount > 0 ? "indeterminate" : false}
              disabled={deleting || visibleIds.length === 0}
              onCheckedChange={checked => toggleVisibleSelection(checked === true)}
            />
            Selecionar todas as visíveis ({visibleIds.length})
          </label>
          <span className="text-xs text-muted-foreground" aria-live="polite">{selectedIds.size} selecionadas</span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {selectedIds.size > 0 && (
              <Button size="sm" variant="ghost" disabled={deleting} onClick={() => setSelectedIds(new Set())}>
                Limpar seleção
              </Button>
            )}
            <Button
              size="sm"
              variant="destructive"
              disabled={deleting || selectedIds.size === 0}
              onClick={() => setPendingBatchIds([...selectedIds])}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Excluir selecionadas ({selectedIds.size})
            </Button>
          </div>
        </div>
        {successNotice && <div role="status" className="mb-3 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{successNotice}</div>}
        <div className={`grid gap-3 items-start ${filter === "todos" ? "grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7" : "grid-cols-1"}`} role="list">
          {visibleColumns.map(col => <Card key={col.key} role="listitem" className={`min-w-0 w-full overflow-hidden border-t-4 ${col.border.replace('border-l-', 'border-t-')} bg-muted/20 shadow-sm`}>
            <div className="flex items-center justify-between gap-1 border-b bg-card px-2 py-3"><div className="flex items-center gap-2"><col.icon className={`h-4 w-4 ${col.color}`}/><h3 className="text-xs font-semibold leading-tight">{col.label}</h3></div><Badge variant="secondary" className="tabular-nums">{groupedCalls[col.key]?.length || 0}</Badge></div>
            <CardContent className="space-y-2 p-2">
              {(groupedCalls[col.key] || []).map(call => <div key={call.id} className="group relative">
                <button type="button" className="block w-full rounded-lg border bg-card p-2.5 text-left shadow-sm transition hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => void open(call)}> 
                <div className="flex items-start justify-between gap-2 pr-16"><p className="line-clamp-2 font-semibold leading-snug">{"Simulação"}</p></div>
                <div className="mt-3 space-y-1.5 text-xs text-muted-foreground">
                  <div className="flex items-start gap-2"><UserRound className="mt-0.5 h-3.5 w-3.5 shrink-0"/><span className="break-words">{call.contact_name || "Contato não informado"}{call.contact_role ? ` · ${call.contact_role}` : ""}</span></div>
                  <div className="flex items-start gap-2"><Phone className="mt-0.5 h-3.5 w-3.5 shrink-0"/><span>{call.dialed_phone || "Telefone não informado"}</span></div>
                  <div className="flex items-start gap-2"><Tag className="mt-0.5 h-3.5 w-3.5 shrink-0"/><span>{call.segment || "Segmento não informado"}</span></div>
                </div>
                {call.article_presented && <div className="mt-3 flex items-center gap-2"><Badge variant="outline">{call.article_presented}</Badge>{Boolean(call.article_interest) && <Badge className="gap-1 bg-emerald-600 text-white"><Sparkles className="h-3 w-3"/>Interesse</Badge>}</div>}
                <div className="mt-3 text-[11px] text-muted-foreground">{localTime(call.started_at)} · {call.channel === "laboratorio" ? "Laboratório" : call.channel}</div>
                {Boolean(call.do_not_contact) && <p className="mt-2 text-xs font-medium text-destructive">Não realizar novos contatos</p>}
                <div className="mt-3 flex items-center gap-1.5 border-t pt-3 text-xs font-medium text-primary"><MessageSquareText className="h-3.5 w-3.5"/>Abrir detalhes e histórico</div>
                </button>
                <div className="absolute right-10 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-md bg-card">
                  <Checkbox
                    aria-label={`Selecionar ligação de ${call.contact_name || call.company_name || "Simulação"} em ${localTime(call.started_at)}`}
                    checked={selectedIds.has(call.id)}
                    disabled={deleting}
                    onCheckedChange={checked => toggleCallSelection(call.id, checked === true)}
                  />
                </div>
                <button
                  type="button"
                  className="absolute right-2 top-2 z-10 rounded-md p-1.5 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive"
                  aria-label={`Excluir ligação de ${call.contact_name || call.company_name || "Simulação"} de ${localTime(call.started_at)}`}
                  title="Excluir ligação"
                  onClick={() => setPendingDelete(call)}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>)}
              {!loading && !groupedCalls[col.key]?.length && <div className="flex min-h-[116px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-background/70 px-3 py-5 text-center"><col.icon className={`h-5 w-5 opacity-60 ${col.color}`}/><p className="text-xs text-muted-foreground">Nenhum contato neste status</p></div>}
              {loading && !groupedCalls[col.key]?.length && <p className="py-7 text-center text-xs text-muted-foreground">Carregando…</p>}
            </CardContent>
          </Card>)}
        </div>
        <p className="mt-4 text-xs text-muted-foreground">Atualização automática a cada 20 segundos. Sem resposta permite nova tentativa; Retorno autorizado indica permissão e histórico anterior. O bloqueio de novos contatos permanece dentro de Recusado.</p>
      </section>
    </div>
    <AlertDialog open={pendingBatchIds.length > 0} onOpenChange={visible => { if (!visible && !deleting) setPendingBatchIds([]); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir {pendingBatchIds.length} {pendingBatchIds.length === 1 ? "ligação" : "ligações"}?</AlertDialogTitle>
          <AlertDialogDescription>
            Você selecionou {pendingBatchIds.length} {pendingBatchIds.length === 1 ? "ligação" : "ligações"}.
            Todas as ligações selecionadas e seus respectivos históricos de conversa serão excluídos permanentemente.
            As demais ligações não serão afetadas. Esta ação não pode ser desfeita.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={deleting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={event => { event.preventDefault(); void deleteSelectedCalls(); }}
          >
            {deleting ? "Excluindo…" : `Sim, excluir ${pendingBatchIds.length} ${pendingBatchIds.length === 1 ? "ligação" : "ligações"}`}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    <AlertDialog open={!!pendingDelete} onOpenChange={visible => { if (!visible && !deleting) setPendingDelete(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir esta ligação?</AlertDialogTitle>
          <AlertDialogDescription>
            A ligação{pendingDelete?.contact_name ? ` de ${pendingDelete.contact_name}` : ""} registrada em {localTime(pendingDelete?.started_at || null)} e todo o histórico da conversa serão excluídos permanentemente. Essa ação não pode ser desfeita.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={deleting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={event => { event.preventDefault(); void removeCall(); }}
          >
            {deleting ? "Excluindo…" : "Sim, excluir ligação"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    <Dialog open={!!selected} onOpenChange={visible => { if (!visible) { setSelected(null); setDetail(null); } }}><DialogContent className="max-h-[88vh] max-w-3xl overflow-y-auto"><DialogHeader><DialogTitle>{detail?.company_name || "Empresa não identificada"}</DialogTitle><DialogDescription>{selected ? `${localTime(selected.started_at)} · ${labelStatus(selected.status)} · ${detail?.channel === "laboratorio" ? "Laboratório" : "Ligação"}` : ""}</DialogDescription></DialogHeader>
      {detail && <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border bg-muted/30 p-3"><p className="text-xs text-muted-foreground">Pessoa de contato</p><p className="mt-1 text-sm font-medium">{detail.contact_name || "Não informada"}</p>{detail.contact_role && <p className="text-xs text-muted-foreground">{detail.contact_role}</p>}</div>
        <div className="rounded-lg border bg-muted/30 p-3"><p className="text-xs text-muted-foreground">Telefone discado</p><p className="mt-1 text-sm font-medium">{detail.dialed_phone || "Não informado"}</p></div>
        <div className="rounded-lg border bg-muted/30 p-3"><p className="text-xs text-muted-foreground">Segmento</p><p className="mt-1 text-sm font-medium">{detail.segment || "Não informado"}</p></div>
        <div className="rounded-lg border bg-muted/30 p-3"><p className="text-xs text-muted-foreground">Artigo apresentado pelo Rafael</p><p className="mt-1 text-sm font-medium">{detail.article_presented || "Nenhum artigo registrado"}</p></div>
        <div className="rounded-lg border bg-muted/30 p-3 sm:col-span-2"><p className="text-xs text-muted-foreground">Necessidade mencionada pelo cliente</p><p className="mt-1 whitespace-pre-wrap text-sm">{detail.customer_need || "Não informada"}</p></div>
        <div className="rounded-lg border bg-muted/30 p-3 sm:col-span-2"><p className="text-xs text-muted-foreground">Interesse no artigo</p><p className="mt-1 text-sm font-medium">{detail.article_presented ? (detail.article_interest ? "Interesse demonstrado" : "Não confirmado") : "Sem apresentação registrada"}</p>{detail.article_interest && <p className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">{detail.interest_evidence || "Evidência não registrada"}</p>}</div>
        {detail.next_action && <div className="rounded-lg border bg-muted/30 p-3 sm:col-span-2"><p className="text-xs text-muted-foreground">Próxima ação</p><p className="mt-1 text-sm">{detail.next_action}</p></div>}
        {Boolean(detail.do_not_contact) && <p className="text-sm font-medium text-destructive sm:col-span-2">Não realizar novos contatos com este cliente.</p>}
      </div>}
      <h3 className="border-t pt-3 text-sm font-semibold">Histórico da conversa</h3>
      <div className="space-y-3">{detailLoading ? <p className="text-sm text-muted-foreground">Carregando histórico…</p> : turns.length ? turns.map((t, i) => <div key={`${t.turn_number}-${t.speaker}-${i}`} className={`flex ${t.speaker === "cliente" ? "justify-end" : "justify-start"}`}><div className={`max-w-[90%] rounded-xl px-4 py-3 text-sm ${t.speaker === "cliente" ? "bg-primary/10" : "bg-muted"}`}><div className="mb-1 text-xs font-semibold">{t.speaker === "cliente" ? "CLIENTE" : "RAFAEL"}</div><p className="whitespace-pre-wrap break-words">{t.text}</p></div></div>) : <p className="text-sm text-muted-foreground">Ainda não há falas transcritas para esta ligação.</p>}</div>
    </DialogContent></Dialog>
  </DashboardLayout>;
}
