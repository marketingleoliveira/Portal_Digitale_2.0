import { useEffect, useState } from 'react';
import { jsPDF } from 'jspdf';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { FileDown, ClipboardList } from 'lucide-react';
import logoDigitale from '@/assets/logo-digitale-full.png';

type Attempt = {
  id: string;
  course_title: string | null;
  lesson_title: string | null;
  activity_title: string | null;
  score: number;
  passed: number;
  created_at: string;
};

type Step = {
  question: string;
  answered: boolean;
  answer: string | null;
  correct: boolean | null;
};

type Session = {
  id: string;
  course_title: string | null;
  lesson_title: string | null;
  activity_title: string | null;
  status: string;
  score: number | null;
  reason: string | null;
  question_index: number;
  answered_questions: number;
  created_at: string;
  steps: Step[];
};

type AuditEvent = {
  id: string;
  event_type: string;
  details: string | null;
  lesson_title: string | null;
  created_at: string;
};

type Report = {
  user: {
    id: string;
    name: string;
    email: string;
  };
  attempts: Attempt[];
  sessions: Session[];
  events: AuditEvent[];
  generated_at: string;
};

function formatDate(value: string) {
  if (!value) return '—';

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString('pt-BR');
}

function grade(value: number | null) {
  return value == null ? '—' : (Number(value)/10).toFixed(1).replace('.',',');
}

function statusLabel(value: string) {
  const labels: Record<string,string> = {
    active: 'Em andamento',
    completed: 'Concluída',
    interrupted: 'Interrompida',
    blocked: 'Bloqueada',
    released: 'Liberada'
  };

  return labels[value] || value;
}

async function imageData(url: string): Promise<string> {
  const image = new Image();
  image.crossOrigin = 'anonymous';

  return new Promise((resolve, reject) => {
    image.onload = () => {
      const canvas = document.createElement('canvas');

      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;

      const context = canvas.getContext('2d');

      if (!context) {
        reject(new Error('Falha ao preparar logotipo.'));
        return;
      }

      context.drawImage(image,0,0);
      resolve(canvas.toDataURL('image/png'));
    };

    image.onerror = () => reject(
      new Error('Não foi possível carregar o logotipo.')
    );

    image.src = url;
  });
}

export default function TrainingActivityReport({
  userId
}: {
  userId: string;
}) {
  const { session } = useAuth();

  const token =
    (session as any)?.access_token ||
    (session as any)?.accessToken || '';

  const [opened, setOpened] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setOpened(false);
    setReport(null);
    setError('');
  }, [userId]);

  async function load() {
    if (!userId || !token) return;

    setLoading(true);
    setError('');

    try {
      const response = await fetch(
        '/api/training-activity-report/users/' +
          encodeURIComponent(userId) +
          '/activities',
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      const json = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          json.error?.message || `HTTP ${response.status}`
        );
      }

      setReport(json.data);
      setOpened(true);
    } catch (error: any) {
      setError(error.message || 'Erro ao carregar atividades.');
    } finally {
      setLoading(false);
    }
  }

  async function exportPDF() {
    if (!report || exporting) return;

    setExporting(true);
    setError('');

    try {
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      const margin = 16;
      const pageWidth = 210;
      const bottom = 280;
      let y = 18;

      const checkPage = (height = 10) => {
        if (y + height > bottom) {
          pdf.addPage();
          y = 20;
        }
      };

      const text = (
        content: unknown,
        size = 10,
        bold = false,
        spacing = 5
      ) => {
        const value = String(content ?? '—');

        pdf.setFont('helvetica', bold ? 'bold' : 'normal');
        pdf.setFontSize(size);
        pdf.setTextColor(31,49,71);

        const lines = pdf.splitTextToSize(
          value,
          pageWidth - margin * 2
        );

        const height = lines.length * spacing + 3;

        checkPage(height);

        pdf.text(lines, margin, y);
        y += height;
      };

      const divider = () => {
        checkPage(6);
        pdf.setDrawColor(218,225,231);
        pdf.line(margin,y,pageWidth-margin,y);
        y += 7;
      };

      const logo = await imageData(logoDigitale);

      // Preserva a proporção do logotipo.
      const img = new Image();
      img.src = logo;

      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(
          new Error('Falha ao carregar imagem do PDF.')
        );
      });

      const logoWidth = 51;
      const logoHeight =
        logoWidth * img.naturalHeight / img.naturalWidth;

      pdf.addImage(
        logo,'PNG',margin,y,
        logoWidth,Math.min(logoHeight,22)
      );

      y += Math.min(logoHeight,22) + 8;

      text('RELATÓRIO DE ATIVIDADES',16,true,8);
      divider();

      text(`Usuário: ${report.user.name}`,11,true);
      text(`Login: ${report.user.email}`);
      text(`Emissão: ${formatDate(report.generated_at)}`);
      text(`Tentativas registradas: ${report.attempts.length}`);
      text(`Sessões supervisionadas: ${report.sessions.length}`);
      divider();

      text('1. RESULTADOS DAS ATIVIDADES',12,true,7);

      if (!report.attempts.length) {
        text('Nenhuma tentativa concluída registrada.');
      }

      report.attempts.forEach((a,i) => {
        checkPage(25);
        text(`${i+1}. ${a.activity_title || 'Atividade'}`,10,true);
        text(`Treinamento: ${a.course_title || '—'}`);
        text(`Aula: ${a.lesson_title || '—'}`);
        text(`Data: ${formatDate(a.created_at)}`);
        text(
          `Nota: ${grade(a.score)} | ` +
          `${a.passed ? 'Aprovado' : 'Não aprovado'}`
        );
        divider();
      });

      text('2. ETAPAS E RESPOSTAS REGISTRADAS',12,true,7);

      if (!report.sessions.length) {
        text('Nenhuma sessão supervisionada registrada.');
      }

      report.sessions.forEach((s,i) => {
        checkPage(30);

        text(
          `${i+1}. ${s.activity_title || 'Avaliação'}`,
          11,true
        );

        text(`Treinamento: ${s.course_title || '—'}`);
        text(`Aula: ${s.lesson_title || '—'}`);
        text(`Início: ${formatDate(s.created_at)}`);
        text(`Situação: ${statusLabel(s.status)}`);
        text(`Perguntas registradas: ${s.answered_questions}`);
        text(`Nota: ${grade(s.score)}`);

        if (s.reason) text(`Motivo: ${s.reason}`);

        s.steps.forEach((step,index) => {
          checkPage(18);

          text(
            `Questão ${index+1}: ${step.question}`,
            9,true,4.5
          );

          let answer = 'Não registrada';

          if (step.answered) {
            answer = step.answer || 'Sem resposta';

            if (step.correct !== null) {
              answer += step.correct
                ? ' (correta)'
                : ' (incorreta)';
            }
          }

          text(`Resposta: ${answer}`,9,false,4.5);
        });

        divider();
      });

      text('3. HISTÓRICO DE OCORRÊNCIAS',12,true,7);

      if (!report.events.length) {
        text('Nenhuma ocorrência registrada.');
      }

      report.events.forEach((event,i) => {
        checkPage(16);

        text(
          `${i+1}. ${event.event_type.replace(/_/g,' ')}`,
          9,true
        );
        text(`Data: ${formatDate(event.created_at)}`,9);
        text(`Aula: ${event.lesson_title || '—'}`,9);

        if (event.details) {
          text(`Detalhes: ${event.details}`,9);
        }

        divider();
      });

      const totalPages = pdf.getNumberOfPages();

      for (let page=1; page<=totalPages; page++) {
        pdf.setPage(page);
        pdf.setFontSize(8);
        pdf.setTextColor(120,120,120);

        pdf.text(
          `Digitale Têxtil • Relatório de atividades • Página ${page}/${totalPages}`,
          margin,290
        );
      }

      const safeName = report.user.name
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g,'')
        .replace(/[^a-zA-Z0-9_-]+/g,'-')
        .slice(0,55);

      pdf.save(`Digitale-Atividades-${safeName}.pdf`);

    } catch (error: any) {
      setError(
        error.message || 'Não foi possível exportar o PDF.'
      );
    } finally {
      setExporting(false);
    }
  }

  return (
    <Card>
      <CardContent className="p-5 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            disabled={!userId || loading}
            onClick={() => {
              if (opened) {
                setOpened(false);
              } else {
                void load();
              }
            }}
            className="gap-2"
          >
            <ClipboardList className="h-4 w-4"/>
            {loading ? 'Carregando...' : 'Atividades'}
          </Button>

          {opened && report && (
            <Button
              type="button"
              variant="outline"
              disabled={exporting}
              onClick={() => void exportPDF()}
              className="gap-2"
            >
              <FileDown className="h-4 w-4"/>
              {exporting ? 'Gerando PDF...' : 'Exportar PDF'}
            </Button>
          )}
        </div>

        {error && (
          <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}

        {opened && report && (
          <div className="space-y-5">
            <div className="border-b pb-4">
              <h3 className="text-lg font-semibold">
                Atividades de {report.user.name}
              </h3>

              <p className="text-sm text-muted-foreground">
                Login: {report.user.email}
              </p>

              <p className="text-sm text-muted-foreground">
                {report.attempts.length} tentativas •{' '}
                {report.sessions.length} sessões •{' '}
                {report.events.length} ocorrências
              </p>
            </div>

            <div className="space-y-3">
              <h4 className="font-semibold">
                Resultados registrados
              </h4>

              {!report.attempts.length && (
                <p className="text-sm text-muted-foreground">
                  Nenhuma atividade concluída.
                </p>
              )}

              {report.attempts.map(a => (
                <div
                  key={a.id}
                  className="rounded-lg border p-4 space-y-1"
                >
                  <p className="font-semibold">
                    {a.activity_title || 'Atividade'}
                  </p>
                  <p className="text-sm">
                    {a.course_title} • {a.lesson_title}
                  </p>
                  <p className="text-sm">
                    {formatDate(a.created_at)}
                  </p>
                  <p className="text-sm">
                    Nota: <strong>{grade(a.score)}</strong> •{' '}
                    {a.passed ? 'Aprovado' : 'Não aprovado'}
                  </p>
                </div>
              ))}
            </div>

            <div className="space-y-3">
              <h4 className="font-semibold">
                Etapas das avaliações
              </h4>

              {!report.sessions.length && (
                <p className="text-sm text-muted-foreground">
                  Nenhuma sessão supervisionada registrada.
                </p>
              )}

              {report.sessions.map(s => (
                <details
                  key={s.id}
                  className="rounded-lg border p-4"
                >
                  <summary className="cursor-pointer font-semibold">
                    {s.activity_title || 'Avaliação'} —{' '}
                    {statusLabel(s.status)}
                  </summary>

                  <div className="mt-4 space-y-3 text-sm">
                    <p>Aula: {s.lesson_title || '—'}</p>
                    <p>Data: {formatDate(s.created_at)}</p>
                    <p>Nota: {grade(s.score)}</p>

                    {s.reason && (
                      <p>Motivo: {s.reason}</p>
                    )}

                    {s.steps.map((step,i) => (
                      <div
                        key={i}
                        className="rounded-lg bg-slate-50 p-3"
                      >
                        <p className="font-medium">
                          {i+1}. {step.question}
                        </p>

                        <p className="mt-1">
                          Resposta:{' '}
                          {!step.answered
                            ? 'Não registrada'
                            : step.answer || 'Sem resposta'}
                        </p>

                        {step.correct !== null && (
                          <p>
                            {step.correct
                              ? 'Resposta correta'
                              : 'Resposta incorreta'}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </details>
              ))}
            </div>

            <div className="space-y-2">
              <h4 className="font-semibold">
                Histórico de ocorrências
              </h4>

              {!report.events.length && (
                <p className="text-sm text-muted-foreground">
                  Nenhuma ocorrência registrada.
                </p>
              )}

              {report.events.map(e => (
                <div
                  key={e.id}
                  className="rounded-lg border p-3 text-sm"
                >
                  <p className="font-medium">
                    {e.event_type.replace(/_/g,' ')}
                  </p>
                  <p>{formatDate(e.created_at)}</p>
                  {e.details && <p>{e.details}</p>}
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
