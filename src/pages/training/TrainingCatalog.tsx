import DigitaleCommercialCourse from './DigitaleCommercialCourse';
import TrainingFinalJourney from './TrainingFinalJourney';
import TrainingYoutubeLesson from './TrainingYoutubeLesson';
// DIGITALE_DEV_TEST_CORES_V1
import { useCallback, useEffect, useMemo, useState } from 'react';
import TrainingActivityQuiz from './TrainingActivityQuiz';
import { Navigate } from 'react-router-dom';
import DashboardLayout from '@/components/layouts/DashboardLayout';
import TrainingPdfViewer from './TrainingPdfViewer';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  ArrowLeft, BookOpen, ChevronRight, FileText,
  Film, Image as ImageIcon, Music2, Search,
  LockKeyhole, Loader2, GraduationCap,
  Download, Layers3
} from 'lucide-react';

type Course = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  lesson_count: number;
};

type Lesson = {
  id: string;
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

const API = '/api/training-v2';
const NAVY = 'bg-[#1F3147] hover:bg-[#172638] text-white';

const isPreviewable = (item: Material) => {
  const type = item.mime_type || '';
  return type.startsWith('video/') ||
    type.startsWith('image/') ||
    type.startsWith('audio/') ||
    type === 'application/pdf';
};

const materialIcon = (item: Material) => {
  const type = item.mime_type || '';
  if (type.startsWith('video/')) return Film;
  if (type.startsWith('image/')) return ImageIcon;
  if (type.startsWith('audio/')) return Music2;
  return FileText;
};

export default function TrainingCatalog() {
  const { session, realRole, viewAsRole, loading: authLoading } = useAuth();
  const token = (session as any)?.access_token ||
                (session as any)?.accessToken || '';

  const [courses, setCourses] = useState<Course[]>([]);
  const [course, setCourse] = useState<Course | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [completedVideos, setCompletedVideos] = useState<string[]>([]);
  const [passedActivities, setPassedActivities] = useState<string[]>([]);
  const [activeStep, setActiveStep] = useState<'video' | 'activity'>('video');

  // DIGITALE_PERSISTENT_JOURNEY_V1
  const SECURITY_TEST_COURSE_ID =
    '297fc0fd-694a-4de4-831d-517b447b34cb';

  const [savingProgress, setSavingProgress] = useState(false);

  const journeyRequest = async (path: string, method = 'GET') => {
    const response = await fetch(
      `/api/training-journey-test-v2${path}`,
      {
        method,
        headers: { Authorization: `Bearer ${token}` }
      }
    );

    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        result.error?.message || `Erro HTTP ${response.status}`
      );
    }

    return result.data;
  };

  // DIGITALE_TEST_SKIP_MARKETING_V1
  const canTestSkip =
    realRole === 'dev' && (!viewAsRole || viewAsRole === 'dev') &&
    String((session as any)?.user?.email || '')
      .trim().toLowerCase() ===
      'marketing@digitaletextil.com.br' &&
    course?.id === SECURITY_TEST_COURSE_ID;

  const skipTestVideo = async (id: string): Promise<void> => {
    if (!course || !canTestSkip) {
      throw new Error('Sem permissão para pular o vídeo.');
    }

    setSavingProgress(true);

    try {
      const data = await journeyRequest(
        `/courses/${course.id}/lessons/${id}/test-skip`,
        'POST'
      );

      setCompletedVideos(data.completed_lesson_ids || []);
      toast.success('Vídeo liberado para teste DEV.');
    } catch (error: any) {
      toast.error(error.message);
      throw error;
    } finally {
      setSavingProgress(false);
    }
  };

  const completeVideo = async (id: string) => {
    if (!course || savingProgress) return;

    if (course.id !== SECURITY_TEST_COURSE_ID) {
      setCompletedVideos(previous =>
        previous.includes(id) ? previous : [...previous, id]
      );
      return;
    }

    setSavingProgress(true);

    try {
      const data = await journeyRequest(
        `/courses/${course.id}/lessons/${id}/complete`,
        'POST'
      );

      setCompletedVideos(data.completed_lesson_ids || []);
      toast.success('Aula concluída! Próxima etapa liberada.');
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSavingProgress(false);
    }
  };

  const [materials, setMaterials] = useState<Record<string, Material[]>>({});
  const [lessonId, setLessonId] = useState<string | null>(null);
  const [material, setMaterial] = useState<Material | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingContent, setLoadingContent] = useState(false);

  const request = useCallback(async (path: string) => {
    const response = await fetch(API + path, {
      headers: { Authorization: `Bearer ${token}` }
    });

    const json = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(json.error?.message || 'Erro ao carregar conteúdo');
    }

    return json.data;
  }, [token]);

  const loadCourses = useCallback(async () => {
    if (!token) return;
    try {
      const data = await request(realRole==='dev'?'/courses':'/available');
      setCourses(Array.isArray(data) ? data : []);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  }, [request, token, realRole]);

  useEffect(() => { void loadCourses(); }, [loadCourses]);

  const chooseMaterial = async (item: Material) => {
    setMaterial(item);
    setPreviewUrl('');

    if (!isPreviewable(item)) return;

    try {
      const result = await request(
        `/materials/${encodeURIComponent(item.id)}/preview-ticket`
      );
      setPreviewUrl(result.url);
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const loadLesson = async (id: string) => {
    const targetIndex = lessons.findIndex(item => item.id === id);

    if (
      course?.id === SECURITY_TEST_COURSE_ID &&
      (
        targetIndex < 0 ||
        lessons.slice(0, targetIndex).some(
          item => !passedActivities.includes(item.id)
        )
      )
    ) {
      toast.error('Conclua a atividade anterior para liberar esta aula.');
      return;
    }

    // DIGITALE_TRAINING_RESUME_FIX_V1
    const videoDone =
      completedVideos.includes(id);

    const activityPending =
      !passedActivities.includes(id);

    setActiveStep(
      course?.id === SECURITY_TEST_COURSE_ID &&
      videoDone &&
      activityPending
        ? 'activity'
        : 'video'
    );

    setLessonId(id);
    setMaterial(null);
    setPreviewUrl('');
    setLoadingContent(true);

    try {
      const data = await request(
        `/lessons/${encodeURIComponent(id)}/materials`
      );
      const items: Material[] = Array.isArray(data) ? data : [];
      setMaterials(previous => ({ ...previous, [id]: items }));
      if (items.length) await chooseMaterial(items[0]);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoadingContent(false);
    }
  };

  const openCourse = async (item: Course) => {
    setCompletedVideos([]);
    setPassedActivities([]);
    setActiveStep('video');
    setCourse(item);
    if (item.id === 'a7c54ef2-b9a3-4a28-9d11-261116000001') return;
    setLessons([]);
    setLessonId(null);
    setMaterial(null);
    setPreviewUrl('');
    setLoadingContent(true);

    try {
      const data = await request(
        `/courses/${encodeURIComponent(item.id)}/lessons`
      );
      const items: Lesson[] = Array.isArray(data) ? data : [];
      setLessons(items);
      if (item.id === SECURITY_TEST_COURSE_ID) {
        const progress = await journeyRequest(
          `/courses/${item.id}/progress`
        );

        const done: string[] =
          progress.completed_lesson_ids || [];

        const response = await fetch(
          `/api/training-activity-player-test/courses/${item.id}/progress`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        if (!response.ok) {
          throw new Error('Não foi possível carregar as atividades.');
        }

        const activityProgress = await response.json();
        const passed: string[] =
          activityProgress.data?.passed_lesson_ids || [];

        setCompletedVideos(done);
        setPassedActivities(passed);

        const current = items.find(
          lesson => !passed.includes(lesson.id)
        ) || items[items.length - 1];

        if (current) {
          setActiveStep(
            done.includes(current.id) && !passed.includes(current.id)
              ? 'activity'
              : 'video'
          );
          setLessonId(current.id);
          setMaterial(null);
          setPreviewUrl('');

          const data = await request(
            `/lessons/${encodeURIComponent(current.id)}/materials`
          );

          const files: Material[] =
            Array.isArray(data) ? data : [];

          setMaterials(previous => ({
            ...previous,
            [current.id]: files
          }));

          if (files.length) await chooseMaterial(files[0]);
        }
      } else if (items.length) {
        await loadLesson(items[0].id);
      }
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoadingContent(false);
    }
  };

  const download = async (item: Material) => {
    try {
      const response = await fetch(
        `${API}/materials/${encodeURIComponent(item.id)}/download`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!response.ok) throw new Error('Erro ao baixar arquivo');

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = item.original_name;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const filtered = useMemo(() => {
    const text = search.toLowerCase().trim();
    return courses.filter(item =>
      (
        item.status === 'published' ||
        (
          item.status === 'draft' &&
          item.title === '[TESTE SEGURANÇA] Conhecendo as Cores'
        )
      ) &&
      (
        item.title.toLowerCase().includes(text) ||
        (item.description || '').toLowerCase().includes(text)
      )
    );
  }, [courses, search]);

  if (authLoading) {
    return <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="h-7 w-7 animate-spin" />
    </div>;
  }





  const activeIndex = lessons.findIndex(item => item.id === lessonId);

  const nextLesson = () => {
    if (!lessonId || savingProgress) return;

    if (course?.id === SECURITY_TEST_COURSE_ID) {
      if (activeStep === 'video') {
        if (!completedVideos.includes(lessonId)) return;
        setActiveStep('activity');
        return;
      }

      if (!passedActivities.includes(lessonId)) return;

      if (activeIndex >= 0 && activeIndex < lessons.length - 1) {
        void loadLesson(lessons[activeIndex + 1].id);
      }
      return;
    }

    if (activeIndex >= 0 && activeIndex < lessons.length - 1) {
      void loadLesson(lessons[activeIndex + 1].id);
    }
  };

  const selectedLesson = lessons.find(item => item.id === lessonId);
  const youtubeId = selectedLesson?.description?.match(
    /YOUTUBE_ID=([\w-]{11})/
  )?.[1];

  if (course?.id === 'a7c54ef2-b9a3-4a28-9d11-261116000001') return <DashboardLayout><DigitaleCommercialCourse token={token} canDevSkip={realRole === 'dev' && (!viewAsRole || viewAsRole === 'dev')} onBack={()=>setCourse(null)}/></DashboardLayout>;

  return (
    <DashboardLayout>
      <div className="space-y-5 animate-fade-in pb-10">

        {!course ? (
          <>
            <div className="flex flex-wrap justify-between gap-3">
              <div>
                <h1 className="text-2xl font-bold">Treinamentos</h1>
                <p className="text-muted-foreground mt-1">
                  Acesse os treinamentos publicados e seus conteúdos.
                </p>
              </div>
              {realRole==='dev'&&<Badge variant="outline" className="h-fit gap-1"><LockKeyhole className="h-3 w-3"/>Acesso DEV</Badge>}
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-10"
                placeholder="Buscar treinamento..."
                value={search}
                onChange={event => setSearch(event.target.value)}
              />
            </div>

            {loading ? (
              <div className="py-16 text-center">
                <Loader2 className="h-6 w-6 mx-auto animate-spin" />
              </div>
            ) : filtered.length === 0 ? (
              <Card>
                <CardContent className="py-16 text-center">
                  <GraduationCap className="h-10 w-10 mx-auto text-muted-foreground" />
                  <p className="font-medium mt-3">
                    Nenhum treinamento publicado
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {filtered.map(item => (
                  <Card key={item.id} className="overflow-hidden">
                    <div className="h-1 bg-[#1F3147]" />
                    <CardContent className="p-5 space-y-4">
                      <div className="h-11 w-11 rounded-lg bg-[#E8EDF2] flex items-center justify-center">
                        <BookOpen className="h-5 w-5 text-[#1F3147]" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-lg">
                          {item.title}
                        </h3>
                        <p className="text-sm text-muted-foreground mt-2">
                          {item.description || 'Sem descrição'}
                        </p>
                      </div>
                      <p className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Layers3 className="h-4 w-4" />
                        {item.lesson_count || 0} aula(s)
                      </p>
                      <Button
                        className={`w-full ${NAVY}`}
                        onClick={() => void openCourse(item)}
                      >
                        Acessar treinamento
                        <ChevronRight className="h-4 w-4 ml-2" />
                      </Button>
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
                  setCourse(null);
                  setLessons([]);
                  setMaterial(null);
                  setPreviewUrl('');
                }}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Voltar aos treinamentos
              </Button>
              <Badge variant="outline">Ambiente de aprendizagem</Badge>
            </div>

            <div>
              <h1 className="text-2xl font-bold">{course.title}</h1>
              <p className="text-muted-foreground mt-1">
                {course.description}
              </p>
            </div>

            
            

              {course.id === SECURITY_TEST_COURSE_ID && (
              <div className="rounded-xl border bg-white p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-[#1F3147]">
                      Sua jornada de aprendizagem
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Seu progresso fica salvo nesta conta
                    </p>
                  </div>
                  <span className="font-bold text-emerald-600">
                    {lessons.length
                      ? Math.round(
                          (completedVideos.length + passedActivities.length) / (lessons.length * 2) * 100
                        )
                      : 0}%
                  </span>
                </div>
                <div className="h-3 rounded-full bg-slate-200 overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 transition-all duration-500"
                    style={{
                      width: `${lessons.length
                        ? Math.min(100, (completedVideos.length + passedActivities.length) /
                            (lessons.length * 2) * 100)
                        : 0}%`
                    }}
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  {lessons.map((item, index) => {
                    const done = passedActivities.includes(item.id);
                    const pending = lessons.findIndex(
                      lesson => !passedActivities.includes(lesson.id)
                    );
                    const unlocked = index <= (
                      pending < 0 ? lessons.length - 1 : pending
                    );
                    return (
                      <button
                        key={item.id}
                        type="button"
                        disabled={!unlocked}
                        onClick={() => void loadLesson(item.id)}
                        className={`rounded-lg border px-3 py-2 text-xs font-medium ${
                          done
                            ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                            : unlocked
                              ? 'bg-blue-50 border-blue-300 text-blue-800'
                              : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                        }`}
                      >
                        {done ? '✓' : unlocked ? '▶' : '🔒'}
                        {' '}Aula {index + 1}
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground">
                  Verde: concluída e disponível para revisão.
                  Azul: liberada. Cinza: bloqueada.
                </p>
              </div>
            )}
<div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
              <div className="space-y-4 min-w-0">
                {course.id === SECURITY_TEST_COURSE_ID &&
                  lessonId &&
                  completedVideos.includes(lessonId) && (
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white px-4 py-3">
                      <div className="flex items-center gap-2 text-sm font-medium text-emerald-700">
                        <span>✓</span>
                        Vídeo concluído e salvo
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          setActiveStep(
                            activeStep === 'video'
                              ? 'activity'
                              : 'video'
                          )
                        }
                        className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-[#1F3147] hover:bg-slate-50"
                      >
                        {activeStep === 'video'
                          ? 'Ir para atividade'
                          : 'Rever vídeo'}
                      </button>
                    </div>
                  )}

                <Card className="overflow-hidden">
                  <div className="bg-[#111D2B] min-h-[320px] flex items-center justify-center">
                    {loadingContent ? (
                      <Loader2 className="h-8 w-8 animate-spin text-white" />
                    ) : activeStep === 'activity' &&
                        course.id === SECURITY_TEST_COURSE_ID ? (
                      <div className="w-full bg-white p-3 md:p-5">
                        <TrainingActivityQuiz
                          key={lessonId}
                          lessonId={lessonId!}
                          token={token}
                          onPassed={id => setPassedActivities(previous =>
                            previous.includes(id)
                              ? previous
                              : [...previous, id]
                          )}
                        />
                      </div>
                    ) : youtubeId ? (
                      <TrainingYoutubeLesson
                        key={lessonId}
                        videoId={youtubeId}
                        lessonId={lessonId!}
                        onComplete={id => { void completeVideo(id); }}
                        canTestSkip={canTestSkip}
                        onTestSkip={() => skipTestVideo(lessonId!)}
                      />
                    ) : !material ? (
                      <div className="text-center text-white/70 p-8">
                        <BookOpen className="h-10 w-10 mx-auto mb-3" />
                        Selecione uma aula com material disponível.
                      </div>
                    ) : !isPreviewable(material) ? (
                      <div className="p-8 text-center text-white">
                        <FileText className="h-12 w-12 mx-auto mb-4" />
                        <p className="mb-4">
                          Este formato não possui visualização incorporada.
                        </p>
                        <Button variant="secondary" onClick={() => void download(material)}>
                          <Download className="h-4 w-4 mr-2" />
                          Baixar material
                        </Button>
                      </div>
                    ) : !previewUrl ? (
                      <Loader2 className="h-8 w-8 animate-spin text-white" />
                    ) : material.mime_type?.startsWith('video/') ? (
                      <video
                        key={material.id}
                        src={previewUrl}
                        controls
                        playsInline
                        preload="metadata"
                        className="w-full max-h-[70vh] bg-black"
                      />
                    ) : material.mime_type?.startsWith('audio/') ? (
                      <div className="w-full p-8">
                        <Music2 className="h-12 w-12 mx-auto mb-6 text-white" />
                        <audio
                          key={material.id}
                          src={previewUrl}
                          controls
                          className="w-full"
                        />
                      </div>
                    ) : material.mime_type?.startsWith('image/') ? (
                      <img
                        src={previewUrl}
                        alt={material.original_name}
                        className="max-w-full max-h-[75vh] object-contain"
                      />
                    ) : (
                      <TrainingPdfViewer
                        key={material.id}
                        materialId={material.id}
                        token={token}
                        title={material.original_name}
                      />
                    )}
                  </div>
                  {material && (
                    <CardContent className="p-4 flex flex-wrap justify-between items-center gap-3">
                      <div className="min-w-0">
                        <p className="font-medium break-words">
                          {material.original_name}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Material do treinamento
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void download(material)}
                      >
                        <Download className="h-4 w-4 mr-2" />
                        Baixar
                      </Button>
                    </CardContent>
                  )}
                </Card>

                <div>
                  <h2 className="font-semibold text-lg">
                    {lessons[activeIndex]?.title || 'Conteúdo'}
                  </h2>
                  <p className="text-muted-foreground text-sm mt-1">
                    {lessons[activeIndex]?.description || ''}
                  </p>
                </div>

                <div className="flex justify-end">
                  <Button
                    className={NAVY}
                    disabled={
                      savingProgress ||
                      activeIndex < 0 ||
                      (
                        course.id === SECURITY_TEST_COURSE_ID
                          ? (
                              !lessonId ||
                              (
                                activeStep === 'video'
                                  ? !completedVideos.includes(lessonId)
                                  : !passedActivities.includes(lessonId) ||
                                    activeIndex >= lessons.length - 1
                              )
                            )
                          : activeIndex >= lessons.length - 1
                      )
                    }
                    onClick={nextLesson}
                  >
                    {course.id === SECURITY_TEST_COURSE_ID
                      ? activeStep === 'video'
                        ? completedVideos.includes(lessonId || '')
                          ? 'Iniciar atividade'
                          : 'Conclua o vídeo para avançar'
                        : passedActivities.includes(lessonId || '')
                          ? 'Próxima aula'
                          : 'Aguardando aprovação (80%)'
                      : 'Próxima etapa'}
                    <ChevronRight className="h-4 w-4 ml-2" />
                  </Button>
                </div>
              </div>

              <Card className="overflow-hidden h-fit xl:sticky xl:top-4">
                <div className="p-4 border-b">
                  <h2 className="font-semibold">Aulas do treinamento</h2>
                  <p className="text-xs text-muted-foreground mt-1">
                    {lessons.length} aula(s) cadastrada(s)
                  </p>
                </div>
                <div className="max-h-[65vh] overflow-y-auto p-2 space-y-1">
                  {lessons.map((lesson, index) => (
                    <div key={lesson.id}>
                      <button
                        type="button"
                        onClick={() => void loadLesson(lesson.id)}
                        disabled={
                          course.id === SECURITY_TEST_COURSE_ID &&
                          index > (
                            lessons.findIndex(
                              item => !passedActivities.includes(item.id)
                            ) < 0
                              ? lessons.length - 1
                              : lessons.findIndex(
                                  item => !passedActivities.includes(item.id)
                                )
                          )
                        }
                        className={`w-full flex gap-3 items-start text-left p-3 rounded-lg transition-colors ${
                          lessonId === lesson.id
                            ? 'bg-[#E8EDF2] text-[#1F3147]'
                            : 'hover:bg-muted'
                        }`}
                      >
                        <span className="text-xs font-bold mt-1">
                          {String(index + 1).padStart(2, '0')}
                        </span>
                        <span className="flex-1">
                          <span className="block text-sm font-medium">
                            {lesson.title}
                          </span>
                          <span className="block text-xs opacity-70 mt-1">
                            {course.id === SECURITY_TEST_COURSE_ID
                              ? completedVideos.includes(lesson.id)
                                ? '✓ Concluída · rever aula'
                                : index > (
                                    lessons.findIndex(
                                      item => !passedActivities.includes(item.id)
                                    ) < 0
                                      ? lessons.length - 1
                                      : lessons.findIndex(
                                          item => !passedActivities.includes(item.id)
                                        )
                                  )
                                  ? '🔒 Bloqueada'
                                  : '▶ Disponível'
                              : `${lesson.material_count || 0} material(is)`}
                          </span>
                        </span>
                        <ChevronRight className="h-4 w-4 mt-1" />
                      </button>

                      {lessonId === lesson.id && (
                        <div className="pl-6 pr-2 pb-2 space-y-1">
                          {(materials[lesson.id] || []).map(item => {
                            const Icon = materialIcon(item);
                            return (
                              <button
                                key={item.id}
                                type="button"
                                onClick={() => void chooseMaterial(item)}
                                className={`w-full flex items-center gap-2 rounded-md px-2 py-2 text-left text-xs ${
                                  material?.id === item.id
                                    ? 'bg-[#1F3147] text-white'
                                    : 'hover:bg-muted'
                                }`}
                              >
                                <Icon className="h-4 w-4 shrink-0" />
                                <span className="break-all">
                                  {item.original_name}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ))}

                  {/* DIGITALE_FINAL_STEP_05 */}
                  {course.id === SECURITY_TEST_COURSE_ID && (
                    <div className="mt-2 border-t pt-2">
                      <button
                        type="button"
                        onClick={() => {
                          document
                            .getElementById('digitale-final-content')
                            ?.scrollIntoView({
                              behavior: 'smooth',
                              block: 'start'
                            });
                        }}
                        className="w-full flex items-start gap-3 rounded-lg bg-[#EEF2F6] p-3 text-left hover:bg-[#E2E9F0]"
                      >
                        <span className="mt-1 text-xs font-bold">05</span>

                        <span className="flex-1">
                          <span className="block text-sm font-semibold">
                            Prova Final
                          </span>
                          <span className="block text-xs text-slate-500 mt-1">
                            20 questões • 30 minutos • 80% para aprovação
                          </span>
                        </span>

                        <ChevronRight className="h-4 w-4 mt-1" />
                      </button>
                    </div>
                  )}
                </div>
              </Card>

              {course.id === SECURITY_TEST_COURSE_ID && (
                <div
                  id="digitale-final-content"
                  className="mt-3 scroll-mt-6"
                >
                  <TrainingFinalJourney />
                </div>
              )}
            </div>
          </>
        )}
      </div>
</DashboardLayout>
  );
}
