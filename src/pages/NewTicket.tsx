import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '@/components/layouts/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/local/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { TicketIcon, ArrowLeft, Loader2, Send, Paperclip, X, FileText, Image, Video, Link } from 'lucide-react';

interface AttachmentPreview {
  file: File;
  preview: string;
  type: 'image' | 'video' | 'file';
}

const NewTicket: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [attachments, setAttachments] = useState<AttachmentPreview[]>([]);
  const [linkInput, setLinkInput] = useState('');
  const [links, setLinks] = useState<string[]>([]);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    category: 'suporte',
    priority: 'normal',
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const newAttachments: AttachmentPreview[] = [];
    
    Array.from(files).forEach((file) => {
      const type = file.type.startsWith('image/') 
        ? 'image' 
        : file.type.startsWith('video/') 
          ? 'video' 
          : 'file';
      
      newAttachments.push({
        file,
        preview: type === 'image' ? URL.createObjectURL(file) : '',
        type,
      });
    });

    setAttachments(prev => [...prev, ...newAttachments]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const addLink = () => {
    if (!linkInput.trim()) return;
    
    let url = linkInput.trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }
    
    setLinks(prev => [...prev, url]);
    setLinkInput('');
  };

  const removeLink = (index: number) => {
    setLinks(prev => prev.filter((_, i) => i !== index));
  };

  const uploadAttachments = async (ticketId: string) => {
    const uploadedAttachments: { file_name: string; file_url: string; file_type: string; file_size: number }[] = [];

    for (const attachment of attachments) {
      const fileExt = attachment.file.name.split('.').pop();
      const fileName = `${user?.id}/${ticketId}/${Date.now()}-${attachment.file.name}`;
      
      const { error: uploadError } = await supabase.storage
        .from('ticket-attachments')
        .upload(fileName, attachment.file);

      if (uploadError) {
        console.error('Error uploading file:', uploadError);
        continue;
      }

      const { data: urlData } = supabase.storage
        .from('ticket-attachments')
        .getPublicUrl(fileName);

      uploadedAttachments.push({
        file_name: attachment.file.name,
        file_url: urlData.publicUrl,
        file_type: attachment.file.type,
        file_size: attachment.file.size,
      });
    }

    // Also save links as attachments
    for (const link of links) {
      uploadedAttachments.push({
        file_name: link,
        file_url: link,
        file_type: 'link',
        file_size: 0,
      });
    }

    // Insert all attachments to the database
    if (uploadedAttachments.length > 0) {
      const { error } = await supabase
        .from('ticket_attachments')
        .insert(
          uploadedAttachments.map(att => ({
            ticket_id: ticketId,
            file_name: att.file_name,
            file_url: att.file_url,
            file_type: att.file_type,
            file_size: att.file_size,
            created_by: user?.id,
          }))
        );

      if (error) {
        console.error('Error saving attachments:', error);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user?.id) {
      toast.error('Você precisa estar logado para abrir um chamado');
      return;
    }

    if (!formData.title.trim() || !formData.description.trim()) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }

    setLoading(true);
    
    try {
      const { data, error } = await supabase
        .from('tickets')
        .insert({
          user_id: user.id,
          title: formData.title.trim(),
          description: formData.description.trim(),
          category: formData.category,
          priority: formData.priority,
        })
        .select()
        .single();

      if (error) throw error;

      // Upload attachments if any
      if (attachments.length > 0 || links.length > 0) {
        await uploadAttachments(data.id);
      }

      toast.success('Chamado criado com sucesso!');
      navigate(`/tickets/${data.id}`);
    } catch (error) {
      console.error('Error creating ticket:', error);
      toast.error('Erro ao criar chamado. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const getFileIcon = (type: string) => {
    if (type === 'image') return <Image className="w-4 h-4" />;
    if (type === 'video') return <Video className="w-4 h-4" />;
    return <FileText className="w-4 h-4" />;
  };

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/tickets')}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <TicketIcon className="w-7 h-7 text-primary" />
              Novo Chamado
            </h1>
            <p className="text-muted-foreground mt-1">
              Descreva seu problema ou solicitação
            </p>
          </div>
        </div>

        {/* Form */}
        <Card>
          <CardHeader>
            <CardTitle>Informações do Chamado</CardTitle>
            <CardDescription>
              Preencha os campos abaixo para abrir um novo chamado de suporte
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="title">Título *</Label>
                <Input
                  id="title"
                  placeholder="Resumo do problema ou solicitação"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="category">Categoria</Label>
                  <Select
                    value={formData.category}
                    onValueChange={(value) => setFormData({ ...formData, category: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="suporte">Suporte Geral</SelectItem>
                      <SelectItem value="erro">Erro / Bug</SelectItem>
                      <SelectItem value="solicitacao">Solicitação de Melhoria</SelectItem>
                      <SelectItem value="duvida">Dúvida</SelectItem>
                      <SelectItem value="ponto">Ponto</SelectItem>
                      <SelectItem value="outro">Outro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="priority">Prioridade</Label>
                  <Select
                    value={formData.priority}
                    onValueChange={(value) => setFormData({ ...formData, priority: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="baixa">Baixa</SelectItem>
                      <SelectItem value="normal">Normal</SelectItem>
                      <SelectItem value="alta">Alta</SelectItem>
                      <SelectItem value="urgente">Urgente</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Descrição *</Label>
                <Textarea
                  id="description"
                  placeholder="Descreva detalhadamente o problema, erro ou solicitação. Inclua passos para reproduzir o problema se aplicável."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={6}
                  required
                />
              </div>

              {/* Attachments Section */}
              <div className="space-y-4">
                <Label>Anexos (opcional)</Label>
                
                {/* File Upload */}
                <div className="flex flex-wrap gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Paperclip className="w-4 h-4 mr-2" />
                    Anexar Arquivo
                  </Button>
                </div>

                {/* Attachments Preview */}
                {attachments.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {attachments.map((att, index) => (
                      <div
                        key={index}
                        className="relative bg-muted rounded-lg p-2 flex items-center gap-2"
                      >
                        {att.type === 'image' && att.preview ? (
                          <img
                            src={att.preview}
                            alt={att.file.name}
                            className="w-10 h-10 object-cover rounded"
                          />
                        ) : (
                          <div className="w-10 h-10 bg-primary/10 rounded flex items-center justify-center">
                            {getFileIcon(att.type)}
                          </div>
                        )}
                        <span className="flex-1 text-sm truncate">{att.file.name}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => removeAttachment(index)}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Link Input */}
                <div className="flex gap-2">
                  <Input
                    placeholder="Adicionar link (ex: https://exemplo.com)"
                    value={linkInput}
                    onChange={(e) => setLinkInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addLink();
                      }
                    }}
                  />
                  <Button type="button" variant="outline" onClick={addLink}>
                    <Link className="w-4 h-4" />
                  </Button>
                </div>

                {/* Links Preview */}
                {links.length > 0 && (
                  <div className="space-y-2">
                    {links.map((link, index) => (
                      <div
                        key={index}
                        className="flex items-center gap-2 bg-muted rounded-lg p-2"
                      >
                        <Link className="w-4 h-4 text-primary" />
                        <a
                          href={link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-1 text-sm text-primary hover:underline truncate"
                        >
                          {link}
                        </a>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => removeLink(index)}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex gap-3 justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate('/tickets')}
                  disabled={loading}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={loading}>
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Enviando...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4 mr-2" />
                      Enviar Chamado
                    </>
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Tips */}
        <Card className="bg-muted/50">
          <CardContent className="pt-6">
            <h4 className="font-semibold mb-2">Dicas para um bom chamado:</h4>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>• Seja específico no título para facilitar a identificação</li>
              <li>• Descreva o problema detalhadamente, incluindo mensagens de erro</li>
              <li>• Anexe imagens ou vídeos para ilustrar o problema</li>
              <li>• Se for um erro, informe os passos para reproduzi-lo</li>
              <li>• Escolha a prioridade correta (urgente apenas para casos críticos)</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default NewTicket;
