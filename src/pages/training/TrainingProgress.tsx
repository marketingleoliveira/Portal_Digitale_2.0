import TrainingActivityReport from './TrainingActivityReport';
import { useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import DashboardLayout from '@/components/layouts/DashboardLayout';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import {
  Users, GraduationCap, BookOpenCheck, Award,
  ChartNoAxesColumnIncreasing, Loader2,
  RefreshCw, LockKeyhole, RotateCcw
} from 'lucide-react';

type Seller = {
  id: string;
  name: string;
  email: string;
};

type Summary = {
  total_courses: number;
  completed_courses: number;
  total_lessons: number;
  completed_lessons: number;
  progress: number | null;
  average_score: number | null;
};

type Course = {
  id: string;
  title: string;
  description: string | null;
  total_lessons: number;
  completed_lessons: number;
  progress: number | null;
  status: string;
  best_score: number | null;
};

type Overview = { summary: Summary; seller_count: number; started_count: number; finished_count: number; courses: {id:string;title:string;total:number;completed:number;in_progress:number;not_started:number;progress:number|null}[] };

type Detail = {
  seller: Seller;
  summary: Summary;
  courses: Course[];
};

const NAVY = '#1F3147';
const statusNames: Record<string, string> = {
  completed: 'Concluído',
  in_progress: 'Em andamento',
  not_started: 'Não iniciado',
  without_lessons: 'Sem aulas'
};

export default function TrainingProgress() {
  const { session, realRole, loading: authLoading } = useAuth();
  const token = (session as any)?.access_token ||
                (session as any)?.accessToken || '';

  const [sellers, setSellers] = useState<Seller[]>([]);
  const [selectedId, setSelectedId] = useState('all');
  const [overview, setOverview] = useState<Overview | null>(null);
  const [revision,setRevision]=useState(0);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [resetTarget,setResetTarget]=useState<{seller:Seller;course:Course}|null>(null);
  const [resetting,setResetting]=useState(false);


  const request = useCallback(async (path: string) => {
    const response = await fetch('/api/training-progress-v2' + path, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(result.error?.message || 'Erro na consulta');
    }
    return result.data;
  }, [token]);

  const loadSellers = useCallback(async () => {
    if (!token || realRole !== 'dev') return;
    setLoading(true);
    try {
      const [result, general] = await Promise.all([request('/vendedores'), request('/overview')]);
      setOverview(general);
      setRevision(n=>n+1);
      const list: Seller[] = Array.isArray(result) ? result : [];
      setSellers(list);
      setSelectedId(previous =>
        list.some(s => s.id === previous)
          ? previous : 'all'
      );
    } catch (error: any) {
      toast.error(error.message || 'Erro ao carregar vendedores');
    } finally {
      setLoading(false);
    }
  }, [token, realRole, request]);

  useEffect(() => {
    void loadSellers();
  }, [loadSellers]);

  useEffect(() => {
    if (!selectedId || selectedId === 'all' || !token || realRole !== 'dev') {
      setDetail(null);
      setLoadingDetail(false);
      return;
    }

    let active = true;
    setLoadingDetail(true);
    setDetail(null);

    request('/vendedores/' + encodeURIComponent(selectedId))
      .then(result => {
        if (active) setDetail(result as Detail);
      })
      .catch((error: Error) => {
        if (active) toast.error(error.message);
      })
      .finally(() => {
        if (active) setLoadingDetail(false);
      });

    return () => { active = false; };
  }, [selectedId, token, realRole, request, revision]);

  const resetCourse=async()=>{
    if(!resetTarget||resetting||realRole!=='dev')return;
    setResetting(true);
    try{
      const r=await fetch('/api/training-progress-v2/vendedores/'+encodeURIComponent(resetTarget.seller.id)+'/courses/'+encodeURIComponent(resetTarget.course.id)+'/reset',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({confirm:true})});
      const j=await r.json().catch(()=>({}));if(!r.ok)throw Error(j.error?.message||'Não foi possível resetar o progresso.');
      setResetTarget(null);toast.success('Progresso resetado. O treinamento poderá ser iniciado novamente.');await loadSellers();
    }catch(e:any){toast.error(e.message);}finally{setResetting(false);}
  };
  if (authLoading) {
    return (
      <div className="min-h-screen flex justify-center items-center">
        <Loader2 className="w-7 h-7 animate-spin" />
      </div>
    );
  }

  if (realRole !== 'dev') {
    return <Navigate to="/dashboard" replace />;
  }

  const summary = selectedId==='all'?overview?.summary:detail?.summary;

  const metrics = [
    {
      label: 'Progresso geral',
      value: summary?.progress === null ||
        summary?.progress === undefined
          ? '—' : `${summary.progress.toLocaleString('pt-BR',{maximumFractionDigits:2})}%`,
      icon: ChartNoAxesColumnIncreasing
    },
    {
      label: 'Treinamentos concluídos',
      value: summary
        ? `${summary.completed_courses} / ${summary.total_courses}`
        : '—',
      icon: GraduationCap
    },
    {
      label: 'Aulas concluídas',
      value: summary
        ? `${summary.completed_lessons} / ${summary.total_lessons}`
        : '—',
      icon: BookOpenCheck
    },
    {
      label: 'Nota média',
      value: summary?.average_score === null ||
        summary?.average_score === undefined
          ? '—'
          : (summary.average_score / 10).toFixed(1).replace('.', ','),
      icon: Award
    }
  ].filter(item => selectedId !== 'all' || item.label !== 'Aulas concluídas');

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in pb-12">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Progresso</h1>
            <p className="text-muted-foreground mt-1">
              Acompanhamento de desempenho da equipe e evolução individual.
            </p>
          </div>
          <Badge variant="outline" className="gap-1">
            <LockKeyhole className="h-3 w-3" />
            Somente DEV
          </Badge>
        </div>

        <Card>
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-[#1F3147]" />
              <span className="font-semibold">Selecionar vendedor</span>
            </div>

            <div className="flex gap-2">
              <Select value={selectedId} onValueChange={setSelectedId}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Selecione um vendedor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {sellers.map(seller => (
                    <SelectItem key={seller.id} value={seller.id}>
                      {seller.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button
                variant="outline"
                size="icon"
                title="Atualizar vendedores"
                onClick={() => void loadSellers()}
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>

            {!loading && sellers.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Nenhum vendedor ativo encontrado no Portal.
              </p>
            )}
          </CardContent>
        </Card>

        {!loading && !loadingDetail && summary && (
            <div className={selectedId==='all'?'grid grid-cols-1 sm:grid-cols-3 gap-4':'grid grid-cols-2 xl:grid-cols-4 gap-4'}>
              {metrics.map(item => {
                const Icon = item.icon;
                return (
                  <Card key={item.label}>
                    <CardContent className="p-5 space-y-2">
                      <div className="flex justify-between items-center gap-2">
                        <span className="text-sm text-muted-foreground">
                          {item.label}
                        </span>
                        <Icon className="h-5 w-5 text-[#1F3147]" />
                      </div>
                      <p className="text-2xl font-semibold">
                        {item.value}
                      </p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

        )}

        {selectedId !== 'all' && detail && (
          <TrainingActivityReport
            key={selectedId}
            userId={selectedId}
          />
        )}

        {(loading || loadingDetail) ? (
          <Card>
            <CardContent className="py-16 flex justify-center">
              <Loader2 className="h-7 w-7 animate-spin" />
            </CardContent>
          </Card>
        ) : selectedId === 'all' && overview ? (
          <>
            <div className="flex items-center justify-between"><h2 className="text-lg font-semibold">Desempenho da equipe</h2><span className="text-sm text-muted-foreground">{overview.seller_count} vendedores ativos</span></div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[{label:'Ainda não iniciaram',value:overview.seller_count-overview.started_count},{label:'Em treinamento',value:overview.started_count-overview.finished_count},{label:'Concluíram todos',value:overview.finished_count}].map(x=><Card key={x.label}><CardContent className="p-5"><p className="text-sm text-muted-foreground">{x.label}</p><p className="text-2xl font-semibold mt-2">{x.value}</p></CardContent></Card>)}
            </div>
            <h2 className="text-lg font-semibold">Desempenho por treinamento</h2>
            {overview.courses.length===0?<Card><CardContent className="p-8 text-center text-muted-foreground">Nenhum treinamento com vendedores ativos.</CardContent></Card>:overview.courses.map(c=><Card key={c.id}><CardContent className="p-5 space-y-4">
              <div className="flex justify-between gap-3"><h3 className="font-semibold">{c.title}</h3><span className="font-semibold">{c.progress==null?'—':c.progress+'%'}</span></div>
              <div className="h-2 bg-muted rounded-full overflow-hidden"><div className="h-full rounded-full" style={{width:(c.progress||0)+'%',backgroundColor:NAVY}}/></div>
              <div className="grid grid-cols-3 gap-3 text-sm"><div><p className="text-muted-foreground">Não iniciaram</p><p className="font-semibold">{c.not_started}</p></div><div><p className="text-muted-foreground">Em andamento</p><p className="font-semibold">{c.in_progress}</p></div><div><p className="text-muted-foreground">Concluíram</p><p className="font-semibold">{c.completed} / {c.total}</p></div></div>
            </CardContent></Card>)}
          </>
        ) : detail ? (
          <>
            <div className="flex items-center gap-3">
              <div
                className="h-12 w-12 rounded-full flex items-center justify-center text-white font-semibold"
                style={{ backgroundColor: NAVY }}
              >
                {detail.seller.name.split(/\s+/)
                  .slice(0, 2).map(p => p[0]).join('').toUpperCase()}
              </div>
              <div>
                <h2 className="font-semibold text-lg">
                  {detail.seller.name}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {detail.seller.email}
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <h2 className="text-lg font-semibold">
                Treinamentos do vendedor
              </h2>

              {detail.courses.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center text-muted-foreground">
                    Nenhum treinamento publicado.
                  </CardContent>
                </Card>
              ) : detail.courses.map(course => (
                <Card key={course.id}>
                  <CardContent className="p-5 space-y-3">
                    <div className="flex flex-wrap justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="font-semibold">{course.title}</h3>
                        <p className="text-sm text-muted-foreground mt-1">
                          {course.description || 'Sem descrição'}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="secondary">{statusNames[course.status] || course.status}</Badge>
                        <Button variant="outline" size="sm" className="text-red-700 border-red-200 hover:bg-red-50" disabled={resetting} onClick={()=>setResetTarget({seller:detail.seller,course})}><RotateCcw className="h-4 w-4 mr-2"/>Resetar progresso</Button>
                      </div>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">
                        {course.completed_lessons} de {course.total_lessons} aulas concluídas
                      </span>
                      <span className="text-sm font-semibold">
                        {course.progress === null ? '—' : `${course.progress}%`}
                      </span>
                    </div>

                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${course.progress || 0}%`,
                          backgroundColor: NAVY
                        }}
                      />
                    </div>

                    <p className="text-sm text-muted-foreground">
                      Nota média das avaliações: {
                        course.best_score === null
                          ? 'Não disponível'
                          : (course.best_score / 10).toFixed(1).replace('.', ',')
                      }
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </>
        ) : (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              Selecione um vendedor para consultar seu progresso.
            </CardContent>
          </Card>
        )}

        <p className="text-xs text-muted-foreground">
          Os resultados são calculados a partir dos registros do MariaDB.
          A abertura de um material não é considerada conclusão de aula. A nota média é apresentada na escala de 0 a 10 e considera avaliações entregues, inclusive notas baixas; ausência de nota não equivale a zero. O progresso geral é a média dos percentuais individuais, incluindo vendedores que ainda não iniciaram (0%). No treinamento comercial, a conclusão do curso exige aprovação na prova final.
        </p>
      </div>
      <AlertDialog open={!!resetTarget} onOpenChange={open=>{if(!open&&!resetting)setResetTarget(null);}}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Resetar progresso?</AlertDialogTitle><AlertDialogDescription>O treinamento {resetTarget?.course.title} de {resetTarget?.seller.name} voltará ao início. Notas, atividades, vídeos concluídos e prova final serão removidos do progresso atual. Os outros treinamentos não serão alterados.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel disabled={resetting}>Cancelar</AlertDialogCancel><AlertDialogAction disabled={resetting} className="bg-red-600 hover:bg-red-700 text-white" onClick={e=>{e.preventDefault();void resetCourse();}}>{resetting?'Resetando…':'Confirmar reset'}</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
