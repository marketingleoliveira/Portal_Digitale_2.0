import {Badge} from '@/components/ui/badge';
export function CustomerBadge({status}:{status:string}){
  return <Badge aria-label="Cliente já cadastrado na base" className="shrink-0 rounded-md border-0 bg-[#946b00] px-2 py-0.5 text-[10px] font-bold text-white hover:bg-[#946b00]">{status==='active'?'Cliente Ativo':status==='inactive'?'Cliente Inativo':'Cliente sem data'}</Badge>;
}
