import {useQuery} from '@tanstack/react-query';
import DashboardLayout from '@/components/layouts/DashboardLayout';
import {useAuth} from '@/contexts/AuthContext';
import {Card,CardContent,CardHeader,CardTitle} from '@/components/ui/card';
const n=(x:any)=>Number(x||0).toLocaleString('pt-BR');
const fmt=(x:any)=>x?new Date(x).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}):'—';
export default function CddLeads(){
 const {session}=useAuth();
 const {data,isLoading,error,dataUpdatedAt}=useQuery({queryKey:['cdd-monitor'],queryFn:async()=>{
  const response=await fetch('/api/cdd-monitor',{headers:{Authorization:'Bearer '+session?.access_token}});
  if(!response.ok)throw Error('Não foi possível consultar os dados da Casa dos Dados.');
  return response.json();
 },enabled:!!session?.access_token,refetchInterval:15000});
 const t=data?.totals||{},q=data?.queue||{},u=data?.usage||{};
 const fields=[['Prospectados hoje',t.today,100],['Prospectados na semana',t.week,500],['CDD na base',t.total,null],['Aguardando Rafael',q.pending,null],['Em validação',q.verifying,null],['Validados pelo Rafael',q.validated,null],['Rejeitados',q.rejected,null],['Consultas registradas',u.requests,null]];
 return <DashboardLayout><div className="space-y-6">
  <div><h1 className="text-2xl font-bold">CDD LEADS</h1><p className="text-muted-foreground">Monitor da Casa dos Dados · confecções de vestuário em SP · atualização automática a cada 15 segundos</p></div>
  {isLoading&&<p>Carregando indicadores reais…</p>}
  {error&&<p role="alert" className="text-destructive">{(error as Error).message}</p>}
  {data&&<>
  {data.integration!=='ready'&&<Card><CardContent className="pt-6"><strong>Integração de consulta ainda não ativada</strong><p className="text-sm text-muted-foreground">O monitor está disponível. A etiqueta CDD e a sincronização do SDR não substituem o importador oficial da Casa dos Dados. Nenhuma busca ou consumo de crédito é presumido.</p></CardContent></Card>}
  <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{fields.map(([label,value,target])=><Card key={String(label)}><CardHeader className="pb-2"><CardTitle className="text-sm">{label}</CardTitle></CardHeader><CardContent><strong className="text-2xl">{n(value)}</strong>{typeof target==='number'&&<div className="mt-2"><div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary" style={{width:Math.min(100,Number(value||0)/target*100)+'%'}} /></div><p className="mt-1 text-xs text-muted-foreground">Meta: {target}</p></div>}</CardContent></Card>)}</div>
  <Card><CardHeader><CardTitle>Consumo e execução</CardTitle></CardHeader><CardContent className="space-y-2 text-sm"><p>Créditos restantes: não consultados (sem solicitar nova chamada à API)</p><p>Última execução CDD: {fmt(u.last_run_at)}</p><p>Último resultado: {u.last_status||'Nenhuma execução registrada'}</p><p>Próxima página da pesquisa: {Number(u.last_page||0)+1}</p><p>Atualizado em: {new Date(dataUpdatedAt).toLocaleTimeString('pt-BR')}</p></CardContent></Card>
  <Card><CardHeader><CardTitle>Novos leads CDD</CardTitle></CardHeader><CardContent><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr><th className="text-left">Empresa</th><th className="text-left">CNPJ</th><th className="text-left">Telefone</th><th className="text-left">E-mail</th><th className="text-left">Status</th></tr></thead><tbody>{(data.recent||[]).map((x:any)=><tr className="border-t" key={x.cnpj}><td className="py-3">{x.company} <span className="rounded bg-muted px-2 py-1 text-xs">CDD</span></td><td>{x.cnpj}</td><td>{x.phone}</td><td>{x.email}</td><td>{x.status}</td></tr>)}</tbody></table></div>{!data.recent?.length&&<p className="py-4 text-sm text-muted-foreground">Ainda não há leads importados pela Casa dos Dados.</p>}</CardContent></Card>
  </>}
 </div></DashboardLayout>
}
