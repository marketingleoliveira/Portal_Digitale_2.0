import { useEffect, useState } from "react";
import "./training-coming-soon-effects.css";
import DashboardLayout from "@/components/layouts/DashboardLayout";
import {
  GraduationCap,
  BookOpen,
  ClipboardCheck,
  Award,
  Sparkles,
  ArrowRight,
  LockKeyhole,
  PlayCircle,
} from "lucide-react";

// DIGITALE_TRAINING_NAVY_THEME_V1
// DIGITALE_TRAINING_JS_EFFECTS_V2
export default function TrainingComingSoon() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    if (reducedMotion) {
      setProgress(90);
      return;
    }

    let animationFrame = 0;
    let startTime: number | null = null;

    const animate = (timestamp: number) => {
      if (startTime === null) startTime = timestamp;

      const elapsed = Math.min(
        (timestamp - startTime) / 1600,
        1
      );

      const eased = 1 - Math.pow(1 - elapsed, 3);

      setProgress(Math.round(eased * 90));

      if (elapsed < 1) {
        animationFrame = requestAnimationFrame(animate);
      }
    };

    animationFrame = requestAnimationFrame(animate);

    return () => cancelAnimationFrame(animationFrame);
  }, []);

  const moveSpotlight = (
    event: React.MouseEvent<HTMLDivElement>
  ) => {
    const element = event.currentTarget;
    const rect = element.getBoundingClientRect();

    element.style.setProperty(
      "--training-x",
      `${event.clientX - rect.left}px`
    );

    element.style.setProperty(
      "--training-y",
      `${event.clientY - rect.top}px`
    );
  };


  const features = [
    {
      icon: BookOpen,
      title: "Aprenda",
      description:
        "Aulas e conteúdos pensados para o dia a dia comercial.",
    },
    {
      icon: ClipboardCheck,
      title: "Desafie-se",
      description:
        "Atividades e provas para colocar o conhecimento em prática.",
    },
    {
      icon: Award,
      title: "Conquiste",
      description:
        "Certificados que reconhecem cada etapa da sua evolução.",
    },
  ];

  return (
    <DashboardLayout>
      {/* DIGITALE_COMERCIAL_TREINAMENTO_V1 */}
      <div
          className="training-effects-page mx-auto w-full max-w-6xl px-1 pb-12 sm:px-4"
          onMouseMove={moveSpotlight}
        >
        <div className="mb-7 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#1F3147]">
              Comercial · Digitale Têxtil
            </p>
            <h1 className="mt-2 flex items-center gap-3 text-2xl font-semibold text-slate-800 sm:text-3xl">
              <GraduationCap className="h-7 w-7 text-[#1F3147]" />
              Treinamento
            </h1>
          </div>

          <span className="inline-flex items-center gap-2 rounded-full border border-[#CBD7E3] bg-[#EFF3F7] px-4 py-2 text-xs font-semibold text-[#1F3147]">
            <span className="h-2 w-2 animate-pulse rounded-full bg-[#EFF3F7]0" />
            Em desenvolvimento
          </span>
        </div>

        <section className="relative overflow-hidden rounded-[28px] border border-[#DCE4EC] bg-white shadow-sm">
          <div className="pointer-events-none absolute -right-20 -top-24 h-80 w-80 rounded-full bg-[#DCE7F2]/60 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-32 -left-20 h-72 w-72 rounded-full bg-[#F7F9FC] blur-3xl" />

          <div className="relative px-6 pb-12 pt-12 text-center sm:px-12 sm:pb-16 sm:pt-16">
            <div className="mx-auto mb-8 flex h-20 w-20 items-center justify-center rounded-3xl border border-[#CBD7E3] bg-[#EFF3F7] shadow-sm">
              <GraduationCap className="h-10 w-10 text-[#1F3147]" />
            </div>

            <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-[#EFF3F7] px-4 py-2 text-xs font-semibold uppercase tracking-widest text-[#1F3147]">
              <Sparkles className="h-4 w-4" />
              Uma novidade está chegando
            </div>

            <h2 className="training-animated-title mx-auto max-w-3xl text-3xl font-semibold leading-tight tracking-tight text-slate-900 sm:text-5xl">
              Prepare-se para
              <span className="block text-[#1F3147]">
                evoluir.
              </span>
            </h2>

            <p className="mx-auto mt-6 max-w-2xl text-base leading-8 text-slate-600 sm:text-lg">
              Estamos construindo um espaço exclusivo para
              o desenvolvimento do nosso time comercial.
              Uma nova forma de aprender, superar desafios
              e transformar conhecimento em resultados.
            </p>

            <div className="mx-auto mt-10 grid max-w-4xl grid-cols-1 gap-4 md:grid-cols-3">
              {features.map((feature) => {
                const Icon = feature.icon;

                return (
                  <div
                    key={feature.title}
                    className="training-animated-card rounded-2xl border border-slate-200 bg-white/90 p-6 text-left transition-all duration-300 hover:-translate-y-1 hover:border-[#CBD7E3] hover:shadow-lg"
                  >
                    <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-[#EFF3F7]">
                      <Icon className="h-6 w-6 text-[#1F3147]" />
                    </div>

                    <h3 className="text-lg font-semibold text-slate-800">
                      {feature.title}
                    </h3>

                    <p className="mt-2 text-sm leading-6 text-slate-500">
                      {feature.description}
                    </p>
                  </div>
                );
              })}
            </div>

            <div className="mx-auto mt-12 max-w-3xl rounded-2xl border border-[#DCE4EC] bg-gradient-to-r from-[#EFF3F7] to-[#F7F9FC] p-6 sm:p-8">
              <div className="flex flex-col items-center gap-4">
                <div className="flex items-center gap-3 text-[#1F3147]">
                  <PlayCircle className="h-5 w-5" />
                  <ArrowRight className="h-4 w-4" />
                  <ClipboardCheck className="h-5 w-5" />
                  <ArrowRight className="h-4 w-4" />
                  <Award className="h-5 w-5" />
                </div>

                <h3 className="text-xl font-semibold text-slate-800">
                  Cada conquista começa com um novo aprendizado.
                </h3>

                <p className="max-w-xl text-sm leading-7 text-slate-600">
                  Em breve, você poderá participar de treinamentos,
                  realizar atividades, testar seus conhecimentos
                  e conquistar certificados de conclusão.
                </p>
              </div>
            </div>

            
            {/* DIGITALE_TRAINING_PROGRESS_90_V2 */}
            <div className="mx-auto mt-10 w-full max-w-2xl rounded-2xl border border-[#DCE4EC] bg-[#F7F9FC] p-6">

              <div className="mb-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <GraduationCap className="h-5 w-5 text-[#1F3147]" />
                  <span className="text-sm font-semibold text-[#1F3147]">
                    Desenvolvimento da plataforma
                  </span>
                </div>

                <span className="text-xl font-bold text-[#1F3147]">
                  {progress}%
                </span>
              </div>

              <div
                role="progressbar"
                aria-label="Progresso do desenvolvimento"
                aria-valuenow={progress}
                aria-valuemin={0}
                aria-valuemax={100}
                className="h-3 w-full overflow-hidden rounded-full bg-[#E5EAF0]"
              >
                <div
                  className="h-full rounded-full bg-[#1F3147]"
                  style={{ width: `${progress}%` }}
                />
              </div>

              <p className="mt-3 text-center text-xs text-slate-500">
                Estamos preparando uma nova experiência de aprendizado para você.
              </p>

            </div>

<div className="mt-12 flex flex-col items-center gap-3">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <LockKeyhole className="h-4 w-4 text-[#1F3147]" />
                Estamos preparando tudo para você.
              </div>

              <p className="max-w-lg text-sm leading-6 text-slate-500">
                A plataforma ainda está em desenvolvimento.
                Fique de olho nas novidades do Portal Digitale.
              </p>
            </div>
          </div>
        </section>
      </div>
    </DashboardLayout>
  );
}
