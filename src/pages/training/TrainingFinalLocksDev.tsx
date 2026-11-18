import { useCallback,useEffect,useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { ShieldAlert,Unlock,RefreshCw } from 'lucide-react';

const API='/api/training-final-journey';

type Lock={
  user_id:string;
  name:string|null;
  email:string|null;
  reason:string;
  locked_at:string;
};

export default function TrainingFinalLocksDev(){
  const {session,realRole}=useAuth();

  const token=(session as any)?.access_token ||
    (session as any)?.accessToken || '';

  const [items,setItems]=useState<Lock[]>([]);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState('');

  const request=useCallback(async(
    path:string,method='GET'
  )=>{
    const res=await fetch(API+path,{
      method,
      headers:{
        Authorization:`Bearer ${token}`
      }
    });

    const json=await res.json().catch(()=>({}));

    if(!res.ok){
      throw Error(
        json.error?.message||`HTTP ${res.status}`
      );
    }

    return json.data;
  },[token]);

  const load=useCallback(async()=>{
    if(realRole!=='dev'||!token) return;

    try{
      setError('');
      setItems(await request('/admin/blocked'));
    }catch(e:any){
      setError(e.message);
    }
  },[realRole,token,request]);

  useEffect(()=>{
    void load();
  },[load]);

  async function unlock(item:Lock){
    if(!window.confirm(
      `Liberar nova tentativa para ${item.name||item.email}?`
    )) return;

    setBusy(item.user_id);

    try{
      await request(
        '/admin/unlock/'+encodeURIComponent(item.user_id),
        'POST'
      );
      await load();
    }catch(e:any){
      setError(e.message);
    }finally{
      setBusy('');
    }
  }

  if(realRole!=='dev') return null;

  return (
    <section className="rounded-xl border bg-white p-5 space-y-4 mb-5">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-[#1F3147]"/>
          <h2 className="font-bold">
            Bloqueios da Prova Final
          </h2>
        </div>
        <Button variant="outline" onClick={()=>void load()}>
          <RefreshCw className="mr-2 h-4 w-4"/>
          Atualizar
        </Button>
      </div>

      {error&&(
        <p className="text-sm text-red-700">{error}</p>
      )}

      {items.length===0?(
        <p className="text-sm text-slate-500">
          Nenhuma prova final bloqueada.
        </p>
      ):items.map(item=>(
        <div
          key={item.user_id}
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4"
        >
          <div>
            <p className="font-semibold">
              {item.name||item.email}
            </p>
            <p className="text-sm">{item.email}</p>
            <p className="text-sm">
              Motivo: {item.reason}
            </p>
            <p className="text-xs text-slate-500">
              {new Date(item.locked_at).toLocaleString('pt-BR')}
            </p>
          </div>

          <Button
            disabled={busy===item.user_id}
            onClick={()=>void unlock(item)}
          >
            <Unlock className="mr-2 h-4 w-4"/>
            Liberar prova
          </Button>
        </div>
      ))}
    </section>
  );
}
