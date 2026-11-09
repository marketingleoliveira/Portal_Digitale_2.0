import { useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import DashboardLayout from '@/components/layouts/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { BookOpen, Plus, Pencil, Trash2, ExternalLink, X } from 'lucide-react';
import { toast } from 'sonner';

type Training = {
  id: string;
  title: string;
  category: string;
  description: string;
  content: string;
  material_url: string;
  is_published: number;
  created_at: string;
};

const emptyForm = {
  title: '',
  category: 'Geral',
  description: '',
  content: '',
  material_url: '',
  is_published: false,
};

export default function Treinamentos() {
  const { realRole, session } = useAuth();
  const [items, setItems] = useState<Training[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const token = (session as any)?.access_token ||
                (session as any)?.accessToken;

  const request = useCallback(async (
    method: string,
    path = '',
    body?: unknown
  ) => {
    const response = await fetch('/api/treinamentos' + path, {
      method,
      headers: {
        Authorization: `Bearer ${token || ''}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(json?.error?.message || 'Erro na operação');
    }
    return json;
  }, [token]);

  const load = useCallback(async () => {
    if (realRole !== 'dev' || !token) return;
    try {
      const result = await request('GET');
      setItems(result.data || []);
    } catch (error: any) {
      toast.error(error.message || 'Erro ao carregar treinamentos');
    } finally {
      setLoading(false);
    }
  }, [realRole, token, request]);

  useEffect(() => { void load(); }, [load]);

  if (realRole !== 'dev') {
    return <Navigate to="/dashboard" replace />;
  }

  const reset = () => {
    setForm(emptyForm);
    setEditing(null);
    setOpen(false);
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.title.trim()) return toast.error('Informe o título');
    setBusy(true);
    try {
      await request(
        editing ? 'PUT' : 'POST',
        editing ? '/' + encodeURIComponent(editing) : '',
        form
      );
      toast.success(editing ? 'Treinamento atualizado' : 'Treinamento criado');
      reset();
      await load();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  };

  const edit = (item: Training) => {
    setEditing(item.id);
    setForm({
      title: item.title,
      category: item.category,
      description: item.description || '',
      content: item.content || '',
      material_url: item.material_url || '',
      is_published: Boolean(item.is_published),
    });
    setOpen(true);
  };

  const remove = async (item: Training) => {
    if (!window.confirm(`Excluir o treinamento "${item.title}"?`)) return;
    try {
      await request('DELETE', '/' + encodeURIComponent(item.id));
      toast.success('Treinamento excluído');
      await load();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const filtered = items.filter(item =>
    (item.title + ' ' + item.category + ' ' + item.description)
      .toLowerCase().includes(search.toLowerCase())
  );

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-6xl mx-auto">
        <div className="flex flex-wrap gap-3 justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold flex gap-2 items-center">
              <BookOpen className="w-6 h-6 text-primary" />
              Treinamentos
            </h1>
            <p className="text-muted-foreground mt-1">
              Organize conteúdos, vídeos e materiais de capacitação.
            </p>
          </div>
          <Button onClick={() => { reset(); setOpen(true); }}>
            <Plus className="w-4 h-4 mr-2" />
            Novo treinamento
          </Button>
        </div>

        {open && (
          <Card>
            <CardHeader className="flex flex-row justify-between items-center">
              <CardTitle>
                {editing ? 'Editar treinamento' : 'Novo treinamento'}
              </CardTitle>
              <Button variant="ghost" size="icon" onClick={reset}>
                <X className="w-4 h-4" />
              </Button>
            </CardHeader>
            <CardContent>
              <form className="space-y-4" onSubmit={save}>
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Título *</Label>
                    <Input
                      value={form.title}
                      maxLength={180}
                      onChange={e => setForm({ ...form, title: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Categoria</Label>
                    <Input
                      value={form.category}
                      maxLength={80}
                      placeholder="Ex.: Comercial, Sistemas, Atendimento"
                      onChange={e => setForm({ ...form, category: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Descrição</Label>
                  <Textarea
                    value={form.description}
                    maxLength={5000}
                    onChange={e => setForm({ ...form, description: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Conteúdo do treinamento</Label>
                  <Textarea
                    rows={8}
                    value={form.content}
                    onChange={e => setForm({ ...form, content: e.target.value })}
                    placeholder="Instruções, etapas, orientações..."
                  />
                </div>
                <div className="space-y-2">
                  <Label>Link de vídeo ou material</Label>
                  <Input
                    type="url"
                    value={form.material_url}
                    placeholder="https://..."
                    onChange={e => setForm({ ...form, material_url: e.target.value })}
                  />
                </div>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.is_published}
                    onChange={e => setForm({ ...form, is_published: e.target.checked })}
                  />
                  Marcar como publicado
                </label>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={reset}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={busy}>
                    {busy ? 'Salvando...' : 'Salvar treinamento'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        <Input
          placeholder="Pesquisar treinamentos..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />

        {loading ? (
          <p className="text-muted-foreground">Carregando treinamentos...</p>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              Nenhum treinamento encontrado.
            </CardContent>
          </Card>
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            {filtered.map(item => (
              <Card key={item.id}>
                <CardHeader>
                  <div className="flex flex-wrap justify-between gap-2">
                    <Badge variant="outline">{item.category}</Badge>
                    <Badge variant={item.is_published ? 'default' : 'secondary'}>
                      {item.is_published ? 'Publicado' : 'Rascunho'}
                    </Badge>
                  </div>
                  <CardTitle className="text-lg">{item.title}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {item.description && (
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                      {item.description}
                    </p>
                  )}
                  {item.content && (
                    <div className="text-sm whitespace-pre-wrap border-t pt-3 max-h-80 overflow-y-auto">
                      {item.content}
                    </div>
                  )}
                  {item.material_url && (
                    <a
                      href={item.material_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary flex items-center gap-1 text-sm underline"
                    >
                      Abrir material <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                  <div className="flex gap-2 pt-2">
                    <Button variant="outline" size="sm" onClick={() => edit(item)}>
                      <Pencil className="w-4 h-4 mr-1" /> Editar
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => void remove(item)}
                    >
                      <Trash2 className="w-4 h-4 mr-1" /> Excluir
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
