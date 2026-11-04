import {readClientSpreadsheet,normalizeHeader,isClientNameHeader,isLastPurchaseHeader} from '@/lib/clientSpreadsheet';
import {useEffect,useRef,useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {Link} from 'react-router-dom';
import {useAuth} from '@/contexts/AuthContext';
import DashboardLayout from '@/components/layouts/DashboardLayout';
import {Card,CardContent,CardHeader,CardTitle} from '@/components/ui/card';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {Tabs,TabsContent,TabsList,TabsTrigger} from '@/components/ui/tabs';
import {Textarea} from '@/components/ui/textarea';
import {toast} from 'sonner';
import {Download,Save,Upload,Settings,Users,Activity} from 'lucide-react';

type SettingsData={inactivity_months:number;enabled:boolean;hourly_target:number;daily_target:number;states:string[];segments:string[]};
type ClientRow={cnpj:string;name:string;last_order_date:string|null;source_row?:number;average_ticket?:string|number|null};
type Preview={error_count:number;errors:{row:number;index?:number;message:string}[];sample:(ClientRow&{status:string})[];total:number;unique:number;repeated:number;new_count:number;updated_count:number;statuses?:Record<string,number>};
const money=(value:unknown)=>value===null||value===undefined?'Não informado':Number(value).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const statusLabels:Record<string,string>={active:'Ativo',inactive:'Inativo',unknown:'Sem informação'};
const formatDate=(value:string|null)=>value?value.slice(0,10).split('-').reverse().join('/'):'Não informada';
const normalize=normalizeHeader;
const selectClass='w-full rounded-md border border-input bg-background px-3 py-2 text-sm';

export default function DigitaleAI(){
  const {session}=useAuth(),cache=useQueryClient();
  const [revision,setRevision]=useState<string|null>(null);
  const [draft,setDraft]=useState<SettingsData|null>(null),[segmentText,setSegmentText]=useState(''),[saving,setSaving]=useState(false);
  const [fileName,setFileName]=useState(''),[headers,setHeaders]=useState<string[]>([]),[sheetRows,setSheetRows]=useState<unknown[][]>([]);
  const [mapping,setMapping]=useState({cnpj:'-1',name:'-1',date:'-1',ticket:'-1'}),[busy,setBusy]=useState(false),[preview,setPreview]=useState<Preview|null>(null),[importRows,setImportRows]=useState<ClientRow[]>([]),[uploadError,setUploadError]=useState(''),[selectionInfo,setSelectionInfo]=useState({cpf:0,empty:0}),[skipInvalid,setSkipInvalid]=useState(false);
  const [search,setSearch]=useState(''),[status,setStatus]=useState(''),[page,setPage]=useState(1),inputRef=useRef<HTMLInputElement>(null);
  async function api(path:string,method='GET',body?:unknown){
    const response=await fetch('/api/digitale-ai'+path,{method,headers:{Authorization:`Bearer ${session?.access_token}`,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
    const data=await response.json();if(!response.ok)throw Error(typeof data.error==='string'?data.error:data.error?.message||'Não foi possível concluir a operação.');return data;
  }
  const config=useQuery({queryKey:['digitale-ai-settings'],queryFn:()=>api(''),enabled:!!session?.access_token});
  const clients=useQuery({queryKey:['digitale-ai-clients',search,status,page],queryFn:()=>api('/clients?'+new URLSearchParams({q:search,status,page:String(page)})),enabled:!!session?.access_token,refetchInterval:60000});
  useEffect(()=>{if(config.data&&!draft){setDraft(config.data.settings);setRevision(config.data.revision);setSegmentText(config.data.settings.segments.join('\n'));}},[config.data,draft]);
  function resetPreview(){setPreview(null);setImportRows([]);setUploadError('');}
  async function save(){
    if(!draft)return;setSaving(true);
    try{const result=await api('','PUT',{...draft,revision,segments:segmentText.split('\n').map(s=>s.trim()).filter(Boolean)});setDraft(result.settings);setRevision(result.revision);setSegmentText(result.settings.segments.join('\n'));await cache.invalidateQueries({queryKey:['prospecting-ai']});await cache.invalidateQueries({queryKey:['digitale-ai-settings']});await cache.invalidateQueries({queryKey:['digitale-ai-clients']});await cache.invalidateQueries({queryKey:['crm-deals']});toast.success('Configuração salva. A prospecção já seguirá estas regras.');}catch(e){toast.error((e as Error).message);}finally{setSaving(false);}
  }
  async function loadFile(file?:File){
    if(!file)return;resetPreview();setHeaders([]);setSheetRows([]);setFileName('');setSelectionInfo({cpf:0,empty:0});setSkipInvalid(false);setBusy(true);
    try{
      if(!/\.(xlsx|xls|csv)$/i.test(file.name))throw Error('Escolha uma planilha XLSX, XLS ou CSV.');
      if(file.size>20*1024*1024)throw Error('O arquivo deve ter no máximo 20 MB.');
      const parsed=await readClientSpreadsheet(await file.arrayBuffer());
      const columns=parsed.headers;
      const find=(fn:(s:string)=>boolean)=>String(columns.findIndex(c=>fn(normalize(c))));
      setHeaders(columns);setSheetRows(parsed.rows);setFileName(file.name);setSkipInvalid(false);setSelectionInfo({cpf:0,empty:0});setMapping({cnpj:find(s=>s.includes('cnpj')),name:find(isClientNameHeader),date:find(isLastPurchaseHeader),ticket:find(s=>s.includes('ticketmedio'))});
    }catch(e){setUploadError((e as Error).message);}finally{setBusy(false);if(inputRef.current)inputRef.current.value='';}
  }
  async function validateImport(){
    resetPreview();setBusy(true);
    try{
      if(mapping.cnpj==='-1'||mapping.name==='-1')throw Error('Selecione as colunas de CNPJ e nome do cliente.');
      if(new Set(Object.values(mapping).filter(v=>v!=='-1')).size!==Object.values(mapping).filter(v=>v!=='-1').length)throw Error('Cada campo precisa usar uma coluna diferente.');
      const XLSX=await import('xlsx');
      const rows=sheetRows.map((row,index)=>{
        const value=row[Number(mapping.cnpj)];const cnpj=typeof value==='number'?String(Math.trunc(value)).padStart(14,'0'):String(value||'');
        const date=mapping.date==='-1'?'':row[Number(mapping.date)];let order=String(date??'').trim();
        if(typeof date==='number'){const parsed=XLSX.SSF.parse_date_code(date);order=parsed?`${String(parsed.y).padStart(4,'0')}-${String(parsed.m).padStart(2,'0')}-${String(parsed.d).padStart(2,'0')}`:order;}
        return {cnpj,name:String(row[Number(mapping.name)]||''),last_order_date:order||null,source_row:index+2,average_ticket:mapping.ticket==='-1'?null:row[Number(mapping.ticket)] as string|number};
      });
      const cpf=rows.filter(r=>r.cnpj.replace(/[^a-z0-9]/gi,'').length===11).length;
      const empty=rows.filter(r=>!r.cnpj.trim()).length;
      const companies=rows.filter(r=>r.cnpj.trim()&&r.cnpj.replace(/[^a-z0-9]/gi,'').length!==11);
      setSelectionInfo({cpf,empty});
      if(!companies.length)throw Error('Não foram encontrados clientes com CNPJ. CPFs não entram nesta base.');
      const result=await api('/clients/preview','POST',{rows:companies});setPreview(result);setImportRows(companies);setSkipInvalid(false);
    }catch(e){setUploadError((e as Error).message);}finally{setBusy(false);}
  }
  async function validateOnlyValid(){
    if(!preview)return;setBusy(true);
    try{const errors=new Set(preview.errors.map(e=>e.index??e.row-2));
      if(preview.error_count!==errors.size)throw Error('Há mais de 100 erros. Corrija a planilha antes de importar.');
      const valid=importRows.filter((r,i)=>!errors.has(i));
      if(!valid.length)throw Error('Não há empresas válidas para importar.');
      const result=await api('/clients/preview','POST',{rows:valid});setPreview(result);setImportRows(valid);setSkipInvalid(true);
    }catch(e){setUploadError((e as Error).message);}finally{setBusy(false);}
  }
  async function confirmImport(){
    if(!preview||preview.error_count||!importRows.length)return;setBusy(true);
    try{const result=await api('/clients/import','POST',{rows:importRows,filename:fileName});await cache.invalidateQueries({queryKey:['digitale-ai-clients']});resetPreview();setHeaders([]);setSheetRows([]);setFileName('');toast.success(`${result.new_count} clientes novos e ${result.updated_count} atualizados. Os CNPJs já estão bloqueados na prospecção.`);}catch(e){setUploadError((e as Error).message);}finally{setBusy(false);}
  }
  function downloadTemplate(){
    const blob=new Blob(['\uFEFFCNPJ;Nome do cliente;Data do último pedido\r\n'],{type:'text/csv;charset=utf-8;'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='modelo-clientes-digitale.csv';a.click();URL.revokeObjectURL(url);
  }
  // DIGITALE_EXTERNAL_CNPJ_REVIEW_UI_V1
  const [reviewTab,setReviewTab]=useState('settings');
  const [reviewStatus,setReviewStatus]=useState('');
  const reviews=useQuery({
    queryKey:['digitale-external-cnpj-reviews',reviewStatus],
    queryFn:()=>api('/external-cnpj-reviews?'+new URLSearchParams({
      limit:'100',
      ...(reviewStatus?{status:reviewStatus}:{})
    })),
    enabled:!!session?.access_token && reviewTab==='reviews',
    refetchInterval:60000
  });
  const reviewTotals=reviews.data?.totals||[];
  const reviewCount=(s:string)=>Number(
    reviewTotals.find((r:{status:string;total:number})=>r.status===s)?.total||0
  );
  const totals=clients.data?.totals;
  return <DashboardLayout><div className="space-y-6">
    <div><h1 className="text-2xl font-bold">IA DIGITALE</h1><p className="text-muted-foreground">Configure a prospecção e mantenha sua base de clientes protegida contra contatos repetidos.</p></div>
    {(config.error||clients.error)&&<p role="alert" className="text-destructive">{(config.error||clients.error)?.message}</p>}
    <Tabs defaultValue="settings" onValueChange={setReviewTab}><TabsList className="flex h-auto flex-wrap justify-start"><TabsTrigger value="settings"><Settings className="mr-2 h-4 w-4"/>Configuração</TabsTrigger><TabsTrigger value="clients"><Users className="mr-2 h-4 w-4"/>Base de clientes</TabsTrigger><TabsTrigger value="reviews">Revisão de CNPJ</TabsTrigger><TabsTrigger value="monitor"><Activity className="mr-2 h-4 w-4"/>Monitoramento</TabsTrigger></TabsList>
      <TabsContent value="settings"><Card><CardHeader><CardTitle>Como a IA deve prospectar</CardTitle></CardHeader><CardContent className="space-y-6">
        {!draft?<p>Carregando configuração…</p>:<>
          <label className="flex items-center gap-3"><input type="checkbox" checked={draft.enabled} onChange={e=>setDraft({...draft,enabled:e.target.checked})}/><span>Prospecção automática ativa</span></label>
          <div className="grid gap-4 md:grid-cols-2"><div><Label htmlFor="ai-hourly">Quantidade máxima por hora</Label><Input id="ai-hourly" type="number" min={1} max={100} value={draft.hourly_target} onChange={e=>setDraft({...draft,hourly_target:Number(e.target.value)})}/></div><div><Label htmlFor="ai-daily">Quantidade máxima por dia</Label><Input id="ai-daily" type="number" min={1} max={1000} value={draft.daily_target} onChange={e=>setDraft({...draft,daily_target:Number(e.target.value)})}/></div></div>
          <p className="text-sm text-muted-foreground">Entregas das 08h às 18h, horário de Brasília. As quantidades são limites de leads verificados; a entrega depende das empresas encontradas e das validações. Reduzir um limite não remove leads já entregues. O limite diário inclui lotes externos.</p>
          <div className="max-w-md"><Label htmlFor="ai-inactivity-months">Meses sem compra para considerar cliente inativo</Label><Input id="ai-inactivity-months" type="number" min={1} max={60} step={1} value={draft.inactivity_months} onChange={e=>setDraft({...draft,inactivity_months:Number(e.target.value)})}/><p className="mt-2 text-sm text-muted-foreground">Padrão: 3 meses. O prazo usa meses de calendário e atualiza a base e os selos no Agendor após salvar. Clientes sem data de última compra continuam sem classificação.</p></div>
          <fieldset className="space-y-3"><legend className="font-medium">Região de prospecção — estados</legend><p className="text-sm text-muted-foreground">A localização é confirmada pela UF do estabelecimento no CNPJ. A seleção inicial abrange os 26 estados e o Distrito Federal.</p><div className="grid grid-cols-2 gap-3 md:grid-cols-3">{Object.entries(config.data?.states||{}).map(([uf,name])=><label key={uf} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.states.includes(uf)} onChange={e=>setDraft({...draft,states:e.target.checked?[...draft.states,uf]:draft.states.filter(s=>s!==uf)})}/>{String(name)} ({uf})</label>)}</div></fieldset>
          <div><Label htmlFor="ai-segments">Segmentos de busca — um por linha</Label><Textarea id="ai-segments" rows={7} value={segmentText} onChange={e=>setSegmentText(e.target.value)}/><p className="mt-2 text-sm text-muted-foreground">Ex.: moda fitness, moda praia e uniformes. A IA mantém a exigência de fabricante de vestuário com CNPJ ativo e telefone publicado.</p></div>
          <Button onClick={save} disabled={saving}><Save className="mr-2 h-4 w-4"/>{saving?'Salvando…':'Salvar configuração'}</Button>
        </>}
      </CardContent></Card></TabsContent>
      <TabsContent value="clients" className="space-y-6">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">{[['CNPJs protegidos',totals?.total],['Ativos',totals?.active],['Inativos',totals?.inactive],['Sem informação',totals?.unknown]].map(([label,value])=><Card key={String(label)}><CardHeader><CardTitle className="text-sm">{label}</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{value??0}</CardContent></Card>)}</div>
        <Card><CardHeader><CardTitle>Importar clientes</CardTitle></CardHeader><CardContent className="space-y-4">
          <p>Envie uma planilha XLSX, XLS ou CSV com cabeçalho. Relatórios “Relatório Empresa” em XLS exportado como HTML também são aceitos; a tabela de clientes é reconhecida automaticamente. Informe CNPJ, nome do cliente e data do último pedido. Limite: 10.000 linhas e 20 MB por arquivo.</p>
          <p className="text-sm text-muted-foreground">A IA bloqueia todos os CNPJs desta base, inclusive inativos. Após mais de {config.data?.settings.inactivity_months??3} meses sem pedidos, o cliente é marcado como inativo automaticamente. Sem data, fica como “Sem informação”. Atualize a planilha quando houver novas compras; uma data mais antiga ou vazia não substitui uma compra mais recente já cadastrada.</p>
          <div className="flex flex-wrap gap-3"><Button variant="outline" onClick={downloadTemplate}><Download className="mr-2 h-4 w-4"/>Baixar modelo CSV</Button><Button variant="outline" disabled={busy} onClick={()=>inputRef.current?.click()}><Upload className="mr-2 h-4 w-4"/>{busy?'Processando…':'Selecionar planilha'}</Button><input ref={inputRef} type="file" className="hidden" aria-label="Planilha de clientes" accept=".xlsx,.xls,.csv" onChange={e=>loadFile(e.target.files?.[0])}/></div>
          {uploadError&&<p role="alert" className="text-destructive">{uploadError}</p>}
          {headers.length>0&&<><p className="font-medium">{fileName} · {sheetRows.length} linhas</p><div className="grid gap-4 md:grid-cols-3">{[['cnpj','Coluna do CNPJ'],['name','Coluna do nome'],['date','Coluna do último pedido'],['ticket','Coluna do ticket médio']].map(([field,label])=><div key={field}><Label htmlFor={'map-'+field}>{label}</Label><select id={'map-'+field} className={selectClass} value={mapping[field as keyof typeof mapping]} disabled={busy} onChange={e=>{setMapping({...mapping,[field]:e.target.value});resetPreview();}}><option value="-1">{field==='date'?'Sem coluna de data':field==='ticket'?'Sem coluna de ticket médio':'Selecione a coluna'}</option>{headers.map((h,i)=><option key={i} value={String(i)}>{h}</option>)}</select></div>)}</div><p className="text-sm text-muted-foreground">Datas aceitas: DD/MM/AAAA, AAAA-MM-DD ou células de data do Excel. A prévia não altera a base. Neste relatório, use Nome Fantasia, CNPJ/CPF, Última Compra e Ticket Médio.</p><Button onClick={validateImport} disabled={busy}>Validar e visualizar prévia</Button></>}
          {(selectionInfo.cpf>0||selectionInfo.empty>0)&&<p className="text-sm text-muted-foreground">Excluídos da seleção: {selectionInfo.cpf} clientes com CPF e {selectionInfo.empty} linhas sem documento. A importação é somente de empresas com CNPJ.</p>}
          {skipInvalid&&<p className="text-sm text-amber-700 dark:text-amber-400">Você optou por excluir as linhas inválidas. Confira a nova prévia antes de confirmar a importação.</p>}
          {preview&&<div className="space-y-3 rounded-md border p-4">
            {preview.error_count>0?<><p className="font-medium text-destructive">{preview.error_count} linhas com erros. Corrija a planilha e selecione o arquivo novamente. Nenhum cliente foi importado.</p>{preview.errors.map((e,i)=><p key={i} className="text-sm">Linha {e.row}: {e.message}</p>)}{preview.error_count<=100&&<Button variant="outline" onClick={validateOnlyValid} disabled={busy}>Excluir linhas inválidas e revisar prévia</Button>}</>:<><p className="font-medium">{preview.unique} CNPJs: {preview.new_count} novos e {preview.updated_count} atualizações. {preview.repeated} linhas repetidas consolidadas.</p><p className="text-sm">Ativos: {preview.statuses?.active} · Inativos: {preview.statuses?.inactive} · Sem informação: {preview.statuses?.unknown}</p><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr><th className="text-left">CNPJ</th><th className="text-left">Cliente</th><th className="text-left">Último pedido</th><th className="text-left">Ticket médio</th><th className="text-left">Situação</th></tr></thead><tbody>{preview.sample.map(r=><tr key={r.cnpj} className="border-t"><td className="py-2 pr-3">{r.cnpj}</td><td className="pr-3">{r.name}</td><td className="pr-3">{formatDate(r.last_order_date)}</td><td className="pr-3">{money(r.average_ticket)}</td><td>{statusLabels[r.status]}</td></tr>)}</tbody></table></div><p className="text-sm text-muted-foreground">Prévia dos primeiros 20 clientes. A confirmação importa todos os CNPJs válidos do arquivo.</p><Button onClick={confirmImport} disabled={busy}>{busy?'Importando…':'Confirmar importação'}</Button></>}
          </div>}
        </CardContent></Card>
        <Card><CardHeader><CardTitle>Clientes da base</CardTitle></CardHeader><CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2"><Input aria-label="Buscar cliente por nome ou CNPJ" placeholder="Buscar por nome ou CNPJ" value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}}/><select aria-label="Filtrar situação do cliente" className={selectClass} value={status} onChange={e=>{setStatus(e.target.value);setPage(1);}}><option value="">Todas as situações</option><option value="active">Ativos</option><option value="inactive">Inativos</option><option value="unknown">Sem informação</option></select></div>
          <p className="text-sm text-muted-foreground">Prazo: {clients.data?.inactivity_months??3} meses. Inativos: último pedido anterior a {formatDate(clients.data?.cutoff||null)}. A situação é recalculada todos os dias, mesmo com a prospecção pausada.</p>
          {clients.isLoading?<p>Carregando clientes…</p>:clients.data?.clients?.length?<div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr><th className="text-left">CNPJ</th><th className="text-left">Cliente</th><th className="text-left">Último pedido</th><th className="text-left">Ticket médio</th><th className="text-left">Situação</th></tr></thead><tbody>{clients.data.clients.map((r:ClientRow&{status:string})=><tr key={r.cnpj} className="border-t"><td className="py-3 pr-3">{r.cnpj}</td><td className="pr-3">{r.name}</td><td className="pr-3">{formatDate(r.last_order_date)}</td><td className="pr-3">{money(r.average_ticket)}</td><td><span className={r.status==='inactive'?'text-amber-700 dark:text-amber-400':r.status==='active'?'text-green-700 dark:text-green-400':'text-muted-foreground'}>{statusLabels[r.status]}</span></td></tr>)}</tbody></table></div>:<p>Nenhum cliente encontrado. Importe sua primeira planilha para proteger a base.</p>}
          <div className="flex items-center gap-3"><Button variant="outline" disabled={page<=1} onClick={()=>setPage(page-1)}>Anterior</Button><span className="text-sm">Página {page} · {clients.data?.total??0} clientes</span><Button variant="outline" disabled={!clients.data||page*50>=clients.data.total} onClick={()=>setPage(page+1)}>Próxima</Button></div>
        </CardContent></Card>
        <Card><CardHeader><CardTitle>Últimas importações</CardTitle></CardHeader><CardContent className="space-y-2">{clients.data?.imports?.length?clients.data.imports.map((r:{id:string;filename:string;new_count:number;updated_count:number;created_at:string})=><p key={r.id} className="border-b pb-2 text-sm">{r.filename} · {r.new_count} novos · {r.updated_count} atualizados · {formatDate(r.created_at)}</p>):<p>Nenhuma importação realizada.</p>}</CardContent></Card>
      </TabsContent>
      
      <TabsContent value="reviews" className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Fila de revisão de CNPJ</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Pesquisa externa de empresas. Os registros desta fila
              não representam leads aprovados nem autorizam envio
              automático ao Agendor ou ao Disparo.
            </p>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {[
                ['Pendentes',reviewCount('pending')],
                ['Inconclusivos',reviewCount('inconclusive')],
                ['Revisão necessária',reviewCount('review_required')]
              ].map(([label,total])=>
                <div key={String(label)} className="rounded-lg border p-4">
                  <p className="text-sm text-muted-foreground">{label}</p>
                  <p className="text-2xl font-bold">{total}</p>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <select
                aria-label="Filtrar revisão por situação"
                className={selectClass}
                style={{maxWidth:280}}
                value={reviewStatus}
                onChange={e=>setReviewStatus(e.target.value)}
              >
                <option value="">Todas as situações</option>
                <option value="pending">Pendentes</option>
                <option value="inconclusive">Inconclusivos</option>
                <option value="review_required">Revisão necessária</option>
              </select>

              <Button
                variant="outline"
                disabled={reviews.isFetching}
                onClick={()=>reviews.refetch()}
              >
                {reviews.isFetching?'Atualizando…':'Atualizar'}
              </Button>
            </div>

            {reviews.error&&
              <p role="alert" className="text-destructive">
                {(reviews.error as Error).message}
              </p>
            }

            {reviews.isLoading&&<p>Consultando MariaDB…</p>}

            {reviews.data?.items?.length?
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="p-2 text-left">Domínio</th>
                      <th className="p-2 text-left">Situação</th>
                      <th className="p-2 text-left">Tentativas</th>
                      <th className="p-2 text-left">Evidências</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reviews.data.items.map((r:{
                      candidate_id:string;
                      domain:string;
                      status:string;
                      attempts:number;
                      evidence:unknown;
                      error_message?:string|null;
                      discovery_url?:string;
                    })=>
                      <tr key={r.candidate_id} className="border-b">
                        <td className="p-2 break-all">{r.domain}</td>
                        <td className="p-2">
                          {r.status==='pending'?'Pendente':
                           r.status==='inconclusive'?'Inconclusivo':
                           r.status==='review_required'?'Revisão necessária':
                           r.status}
                        </td>
                        <td className="p-2">{r.attempts}</td>
                        <td className="p-2">
                          {r.evidence?
                            <details>
                              <summary className="cursor-pointer">
                                Visualizar evidências
                              </summary>
                              <pre className="mt-2 max-h-72 max-w-lg overflow-auto whitespace-pre-wrap break-all rounded border p-3 text-xs">
                                {JSON.stringify(r.evidence,null,2)}
                              </pre>
                            </details>:
                            <span className="text-muted-foreground">
                              Ainda não investigado
                            </span>
                          }
                          {r.error_message&&
                            <p className="mt-1 text-xs text-muted-foreground">
                              {r.error_message}
                            </p>
                          }
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>:
              !reviews.isLoading&&!reviews.error&&
              <p>Nenhum registro encontrado para este filtro.</p>
            }

            <p className="text-xs text-muted-foreground">
              Consulta somente de leitura. A identidade empresarial
              precisa de confirmação antes de qualquer entrega.
            </p>
          </CardContent>
        </Card>
      </TabsContent>
      <TabsContent value="monitor"><Card><CardHeader><CardTitle>Acompanhar a prospecção</CardTitle></CardHeader><CardContent className="space-y-4"><p>Veja empresas encontradas, entregas à Nicolle, duplicidades, reprovações e o status do serviço automático.</p><Button asChild><Link to="/prospeccao-ia">Abrir monitoramento</Link></Button></CardContent></Card></TabsContent>
    </Tabs>
  </div></DashboardLayout>;
}
