import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/local/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Clock, Coffee, LogIn, LogOut, Sun, Moon, ArrowLeft, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

type PunchType = 'entry' | 'lunch_exit' | 'lunch_return' | 'exit';

interface TimeRecord {
  id: string;
  user_id: string;
  record_date: string;
  entry_time: string | null;
  lunch_exit_time: string | null;
  lunch_return_time: string | null;
  exit_time: string | null;
}

const punchConfig: Record<PunchType, { label: string; icon: React.ReactNode; expectedHour: number; expectedMinute: number; column: keyof TimeRecord }> = {
  entry: { label: "Entrada", icon: <LogIn className="h-6 w-6" />, expectedHour: 8, expectedMinute: 0, column: 'entry_time' },
  lunch_exit: { label: "Saída Almoço", icon: <Coffee className="h-6 w-6" />, expectedHour: 12, expectedMinute: 0, column: 'lunch_exit_time' },
  lunch_return: { label: "Retorno Almoço", icon: <Sun className="h-6 w-6" />, expectedHour: 13, expectedMinute: 0, column: 'lunch_return_time' },
  exit: { label: "Saída", icon: <LogOut className="h-6 w-6" />, expectedHour: 18, expectedMinute: 0, column: 'exit_time' },
};

const MINUTES_BEFORE_ALLOWED = 10;

export default function TimeClock() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [todayRecord, setTodayRecord] = useState<TimeRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (user) {
      fetchTodayRecord();
    }
  }, [user]);

  const fetchTodayRecord = async () => {
    if (!user) return;

    const today = format(new Date(), 'yyyy-MM-dd');
    
    const { data, error } = await supabase
      .from('time_records')
      .select('*')
      .eq('user_id', user.id)
      .eq('record_date', today)
      .maybeSingle();

    if (error) {
      console.error('Error fetching time record:', error);
    } else {
      setTodayRecord(data);
    }
    setLoading(false);
  };

  const handlePunch = async (type: PunchType) => {
    if (!user) return;

    const now = new Date().toISOString();
    const today = format(new Date(), 'yyyy-MM-dd');
    const column = punchConfig[type].column;

    try {
      if (todayRecord) {
        const { error } = await supabase
          .from('time_records')
          .update({ [column]: now })
          .eq('id', todayRecord.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('time_records')
          .insert({
            user_id: user.id,
            record_date: today,
            [column]: now,
          });

        if (error) throw error;
      }

      toast.success(`${punchConfig[type].label} registrada com sucesso!`);
      fetchTodayRecord();
    } catch (error: any) {
      console.error('Error punching:', error);
      toast.error(`Erro ao registrar ${punchConfig[type].label.toLowerCase()}`);
    }
  };

  const getNextPunch = (): PunchType | null => {
    if (!todayRecord?.entry_time) return 'entry';
    if (!todayRecord?.lunch_exit_time) return 'lunch_exit';
    if (!todayRecord?.lunch_return_time) return 'lunch_return';
    if (!todayRecord?.exit_time) return 'exit';
    return null;
  };

  const isPunchAllowed = (type: PunchType): boolean => {
    const config = punchConfig[type];
    const now = currentTime;
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    
    const currentTotalMinutes = currentHour * 60 + currentMinute;
    const expectedTotalMinutes = config.expectedHour * 60 + config.expectedMinute;
    const allowedFromMinutes = expectedTotalMinutes - MINUTES_BEFORE_ALLOWED;
    
    return currentTotalMinutes >= allowedFromMinutes;
  };

  const getTimeUntilAllowed = (type: PunchType): string => {
    const config = punchConfig[type];
    const now = currentTime;
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    
    const currentTotalMinutes = currentHour * 60 + currentMinute;
    const expectedTotalMinutes = config.expectedHour * 60 + config.expectedMinute;
    const allowedFromMinutes = expectedTotalMinutes - MINUTES_BEFORE_ALLOWED;
    
    const minutesLeft = allowedFromMinutes - currentTotalMinutes;
    
    if (minutesLeft <= 0) return '';
    
    const hours = Math.floor(minutesLeft / 60);
    const minutes = minutesLeft % 60;
    
    if (hours > 0) {
      return `em ${hours}h ${minutes}min`;
    }
    return `em ${minutes}min`;
  };

  const formatTime = (time: string | null) => {
    if (!time) return '--:--';
    return format(new Date(time), 'HH:mm');
  };

  const getPunchesCompleted = (): number => {
    let count = 0;
    if (todayRecord?.entry_time) count++;
    if (todayRecord?.lunch_exit_time) count++;
    if (todayRecord?.lunch_return_time) count++;
    if (todayRecord?.exit_time) count++;
    return count;
  };

  const nextPunch = getNextPunch();
  const punchesCompleted = getPunchesCompleted();
  const progressPercent = (punchesCompleted / 4) * 100;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 items-center gap-4 px-4 md:px-6">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => navigate('/dashboard')}
            className="shrink-0"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-xl font-bold">Ponto Eletrônico</h1>
            <p className="text-sm text-muted-foreground">
              Registre sua presença
            </p>
          </div>
          <div className="hidden sm:flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="h-4 w-4" />
            {format(currentTime, "dd 'de' MMMM", { locale: ptBR })}
          </div>
        </div>
      </header>

      <main className="container px-4 md:px-6 py-8 space-y-8 max-w-5xl mx-auto">
        {/* Time Display Card */}
        <Card className="overflow-hidden border-0 shadow-xl bg-gradient-to-br from-primary to-primary/80">
          <CardContent className="p-8 md:p-12">
            <div className="flex flex-col items-center text-primary-foreground">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 rounded-full bg-primary-foreground/10 backdrop-blur">
                  <Clock className="h-8 w-8" />
                </div>
              </div>
              <p className="text-7xl md:text-8xl font-bold font-mono tracking-tight">
                {format(currentTime, 'HH:mm')}
              </p>
              <p className="text-2xl font-mono text-primary-foreground/70 mt-1">
                {format(currentTime, 'ss')}
              </p>
              <p className="text-lg text-primary-foreground/80 mt-4 capitalize">
                {format(currentTime, "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Progress Indicator */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-muted-foreground">Progresso do dia</span>
              <span className="text-sm font-bold">{punchesCompleted}/4 pontos</span>
            </div>
            <div className="w-full h-3 bg-muted rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-primary to-primary/70 transition-all duration-500 rounded-full"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </CardContent>
        </Card>

        {/* Punch Buttons Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {(Object.keys(punchConfig) as PunchType[]).map((type) => {
            const config = punchConfig[type];
            const time = todayRecord?.[config.column as keyof TimeRecord] as string | null;
            const isPunched = !!time;
            const isNext = nextPunch === type;
            const isAllowed = isPunchAllowed(type);
            const timeUntilAllowed = getTimeUntilAllowed(type);

            return (
              <Card 
                key={type} 
                className={`transition-all duration-300 overflow-hidden ${
                  isNext && isAllowed ? 'ring-2 ring-primary shadow-lg shadow-primary/20' : ''
                } ${isPunched ? 'bg-muted/30' : ''}`}
              >
                <CardContent className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className={`p-3 rounded-xl ${
                      isPunched 
                        ? 'bg-green-500/10 text-green-600 dark:text-green-400' 
                        : isNext && isAllowed
                          ? 'bg-primary/10 text-primary'
                          : 'bg-muted text-muted-foreground'
                    }`}>
                      {config.icon}
                    </div>
                    <Badge 
                      variant={isPunched ? "default" : "outline"} 
                      className={`font-mono ${isPunched ? 'bg-green-500 hover:bg-green-500' : ''}`}
                    >
                      {isPunched ? (
                        <span className="flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3" />
                          Registrado
                        </span>
                      ) : (
                        `${config.expectedHour}:${String(config.expectedMinute).padStart(2, '0')}`
                      )}
                    </Badge>
                  </div>
                  
                  <h3 className="font-semibold text-lg mb-1">{config.label}</h3>
                  
                  <p className="text-4xl font-mono font-bold text-center my-4">
                    {formatTime(time)}
                  </p>

                  {!isPunched && !isAllowed && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3 justify-center">
                      <AlertCircle className="h-4 w-4" />
                      <span>Liberado {timeUntilAllowed}</span>
                    </div>
                  )}
                  
                  <Button
                    onClick={() => handlePunch(type)}
                    disabled={isPunched || !isAllowed}
                    className={`w-full h-12 text-base font-medium transition-all ${
                      isNext && isAllowed 
                        ? 'bg-primary hover:bg-primary/90 shadow-lg' 
                        : ''
                    }`}
                    variant={isPunched ? "secondary" : isNext && isAllowed ? "default" : "outline"}
                  >
                    {isPunched ? (
                      <span className="flex items-center gap-2">
                        <CheckCircle2 className="h-5 w-5" />
                        Ponto Registrado
                      </span>
                    ) : !isAllowed ? (
                      'Aguardando horário'
                    ) : (
                      'Bater Ponto'
                    )}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Status Summary */}
        {todayRecord && (
          <Card className="border-0 shadow-lg bg-gradient-to-br from-muted/50 to-muted/30">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Moon className="h-5 w-5 text-primary" />
                Resumo do Dia
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                {(Object.keys(punchConfig) as PunchType[]).map((type) => {
                  const config = punchConfig[type];
                  const time = todayRecord?.[config.column as keyof TimeRecord] as string | null;
                  
                  return (
                    <div key={type} className="text-center">
                      <div className={`inline-flex p-2 rounded-lg mb-2 ${
                        time ? 'bg-green-500/10' : 'bg-muted'
                      }`}>
                        <span className={time ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}>
                          {config.icon}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mb-1">{config.label}</p>
                      <p className={`text-xl font-mono font-bold ${
                        time ? 'text-foreground' : 'text-muted-foreground'
                      }`}>
                        {formatTime(time)}
                      </p>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* All Punches Complete Message */}
        {nextPunch === null && (
          <Card className="border-green-500/20 bg-green-500/5">
            <CardContent className="py-8">
              <div className="flex flex-col items-center text-center">
                <div className="p-4 rounded-full bg-green-500/10 mb-4">
                  <CheckCircle2 className="h-10 w-10 text-green-600 dark:text-green-400" />
                </div>
                <h3 className="text-xl font-semibold text-green-700 dark:text-green-400 mb-2">
                  Jornada Completa!
                </h3>
                <p className="text-muted-foreground">
                  Todos os pontos do dia foram registrados com sucesso.
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
