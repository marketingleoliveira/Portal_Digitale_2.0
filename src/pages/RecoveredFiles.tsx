import React, { useEffect, useMemo, useState } from 'react';
import DashboardLayout from '@/components/layouts/DashboardLayout';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  ArchiveRestore,
  ExternalLink,
  HardDrive,
  Loader2,
  LockKeyhole,
  Search,
} from 'lucide-react';
import { toast } from 'sonner';

interface RecoveredFile {
  bucket: string;
  path: string;
  name: string;
  size: number;
  updated_at: string;
  private: boolean;
  url: string;
}

interface CatalogResponse {
  data: RecoveredFile[];
  summary: Record<string, { files: number; bytes: number }>;
  total: number;
  error: { message: string } | null;
}

const BUCKET_LABELS: Record<string, string> = {
  avatars: 'Avatares',
  files: 'Arquivos',
  'price-files': 'Tabelas de preços',
  'meeting-recordings': 'Gravações',
  'testimonial-files': 'Depoimentos',
  'marketing-requests': 'Marketing',
  reembolsos: 'Reembolsos',
  'ticket-attachments': 'Anexos de chamados',
  'creation-files': 'Material de criação',
  'notification-images': 'Imagens de notificações',
};

function formatBytes(bytes: number) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index++;
  }
  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}
const RecoveredFiles: React.FC = () => {
  const { session } = useAuth();
  const [files, setFiles] = useState<RecoveredFile[]>([]);
  const [summary, setSummary] = useState<CatalogResponse['summary']>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [bucket, setBucket] = useState('all');

  const loadCatalog = async () => {
    const token = session?.access_token;
    if (!token) return;

    setLoading(true);

    try {
      const response = await fetch('/api/storage/catalog', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const result = (await response.json()) as CatalogResponse;

      if (!response.ok || result.error) {
        throw new Error(result.error?.message || 'Erro ao carregar arquivos');
      }

      setFiles(result.data || []);
      setSummary(result.summary || {});
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Erro ao carregar arquivos recuperados'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (session?.access_token) {
      void loadCatalog();
    }
  }, [session?.access_token]);

  const bucketOptions = useMemo(
    () => Object.keys(summary).sort(),
    [summary]
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();

    return files.filter((file) => {
      if (bucket !== 'all' && file.bucket !== bucket) {
        return false;
      }

      if (!term) return true;

      return (
        file.name.toLowerCase().includes(term) ||
        file.path.toLowerCase().includes(term) ||
        file.bucket.toLowerCase().includes(term) ||
        (BUCKET_LABELS[file.bucket] || '').toLowerCase().includes(term)
      );
    });
  }, [files, search, bucket]);

  const totalBytes = useMemo(
    () => files.reduce((sum, file) => sum + Number(file.size || 0), 0),
    [files]
  );
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Arquivos Recuperados
          </h1>
          <p className="text-sm text-muted-foreground">
            Uploads restaurados do backup antigo e armazenados localmente no Portal.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Arquivos recuperados
              </CardTitle>
            </CardHeader>
            <CardContent className="flex items-center gap-3">
              <ArchiveRestore className="h-5 w-5" />
              <span className="text-2xl font-semibold">{files.length}</span>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Espaço restaurado
              </CardTitle>
            </CardHeader>
            <CardContent className="flex items-center gap-3">
              <HardDrive className="h-5 w-5" />
              <span className="text-2xl font-semibold">
                {formatBytes(totalBytes)}
              </span>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Buckets
              </CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">
              {bucketOptions.length}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col gap-3 md:flex-row">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar por nome, caminho ou bucket..."
                  className="pl-9"
                />
              </div>

              <Select value={bucket} onValueChange={setBucket}>
                <SelectTrigger className="w-full md:w-[240px]">
                  <SelectValue placeholder="Todos os buckets" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os buckets</SelectItem>
                  {bucketOptions.map((item) => (
                    <SelectItem key={item} value={item}>
                      {BUCKET_LABELS[item] || item} ({summary[item]?.files || 0})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button variant="outline" onClick={() => void loadCatalog()}>
                Atualizar
              </Button>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex min-h-[320px] items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Arquivo</TableHead>
                      <TableHead>Origem</TableHead>
                      <TableHead>Caminho</TableHead>
                      <TableHead className="text-right">Tamanho</TableHead>
                      <TableHead>Privacidade</TableHead>
                      <TableHead className="w-[90px] text-right">Abrir</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((file) => (
                      <TableRow key={`${file.bucket}/${file.path}`}>
                        <TableCell className="font-medium max-w-[260px] truncate">
                          {file.name}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">
                            {BUCKET_LABELS[file.bucket] || file.bucket}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-[360px] truncate text-xs text-muted-foreground">
                          {file.path}
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          {formatBytes(file.size)}
                        </TableCell>
                        <TableCell>
                          {file.private ? (
                            <span className="inline-flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400">
                              <LockKeyhole className="h-3.5 w-3.5" />
                              Privado
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              Interno
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => window.open(file.url, '_blank', 'noopener,noreferrer')}
                            aria-label={`Abrir ${file.name}`}
                          >
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}

                    {!filtered.length && (
                      <TableRow>
                        <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                          Nenhum arquivo encontrado.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground">
          Arquivos de reembolso são privados e recebem uma URL assinada temporária somente para usuários autorizados.
        </p>
      </div>
    </DashboardLayout>
  );
};

export default RecoveredFiles;
