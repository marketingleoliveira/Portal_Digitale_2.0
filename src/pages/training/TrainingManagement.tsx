import TrainingFinalLocksDev from './TrainingFinalLocksDev';
import TrainingSecurityDev, { OPTIONS } from './TrainingSecurityDev';
import TrainingLocksDev from './TrainingLocksDev';
import TrainingAssessmentBuilder from './TrainingAssessmentBuilder';
import { useCallback, useEffect, useState } from 'react';
import DashboardLayout from '@/components/layouts/DashboardLayout';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  Plus, BookOpen, ArrowLeft, Pencil, Trash2,
  Layers3, Upload, FileText, LockKeyhole,
  ChevronRight, Download, Loader2, RefreshCw,
  Archive, Paperclip, ChevronDown
} from 'lucide-react';

type AccessPolicy={mode:'all'|'roles'|'users'|'dev';roles:string[];users:string[]};
const DEFAULT_ACCESS:AccessPolicy={mode:'roles',roles:['vendedor','dev','diretoria','gerente'],users:[]};
const LEGACY_ACCESS:AccessPolicy={mode:'dev',roles:[],users:[]};
const accessModes=[['all','Todos os colaboradores'],['roles','Cargos específicos'],['users','Usuários específicos'],['dev','Exclusivo DEV — ambiente de teste']] as const;
const accessRoles=[['vendedor','Vendedores'],['dev','Desenvolvedores'],['diretoria','Diretoria'],['gerente','Gerência'],['sdr','SDR'],['admin','Administração'],['criacao','Criação'],['marketing','Marketing'],['financeiro','Financeiro'],['qualidade','Qualidade']] as const;
type AccessUser={id:string;name:string;email:string;role:string|null};
type Course = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  lesson_count: number;
  access_policy_json?: string | AccessPolicy | null;
  security_policy_json?: string | Record<string, boolean | number>;
};

type Lesson = {
  id: string;
  course_id: string;
  title: string;
  description: string | null;
  sort_order: number;
  material_count: number;
};

type Material = {
  id: string;
  original_name: string;
  mime_type: string | null;
  file_size: number;
};

const NAVY = 'bg-[#1F3147] hover:bg-[#172638] text-white';
const API = '/api/training-v2';

function fileSize(bytes: number) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1
  );
  return `${(bytes / Math.pow(1024, index)).toFixed(index ? 1 : 0)} ${units[index]}`;
}

export default function TrainingManagement() {
  const { session, realRole } = useAuth();
  const token = (session as any)?.access_token ||
                (session as any)?.accessToken || '';

  const [courses, setCourses] = useState<Course[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [materials, setMaterials] = useState<Record<string, Material[]>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [courseFormOpen, setCourseFormOpen] = useState(false);
  const [editingCourse, setEditingCourse] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [access,setAccess]=useState<AccessPolicy>(DEFAULT_ACCESS);
  const [accessUsers,setAccessUsers]=useState<AccessUser[]>([]);
  const [userSearch,setUserSearch]=useState('');
  const [securityOpen,setSecurityOpen]=useState(false);
  const [accessOpen,setAccessOpen]=useState(false);
  const [policy, setPolicy] = useState<Record<string,boolean|number>|null>(null);
  const [courseStatus, setCourseStatus] = useState<'draft' | 'published'>('draft');
  const [description, setDescription] = useState('');
  const [lessonFormOpen, setLessonFormOpen] = useState(false);
  const [editingLesson, setEditingLesson] = useState<string | null>(null);
  const [lessonName, setLessonName] = useState('');
  const [lessonDescription, setLessonDescription] = useState('');
  const [expandedLesson, setExpandedLesson] = useState<string | null>(null);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const selected = courses.find(course => course.id === selectedId);

  const request = useCallback(async (
    path: string,
    method = 'GET',
    body?: unknown
  ) => {
    const response = await fetch(API + path, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body !== undefined
          ? { 'Content-Type': 'application/json' }
          : {})
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {})
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(result.error?.message || `Erro HTTP ${response.status}`);
    }

    return result.data ?? result;
  }, [token]);

  const loadCourses = useCallback(async () => {
    if (!token || realRole !== 'dev') return;

    try {
      const data = await request('/courses');
      setCourses(data || []);
    } catch (error: any) {
      toast.error(error.message || 'Erro ao carregar treinamentos');
    } finally {
      setLoading(false);
    }
  }, [request, token, realRole]);

  const loadLessons = useCallback(async (courseId: string) => {
    try {
      const data = await request(`/courses/${encodeURIComponent(courseId)}/lessons`);
      setLessons(data || []);
    } catch (error: any) {
      toast.error(error.message || 'Erro ao carregar aulas');
    }
  }, [request]);

  const loadMaterials = useCallback(async (lessonId: string) => {
    try {
      const data = await request(`/lessons/${encodeURIComponent(lessonId)}/materials`);
      setMaterials(previous => ({ ...previous, [lessonId]: data || [] }));
    } catch (error: any) {
      toast.error(error.message || 'Erro ao carregar materiais');
    }
  }, [request]);

  useEffect(() => {
    void loadCourses();
  }, [loadCourses]);

  useEffect(() => {
    if (selectedId) void loadLessons(selectedId);
  }, [selectedId, loadLessons]);

  const openCourse = (courseId: string) => {
    setSelectedId(courseId);
    setExpandedLesson(null);
    setLessonFormOpen(false);
    setUploadFiles([]);
  };

  const resetPanels=()=>{setSecurityOpen(false);setAccessOpen(false);setUserSearch('');};
  const loadAccessUsers=async()=>{try{setAccessUsers(await request('/access-users'));}catch(e:any){toast.error(e.message);}};
  const startNewCourse = async () => {
    try { setPolicy(await request('/security-defaults')); } catch(e:any) { toast.error(e.message); return; }
    resetPanels();setAccess({...DEFAULT_ACCESS});void loadAccessUsers();
    setEditingCourse(null);
    setName('');
    setDescription('');
    setCourseStatus('draft');
    setCourseFormOpen(true);
  };

  const startEditCourse = (course: Course) => {
    try { const saved=typeof course.security_policy_json==='string'?JSON.parse(course.security_policy_json):course.security_policy_json; if(!saved)throw Error('Configurações individuais indisponíveis'); setPolicy(saved); } catch(e:any){toast.error(e.message);return;}
    resetPanels();
    try{const value=typeof course.access_policy_json==='string'?JSON.parse(course.access_policy_json):course.access_policy_json;setAccess(value?{...value,roles:[...new Set<string>((value.roles||[]).flatMap((r:string)=>r==='comercial'?['vendedor','sdr']:r==='gestao'?['admin','gerente','diretoria']:[r]))]}:{...LEGACY_ACCESS});}catch{setAccess({...LEGACY_ACCESS});}
    void loadAccessUsers();
    setEditingCourse(course.id);
    setName(course.title);
    setDescription(course.description || '');
    setCourseStatus(
      course.status === 'published' ? 'published' : 'draft'
    );
    setCourseFormOpen(true);
  };

  const saveCourse = async () => {
    if (!name.trim()) {
      toast.error('Informe o nome do treinamento');
      return;
    }

    if((access.mode==='roles'&&!access.roles.length)||(access.mode==='users'&&!access.users.length)){setAccessOpen(true);toast.error('Selecione quem terá acesso ao treinamento.');return;}
    setBusy(true);

    try {
      const body = {
        title: name.trim(),
        description: description.trim(),
        status: courseStatus,
        security_policy: policy,
        access_policy: access
      };

      if (editingCourse) {
        await request(
          `/courses/${encodeURIComponent(editingCourse)}`,
          'PATCH',
          body
        );
        toast.success('Treinamento atualizado no MariaDB');
      } else {
        const created = await request('/courses', 'POST', body);
        setSelectedId(created.id);
        toast.success('Treinamento criado no MariaDB');
      }

      setCourseFormOpen(false);
      setEditingCourse(null);
      await loadCourses();

    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  };

  const archiveCourse = async (course: Course) => {
    if (!window.confirm(
      `Arquivar "${course.title}"? Os dados serão preservados no MariaDB.`
    )) return;

    setBusy(true);

    try {
      await request(`/courses/${encodeURIComponent(course.id)}`, 'DELETE');
      toast.success('Treinamento arquivado');
      if (selectedId === course.id) setSelectedId(null);
      await loadCourses();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  };

  const startNewLesson = () => {
    setEditingLesson(null);
    setLessonName('');
    setLessonDescription('');
    setLessonFormOpen(true);
  };

  const startEditLesson = (lesson: Lesson) => {
    setEditingLesson(lesson.id);
    setLessonName(lesson.title);
    setLessonDescription(lesson.description || '');
    setLessonFormOpen(true);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      document.getElementById('training-lesson-editor')?.scrollIntoView({
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
        block: 'start'
      });
    }));
  };

  const saveLesson = async () => {
    if (!selectedId || !lessonName.trim()) {
      toast.error('Informe o nome da aula');
      return;
    }

    setBusy(true);

    try {
      const body = {
        title: lessonName.trim(),
        description: lessonDescription.trim()
      };

      if (editingLesson) {
        await request(
          `/lessons/${encodeURIComponent(editingLesson)}`,
          'PATCH',
          body
        );
        toast.success('Aula atualizada');
      } else {
        await request(
          `/courses/${encodeURIComponent(selectedId)}/lessons`,
          'POST',
          body
        );
        toast.success('Aula criada no MariaDB');
      }

      setLessonFormOpen(false);
      setEditingLesson(null);
      setLessonName('');
      setLessonDescription('');
      await loadLessons(selectedId);
      await loadCourses();

    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  };

  const uploadSingleFile = (
    lessonId: string,
    file: File
  ): Promise<void> => new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.open(
      'POST',
      `${API}/lessons/${encodeURIComponent(lessonId)}/materials`
    );

    xhr.setRequestHeader('Authorization', `Bearer ${token}`);

    xhr.upload.onprogress = event => {
      if (event.lengthComputable) {
        setUploadProgress(
          Math.round((event.loaded / event.total) * 100)
        );
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        let message = `Falha no upload (HTTP ${xhr.status})`;
        try {
          const result = JSON.parse(xhr.responseText);
          if (result.error?.message) message = result.error.message;
        } catch {}
        reject(new Error(message));
      }
    };

    xhr.onerror = () => reject(
      new Error('Conexão interrompida durante o upload')
    );

    xhr.ontimeout = () => reject(
      new Error('Tempo de upload excedido')
    );

    const payload = new FormData();
    payload.append('files', file);
    xhr.send(payload);
  });

  const sendMaterials = async (lessonId: string) => {
    if (!uploadFiles.length) {
      toast.error('Selecione pelo menos um arquivo');
      return;
    }

    setUploading(true);
    let uploaded = 0;

    try {
      for (const file of uploadFiles) {
        setUploadProgress(0);
        await uploadSingleFile(lessonId, file);
        uploaded++;
      }

      toast.success(`${uploaded} arquivo(s) salvo(s) na VPS`);
      setUploadFiles([]);
      setUploadProgress(0);
      await loadMaterials(lessonId);

      if (selectedId) await loadLessons(selectedId);

    } catch (error: any) {
      toast.error(error.message || 'Falha no upload');
      if (uploaded) {
        toast.info(`${uploaded} arquivo(s) foram enviados antes da falha`);
        await loadMaterials(lessonId);
      }
    } finally {
      setUploading(false);
    }
  };

  const downloadMaterial = async (material: Material) => {
    try {
      const response = await fetch(
        `${API}/materials/${encodeURIComponent(material.id)}/download`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (!response.ok) throw new Error('Download não autorizado');

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = material.original_name;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);

    } catch (error: any) {
      toast.error(error.message || 'Erro ao baixar arquivo');
    }
  };

  const deleteMaterial = async (material: Material, lessonId: string) => {
    if (!window.confirm(`Excluir definitivamente "${material.original_name}"?`)) {
      return;
    }

    try {
      await request(
        `/materials/${encodeURIComponent(material.id)}`,
        'DELETE'
      );

      toast.success('Material excluído');
      await loadMaterials(lessonId);
      if (selectedId) await loadLessons(selectedId);

    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const toggleLesson = async (lessonId: string) => {
    const next = expandedLesson === lessonId ? null : lessonId;
    setExpandedLesson(next);
    setUploadFiles([]);
    setUploadProgress(0);
    if (next) await loadMaterials(next);
  };

  if (realRole !== 'dev') {
    return (
      <DashboardLayout>
        <p className="p-6">Acesso restrito ao perfil DEV.</p>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <TrainingFinalLocksDev />
      <TrainingSecurityDev />
      <TrainingLocksDev />
      <div className="space-y-6 animate-fade-in pb-12">
        <div className="flex flex-wrap justify-between items-start gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
              <BookOpen className="h-4 w-4" />
              <span>Treinamentos / Gerenciamento</span>
            </div>
            <h1 className="text-2xl font-bold">
              {selected ? selected.title : 'Gerenciamento de Treinamentos'}
            </h1>
            <p className="text-muted-foreground mt-1">
              {selected
                ? selected.description || 'Organize as aulas e materiais deste treinamento.'
                : 'Cadastre treinamentos e organize seus conteúdos.'}
            </p>
          </div>
          <Badge variant="outline" className="gap-1">
            <LockKeyhole className="h-3 w-3" />
            Somente DEV
          </Badge>
        </div>

        {!selected ? (
          <>
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardContent className="p-5">
                  <p className="text-sm text-muted-foreground">
                    Treinamentos cadastrados
                  </p>
                  <p className="text-3xl font-semibold mt-1">
                    {courses.length}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-5">
                  <p className="text-sm text-muted-foreground">
                    Aulas cadastradas
                  </p>
                  <p className="text-3xl font-semibold mt-1">
                    {courses.reduce(
                      (sum, course) => sum + Number(course.lesson_count || 0),
                      0
                    )}
                  </p>
                </CardContent>
              </Card>
            </div>

            <div className="flex flex-wrap justify-between items-center gap-3">
              <h2 className="text-lg font-semibold">
                Treinamentos
              </h2>
              <Button
                className={NAVY}
                onClick={startNewCourse}
              >
                <Plus className="h-4 w-4 mr-2" />
                Novo Treinamento
              </Button>
            </div>

            {courseFormOpen && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">
                    {editingCourse
                      ? 'Editar treinamento'
                      : 'Criar treinamento'}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Nome do treinamento *</Label>
                    <Input
                      value={name}
                      onChange={event => setName(event.target.value)}
                      placeholder="Ex.: Conhecendo os tecidos Digitale"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Descrição</Label>
                    <Textarea
                      rows={3}
                      value={description}
                      onChange={event => setDescription(event.target.value)}
                      placeholder="Descreva o objetivo do treinamento..."
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="training-status">
                      Situação do treinamento *
                    </Label>
                    <select
                      id="training-status"
                      value={courseStatus}
                      onChange={event =>
                        setCourseStatus(
                          event.target.value as 'draft' | 'published'
                        )
                      }
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      <option value="draft">
                        Rascunho
                      </option>
                      <option value="published">
                        Publicado
                      </option>
                    </select>
                    <p className="text-xs text-muted-foreground">
                      Você poderá alterar essa situação depois.
                    </p>
                  </div>
                  <div>
                    <button type="button" aria-expanded={securityOpen} onClick={()=>setSecurityOpen(v=>!v)} className="inline-flex max-w-full items-center gap-2 py-1 text-left font-semibold text-[#1F3147]"><span>Segurança das avaliações</span><ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${securityOpen?'rotate-180':''}`}/></button>
                    {securityOpen&&<div className="space-y-3 pt-3">
                    <p className="text-xs text-muted-foreground">{editingCourse?'Estas regras pertencem somente a este treinamento.':'Os padrões gerais foram carregados. Personalize antes de salvar.'}</p>
                    {policy && <><div className="grid gap-2 md:grid-cols-2">{OPTIONS.map(([key,label])=><label key={key} className="flex items-center gap-3 rounded-lg border p-3 text-sm"><input type="checkbox" className="h-4 w-4" checked={Boolean(policy[key])} onChange={e=>setPolicy(prev=>({...prev,[key]:e.target.checked}))}/>{label}</label>)}</div>
                    <label className="flex items-center gap-3 text-sm">Tempo por pergunta<select className="rounded-md border p-2" value={Number(policy.seconds_per_question)} onChange={e=>setPolicy(prev=>({...prev,seconds_per_question:Number(e.target.value)}))}>{(editingCourse==='a7c54ef2-b9a3-4a28-9d11-261116000001'?[0,30,45,60,90]:[30,45,60,90]).map(n=><option key={n} value={n}>{n===0?'Sem limite':n+' segundos'}</option>)}</select></label></>}
                    <Button type="button" variant="outline" disabled={busy} onClick={async()=>{try{setPolicy(await request('/security-defaults'));}catch(e:any){toast.error(e.message);}}}>Carregar padrões gerais</Button>
                    </div>}
                  </div>
                  <div>
                    <button type="button" aria-expanded={accessOpen} onClick={()=>setAccessOpen(v=>!v)} className="inline-flex max-w-full items-center gap-2 py-1 text-left font-semibold text-[#1F3147]"><span>Disponibilidade e acesso</span><ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${accessOpen?'rotate-180':''}`}/></button>
                    {accessOpen&&<div className="space-y-4 pt-3">
                      <p className="text-sm text-muted-foreground">Defina quais usuários terão acesso a este treinamento quando publicado.</p>
                      <div className="space-y-2">{accessModes.map(([key,label])=><label key={key} className="flex items-center gap-3 text-sm"><input type="radio" name="training-access-mode" checked={access.mode===key} onChange={()=>setAccess(p=>({...p,mode:key}))}/>{label}</label>)}</div>
                      {access.mode==='roles'&&<div className="space-y-2 border-t pt-4"><p className="text-sm font-medium">Selecione os cargos autorizados</p><div className="grid gap-2 sm:grid-cols-2">{accessRoles.map(([key,label])=><label key={key} className="flex items-center gap-3 rounded-lg border p-3 text-sm"><input type="checkbox" checked={access.roles.includes(key)} onChange={e=>setAccess(p=>({...p,roles:e.target.checked?[...p.roles,key]:p.roles.filter(k=>k!==key)}))}/>{label}</label>)}</div></div>}
                      {access.mode==='users'&&<div className="space-y-2 border-t pt-4"><p className="text-sm font-medium">Selecione os usuários autorizados</p><Input placeholder="Buscar por nome ou e-mail" value={userSearch} onChange={e=>setUserSearch(e.target.value)}/><div className="max-h-64 space-y-2 overflow-y-auto">{accessUsers.filter(u=>(u.name+' '+u.email).toLowerCase().includes(userSearch.toLowerCase())).map(u=><label key={u.id} className="flex items-center gap-3 rounded-lg border p-3 text-sm"><input type="checkbox" checked={access.users.includes(u.id)} onChange={e=>setAccess(p=>({...p,users:e.target.checked?[...p.users,u.id]:p.users.filter(k=>k!==u.id)}))}/><span><span className="block font-medium">{u.name}</span><span className="block text-xs text-muted-foreground">{u.email}</span></span></label>)}</div></div>}
                      <p className="text-xs text-muted-foreground">DEV mantém acesso de gerenciamento e teste. Rascunhos não são disponibilizados aos colaboradores.</p>
                    </div>}
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setCourseFormOpen(false)}
                      disabled={busy}
                    >
                      Cancelar
                    </Button>
                    <Button
                      className={NAVY}
                      onClick={saveCourse}
                      disabled={busy || !policy}
                    >
                      {busy ? 'Salvando...' : 'Salvar Treinamento'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {loading ? (
              <Card>
                <CardContent className="py-12 flex items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </CardContent>
              </Card>
            ) : courses.length === 0 ? (
              <Card>
                <CardContent className="py-16 text-center">
                  <BookOpen className="mx-auto h-10 w-10 text-muted-foreground/40" />
                  <p className="font-semibold mt-4">
                    Nenhum treinamento cadastrado
                  </p>
                  <p className="text-sm text-muted-foreground mt-2">
                    Crie um treinamento para começar a adicionar aulas.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {courses.map(course => (
                  <Card key={course.id} className="overflow-hidden">
                    <div className="h-1 bg-[#1F3147]" />
                    <CardContent className="p-5 space-y-4">
                      <div className="flex justify-between items-start">
                        <div className="h-11 w-11 rounded-lg bg-[#E8EDF2] flex items-center justify-center">
                          <BookOpen className="h-5 w-5 text-[#1F3147]" />
                        </div>
                        <Badge variant="secondary">
                          {course.status === 'draft'
                            ? 'Rascunho'
                            : course.status}
                        </Badge>
                      </div>

                      <div>
                        <h3 className="font-semibold">
                          {course.title}
                        </h3>
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-3">
                          {course.description || 'Sem descrição'}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Layers3 className="h-4 w-4" />
                        {course.lesson_count || 0} aula(s)
                      </div>

                      <Button
                        className={`w-full ${NAVY}`}
                        onClick={() => openCourse(course.id)}
                      >
                        Gerenciar conteúdo
                        <ChevronRight className="h-4 w-4 ml-2" />
                      </Button>

                      <div className="flex justify-end gap-2 border-t pt-3">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => startEditCourse(course)}
                        >
                          <Pencil className="h-4 w-4 mr-1" />
                          Editar
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busy}
                          onClick={() => archiveCourse(course)}
                        >
                          <Archive className="h-4 w-4 mr-1" />
                          Arquivar
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  setSelectedId(null);
                  setLessonFormOpen(false);
                  setExpandedLesson(null);
                }}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Voltar aos treinamentos
              </Button>

              <Button className={NAVY} onClick={startNewLesson}>
                <Plus className="h-4 w-4 mr-2" />
                Adicionar Aula
              </Button>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <Card>
                <CardContent className="p-5">
                  <p className="text-sm text-muted-foreground">
                    Total de aulas
                  </p>
                  <p className="text-3xl font-semibold mt-1">
                    {lessons.length}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-5">
                  <p className="text-sm text-muted-foreground">
                    Materiais cadastrados
                  </p>
                  <p className="text-3xl font-semibold mt-1">
                    {lessons.reduce(
                      (sum, lesson) => sum + Number(lesson.material_count || 0),
                      0
                    )}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-5">
                  <p className="text-sm text-muted-foreground">
                    Acesso atual
                  </p>
                  <p className="font-semibold mt-2">
                    Exclusivo DEV
                  </p>
                </CardContent>
              </Card>
            </div>

            {lessonFormOpen && (
              <Card id="training-lesson-editor" className="scroll-mt-24">
                <CardHeader>
                  <CardTitle className="text-lg">
                    {editingLesson ? 'Editar aula' : 'Nova aula'}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Nome da aula *</Label>
                    <Input
                      value={lessonName}
                      onChange={event => setLessonName(event.target.value)}
                      placeholder="Ex.: Aula 01 — Introdução"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Descrição</Label>
                    <Textarea
                      value={lessonDescription}
                      onChange={event => setLessonDescription(event.target.value)}
                      rows={3}
                      placeholder="Descreva o conteúdo desta aula..."
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setLessonFormOpen(false)}
                    >
                      Cancelar
                    </Button>
                    <Button
                      className={NAVY}
                      disabled={busy}
                      onClick={saveLesson}
                    >
                      {busy ? 'Salvando...' : 'Salvar Aula'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <div className="flex justify-between items-center gap-2">
                  <CardTitle className="text-lg">
                    Aulas e materiais
                  </CardTitle>
                  <Button
                    variant="ghost"
                    size="icon"
                    title="Atualizar aulas"
                    onClick={() => void loadLessons(selected.id)}
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {lessons.length === 0 ? (
                  <div className="py-12 text-center">
                    <Layers3 className="h-9 w-9 mx-auto text-muted-foreground/40" />
                    <p className="font-medium mt-3">
                      Nenhuma aula cadastrada
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Adicione uma aula para inserir os primeiros arquivos.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {lessons.map((lesson, index) => (
                      <div
                        key={lesson.id}
                        className="border rounded-xl overflow-hidden"
                      >
                        <div className="flex flex-wrap items-center gap-3 p-4">
                          <div className="h-10 w-10 bg-[#E8EDF2] rounded-lg flex items-center justify-center font-semibold text-[#1F3147]">
                            {String(index + 1).padStart(2, '0')}
                          </div>

                          <div className="flex-1 min-w-0">
                            <p className="font-medium">{lesson.title}</p>
                            <p className="text-sm text-muted-foreground">
                              {lesson.description || 'Sem descrição'}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                              {lesson.material_count || 0} material(is)
                            </p>
                          </div>

                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => startEditLesson(lesson)}
                            title="Editar aula"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>

                          <Button
                            variant="outline"
                            onClick={() => void toggleLesson(lesson.id)}
                          >
                            <Paperclip className="h-4 w-4 mr-2" />
                            {expandedLesson === lesson.id
                              ? 'Fechar'
                              : 'Materiais'}
                          </Button>
                        </div>

                        {expandedLesson === lesson.id && (
                          <div className="p-4 space-y-4 border-t bg-muted/20">
                            <div>
                              <h4 className="font-semibold">
                                Enviar materiais da aula
                              </h4>
                              <p className="text-xs text-muted-foreground mt-1">
                                Vídeos, PDFs, imagens e documentos.
                                Armazenamento privado na VPS.
                              </p>
                            </div>

                            <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-xl p-6 cursor-pointer hover:bg-background">
                              <Upload className="h-7 w-7 text-[#1F3147]" />
                              <span className="text-sm font-medium">
                                Selecionar arquivos
                              </span>
                              <span className="text-xs text-muted-foreground">
                                Sem limite de MB definido na aplicação
                              </span>
                              <input
                                type="file"
                                multiple
                                className="hidden"
                                disabled={uploading}
                                onChange={event =>
                                  setUploadFiles(Array.from(event.target.files || []))
                                }
                              />
                            </label>

                            {uploadFiles.length > 0 && (
                              <div className="space-y-2">
                                {uploadFiles.map((file, fileIndex) => (
                                  <div
                                    key={`${file.name}-${fileIndex}`}
                                    className="flex gap-2 justify-between text-sm border rounded-lg p-2 bg-background"
                                  >
                                    <span className="truncate">{file.name}</span>
                                    <span className="whitespace-nowrap text-muted-foreground">
                                      {fileSize(file.size)}
                                    </span>
                                  </div>
                                ))}

                                {uploading && (
                                  <div className="space-y-1">
                                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                                      <div
                                        className="h-full bg-[#1F3147] transition-all"
                                        style={{ width: `${uploadProgress}%` }}
                                      />
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                      Arquivo atual: {uploadProgress}%
                                    </p>
                                  </div>
                                )}

                                <Button
                                  className={NAVY}
                                  disabled={uploading}
                                  onClick={() => void sendMaterials(lesson.id)}
                                >
                                  {uploading
                                    ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    : <Upload className="h-4 w-4 mr-2" />}
                                  {uploading
                                    ? 'Enviando...'
                                    : 'Enviar para VPS'}
                                </Button>
                              </div>
                            )}

                            <div className="space-y-2">
                              <h4 className="font-semibold text-sm">
                                Arquivos enviados
                              </h4>

                              {(materials[lesson.id] || []).length === 0 ? (
                                <p className="text-sm text-muted-foreground">
                                  Nenhum material enviado ainda.
                                </p>
                              ) : (
                                (materials[lesson.id] || []).map(material => (
                                  <div
                                    key={material.id}
                                    className="flex flex-wrap items-center gap-3 rounded-lg border p-3 bg-background"
                                  >
                                    <FileText className="h-5 w-5 text-[#1F3147]" />
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm font-medium break-all">
                                        {material.original_name}
                                      </p>
                                      <p className="text-xs text-muted-foreground">
                                        {fileSize(material.file_size)}
                                      </p>
                                    </div>

                                    <Button
                                      variant="outline"
                                      size="icon"
                                      title="Baixar arquivo"
                                      onClick={() =>
                                        void downloadMaterial(material)
                                      }
                                    >
                                      <Download className="h-4 w-4" />
                                    </Button>

                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      title="Excluir material"
                                      onClick={() =>
                                        void deleteMaterial(material, lesson.id)
                                      }
                                    >
                                      <Trash2 className="h-4 w-4 text-destructive" />
                                    </Button>
                                  </div>
                                ))
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
            {/* DIGITALE_ASSESSMENT_BUILDER_V1 */}
            <TrainingAssessmentBuilder key={selected.id} courseId={selected.id} token={token} lessons={lessons} />
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
