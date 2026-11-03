import {
  ArrowRight,
  Bot,
  BookOpenCheck,
  CheckCircle2,
  Globe2,
  MessageCircle,
  ShieldAlert,
  Target,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";


export function AgendorLeadGuide() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          className="
            relative
            gap-2
            border-red-600
            bg-red-600
            font-semibold
            text-white
            shadow-md
            shadow-red-500/40
            animate-pulse
            hover:border-red-700
            hover:bg-red-700
            hover:text-white
          "
        >
          <span className="relative flex h-2.5 w-2.5">
            <span className="
              absolute
              inline-flex
              h-full
              w-full
              animate-ping
              rounded-full
              bg-white
              opacity-75
            " />

            <span className="
              relative
              inline-flex
              h-2.5
              w-2.5
              rounded-full
              bg-white
            " />
          </span>

          <BookOpenCheck className="h-4 w-4" />

          Como abordar leads
        </Button>
      </DialogTrigger>

      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <BookOpenCheck className="h-5 w-5" />
            Guia de abordagem dos leads
          </DialogTitle>

          <DialogDescription>
            Antes de entrar em contato, confira a origem indicada
            no card. SITE e IA exigem abordagens diferentes.
          </DialogDescription>
        </DialogHeader>


        <div className="mt-2 grid gap-5 lg:grid-cols-2">

          {/* ==================================================
              LEAD SITE
          ================================================== */}

          <div className="
            overflow-hidden
            rounded-xl
            border
            border-green-200
            bg-green-50/60
            dark:border-green-900
            dark:bg-green-950/20
          ">
            <div className="
              flex
              items-center
              justify-between
              gap-3
              border-b
              border-green-200
              bg-green-100/70
              p-4
              dark:border-green-900
              dark:bg-green-950/40
            ">
              <div className="flex items-center gap-3">
                <div className="
                  flex
                  h-10
                  w-10
                  items-center
                  justify-center
                  rounded-full
                  bg-green-600
                  text-white
                ">
                  <Globe2 className="h-5 w-5" />
                </div>

                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">
                      Lead do SITE
                    </h3>

                    <Badge className="
                      border-0
                      bg-green-600
                      font-bold
                      text-white
                      hover:bg-green-600
                    ">
                      SITE
                    </Badge>
                  </div>

                  <p className="mt-0.5 text-xs text-green-800 dark:text-green-300">
                    Interesse de compra já demonstrado
                  </p>
                </div>
              </div>
            </div>


            <div className="space-y-5 p-5">

              <div>
                <p className="
                  mb-2
                  flex
                  items-center
                  gap-2
                  text-sm
                  font-semibold
                ">
                  <Target className="h-4 w-4 text-green-600" />
                  Tipo de abordagem
                </p>

                <div className="
                  rounded-lg
                  border
                  border-green-200
                  bg-background
                  p-4
                  dark:border-green-900
                ">
                  <p className="font-semibold text-green-700 dark:text-green-400">
                    ABORDAGEM DIRETA
                  </p>

                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    Esse cliente chegou pelo site e já demonstrou
                    interesse nos produtos da Digitale.
                  </p>

                  <p className="mt-2 text-sm leading-relaxed">
                    Não é necessário começar apresentando a empresa
                    do zero. Vá direto para a necessidade comercial.
                  </p>
                </div>
              </div>


              <div>
                <p className="mb-3 text-sm font-semibold">
                  O que descobrir
                </p>

                <div className="space-y-2 text-sm">
                  <div className="flex gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                    <span>
                      Qual tecido ou produto está procurando.
                    </span>
                  </div>

                  <div className="flex gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                    <span>
                      Para qual tipo de peça será utilizado.
                    </span>
                  </div>

                  <div className="flex gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                    <span>
                      Quantidade ou volume pretendido.
                    </span>
                  </div>

                  <div className="flex gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                    <span>
                      Prazo e necessidade atual.
                    </span>
                  </div>

                  <div className="flex gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                    <span>
                      Se já podemos avançar para amostra,
                      indicação de tecido ou orçamento.
                    </span>
                  </div>
                </div>
              </div>


              <div>
                <p className="
                  mb-2
                  flex
                  items-center
                  gap-2
                  text-sm
                  font-semibold
                ">
                  <MessageCircle className="h-4 w-4" />
                  Exemplo de primeira abordagem
                </p>

                <div className="
                  rounded-lg
                  border
                  bg-background
                  p-4
                  text-sm
                  leading-relaxed
                ">
                  “Olá, <strong>[nome]</strong>! Aqui é
                  {" "}
                  <strong>[seu nome]</strong> da Digitale Têxtil.
                  Vi que você demonstrou interesse em nossos tecidos
                  pelo site e estou entrando em contato para te
                  atender. Queria entender melhor o que você procura
                  para te indicar as opções mais adequadas.
                  Para qual tipo de peça você busca tecido hoje?”
                </div>
              </div>


              <div className="
                flex
                gap-3
                rounded-lg
                border
                border-amber-200
                bg-amber-50
                p-3
                text-sm
                dark:border-amber-900
                dark:bg-amber-950/20
              ">
                <ShieldAlert className="
                  mt-0.5
                  h-4
                  w-4
                  shrink-0
                  text-amber-600
                " />

                <div>
                  <strong>Evite:</strong>{" "}
                  fazer uma apresentação longa e genérica da Digitale
                  antes de entender o que o cliente já está buscando.
                </div>
              </div>
            </div>
          </div>


          {/* ==================================================
              LEAD IA
          ================================================== */}

          <div className="
            overflow-hidden
            rounded-xl
            border
            border-violet-200
            bg-violet-50/60
            dark:border-violet-900
            dark:bg-violet-950/20
          ">
            <div className="
              flex
              items-center
              justify-between
              gap-3
              border-b
              border-violet-200
              bg-violet-100/70
              p-4
              dark:border-violet-900
              dark:bg-violet-950/40
            ">
              <div className="flex items-center gap-3">
                <div className="
                  flex
                  h-10
                  w-10
                  items-center
                  justify-center
                  rounded-full
                  bg-violet-600
                  text-white
                ">
                  <Bot className="h-5 w-5" />
                </div>

                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">
                      Lead prospectado pela IA
                    </h3>

                    <Badge className="
                      border-0
                      bg-violet-600
                      font-bold
                      text-white
                      hover:bg-violet-600
                    ">
                      IA
                    </Badge>
                  </div>

                  <p className="mt-0.5 text-xs text-violet-800 dark:text-violet-300">
                    Prospecção ativa
                  </p>
                </div>
              </div>
            </div>


            <div className="space-y-5 p-5">

              <div>
                <p className="
                  mb-2
                  flex
                  items-center
                  gap-2
                  text-sm
                  font-semibold
                ">
                  <Target className="h-4 w-4 text-violet-600" />
                  Tipo de abordagem
                </p>

                <div className="
                  rounded-lg
                  border
                  border-violet-200
                  bg-background
                  p-4
                  dark:border-violet-900
                ">
                  <p className="font-semibold text-violet-700 dark:text-violet-400">
                    ABORDAGEM DE APRESENTAÇÃO
                  </p>

                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    Esse cliente foi encontrado e prospectado pela IA.
                  </p>

                  <p className="mt-2 text-sm leading-relaxed">
                    Ele pode não conhecer a Digitale e não devemos
                    presumir que já compra conosco ou que demonstrou
                    interesse anteriormente.
                  </p>
                </div>
              </div>


              <div>
                <p className="mb-3 text-sm font-semibold">
                  Objetivo do primeiro contato
                </p>

                <div className="space-y-2 text-sm">
                  <div className="flex gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-violet-600" />
                    <span>
                      Apresentar brevemente a Digitale Têxtil.
                    </span>
                  </div>

                  <div className="flex gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-violet-600" />
                    <span>
                      Explicar por que a empresa foi contatada.
                    </span>
                  </div>

                  <div className="flex gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-violet-600" />
                    <span>
                      Entender se a empresa compra tecidos.
                    </span>
                  </div>

                  <div className="flex gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-violet-600" />
                    <span>
                      Identificar linha de produtos, produção e
                      necessidades atuais.
                    </span>
                  </div>

                  <div className="flex gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-violet-600" />
                    <span>
                      Criar abertura para apresentar tecidos e
                      diferenciais relevantes.
                    </span>
                  </div>
                </div>
              </div>


              <div>
                <p className="
                  mb-2
                  flex
                  items-center
                  gap-2
                  text-sm
                  font-semibold
                ">
                  <MessageCircle className="h-4 w-4" />
                  Exemplo de primeira abordagem
                </p>

                <div className="
                  rounded-lg
                  border
                  bg-background
                  p-4
                  text-sm
                  leading-relaxed
                ">
                  “Olá, <strong>[nome]</strong>! Tudo bem?
                  Sou <strong>[seu nome]</strong> da Digitale Têxtil.
                  Conhecemos a <strong>[empresa]</strong> durante
                  nosso mapeamento de marcas do segmento e achei
                  interessante me apresentar. A Digitale trabalha
                  com tecidos para moda fitness, esportiva e praia.
                  Queria entender um pouco de como vocês trabalham
                  hoje com tecidos para ver se faz sentido te
                  apresentar algumas opções.”
                </div>
              </div>


              <div className="
                flex
                gap-3
                rounded-lg
                border
                border-red-200
                bg-red-50
                p-3
                text-sm
                dark:border-red-900
                dark:bg-red-950/20
              ">
                <ShieldAlert className="
                  mt-0.5
                  h-4
                  w-4
                  shrink-0
                  text-red-600
                " />

                <div>
                  <strong>Não diga:</strong>{" "}
                  “Vi que você demonstrou interesse”,
                  “Vi sua solicitação” ou qualquer frase que dê a
                  entender que o cliente entrou em contato antes.
                </div>
              </div>
            </div>
          </div>
        </div>


        {/* RESUMO RÁPIDO */}

        <div className="
          mt-1
          rounded-xl
          border
          bg-muted/30
          p-4
        ">
          <p className="mb-3 text-sm font-semibold">
            Regra rápida
          </p>

          <div className="
            grid
            gap-3
            text-sm
            sm:grid-cols-[1fr_auto_1fr]
            sm:items-center
          ">
            <div className="
              flex
              items-center
              gap-3
              rounded-lg
              bg-green-50
              p-3
              dark:bg-green-950/20
            ">
              <Badge className="
                bg-green-600
                text-white
                hover:bg-green-600
              ">
                SITE
              </Badge>

              <span>
                Já demonstrou interesse
                <strong> → abordagem direta</strong>
              </span>
            </div>

            <ArrowRight className="
              hidden
              h-4
              w-4
              text-muted-foreground
              sm:block
            " />

            <div className="
              flex
              items-center
              gap-3
              rounded-lg
              bg-violet-50
              p-3
              dark:bg-violet-950/20
            ">
              <Badge className="
                bg-violet-600
                text-white
                hover:bg-violet-600
              ">
                IA
              </Badge>

              <span>
                Ainda não demonstrou interesse
                <strong> → apresentação primeiro</strong>
              </span>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
