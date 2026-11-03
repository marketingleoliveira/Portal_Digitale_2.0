import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import DashboardLayout from '@/components/layouts/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/local/client';
import { useAuth } from '@/contexts/AuthContext';
import { hasFullAccess } from '@/types/auth';
import { toast } from 'sonner';
import { 
  TicketIcon, 
  ArrowLeft, 
  Loader2, 
  Send, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  XCircle,
  User,
  Shield,
  Paperclip,
  Image,
  Video,
  FileText,
  Link as LinkIcon,
  ExternalLink,
  Download
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Ticket {
  id: string;
  title: string;
  description: string;
  category: string;
  status: string;
  priority: string;
  created_at: string;
  updated_at: string;
  user_id: string;
}

interface TicketMessage {
  id: string;
  ticket_id: string;
  user_id: string;
  message: string;
  is_admin_reply: boolean;
  created_at: string;
}

interface TicketAttachment {
  id: string;
  ticket_id: string;
  message_id: string | null;
  file_name: string;
  file_url: string;
  file_type: string | null;
  file_size: number | null;
  created_at: string;
}

const TicketDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [attachments, setAttachments] = useState<TicketAttachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  const isAdmin = hasFullAccess(user?.role);

  useEffect(() => {
    if (id) {
      fetchTicket();
      fetchMessages();
      fetchAttachments();
    }
  }, [id]);

  const fetchTicket = async () => {
    try {
      const { data, error } = await supabase
        .from('tickets')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;
      setTicket(data);
    } catch (error) {
      console.error('Error fetching ticket:', error);
      toast.error('Erro ao carregar chamado');
      navigate('/tickets');
    } finally {
      setLoading(false);
    }
  };

  const fetchMessages = async () => {
    try {
      const { data, error } = await supabase
        .from('ticket_messages')
        .select('*')
        .eq('ticket_id', id)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setMessages(data || []);
    } catch (error) {
      console.error('Error fetching messages:', error);
    }
  };

  const fetchAttachments = async () => {
    try {
      const { data, error } = await supabase
        .from('ticket_attachments')
        .select('*')
        .eq('ticket_id', id)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setAttachments(data || []);
    } catch (error) {
      console.error('Error fetching attachments:', error);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    setSelectedFiles(prev => [...prev, ...Array.from(files)]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeSelectedFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const uploadMessageAttachments = async (messageId: string) => {
    for (const file of selectedFiles) {
      const fileName = `${user?.id}/${id}/${Date.now()}-${file.name}`;
      
      const { error: uploadError } = await supabase.storage
        .from('ticket-attachments')
        .upload(fileName, file);

      if (uploadError) {
        console.error('Error uploading file:', uploadError);
        continue;
      }

      const { data: urlData } = supabase.storage
        .from('ticket-attachments')
        .getPublicUrl(fileName);

      await supabase.from('ticket_attachments').insert({
        ticket_id: id,
        message_id: messageId,
        file_name: file.name,
        file_url: urlData.publicUrl,
        file_type: file.type,
        file_size: file.size,
        created_by: user?.id,
      });
    }
  };

  const handleSendMessage = async () => {
    if ((!newMessage.trim() && selectedFiles.length === 0) || !user?.id || !id) return;

    setSending(true);
    try {
      const { data: msgData, error } = await supabase
        .from('ticket_messages')
        .insert({
          ticket_id: id,
          user_id: user.id,
          message: newMessage.trim() || '(Anexo)',
          is_admin_reply: isAdmin,
        })
        .select()
        .single();

      if (error) throw error;

      // Upload attachments if any
      if (selectedFiles.length > 0 && msgData) {
        await uploadMessageAttachments(msgData.id);
      }

      setNewMessage('');
      setSelectedFiles([]);
      fetchMessages();
      fetchAttachments();
      toast.success('Mensagem enviada');
    } catch (error) {
      console.error('Error sending message:', error);
      toast.error('Erro ao enviar mensagem');
    } finally {
      setSending(false);
    }
  };

  const handleUpdateStatus = async (newStatus: string) => {
    if (!id) return;

    setUpdatingStatus(true);
    try {
      const { error } = await supabase
        .from('tickets')
        .update({ status: newStatus })
        .eq('id', id);

      if (error) throw error;

      setTicket(prev => prev ? { ...prev, status: newStatus } : null);
      toast.success('Status atualizado');
    } catch (error) {
      console.error('Error updating status:', error);
      toast.error('Erro ao atualizar status');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: React.ElementType }> = {
      aberto: { label: 'Aberto', variant: 'default', icon: AlertCircle },
      em_andamento: { label: 'Em Andamento', variant: 'secondary', icon: Clock },
      resolvido: { label: 'Resolvido', variant: 'outline', icon: CheckCircle2 },
      fechado: { label: 'Fechado', variant: 'outline', icon: XCircle },
    };
    
    const config = statusConfig[status] || statusConfig.aberto;
    const Icon = config.icon;
    
    return (
      <Badge variant={config.variant} className="flex items-center gap-1">
        <Icon className="w-3 h-3" />
        {config.label}
      </Badge>
    );
  };

  const getPriorityBadge = (priority: string) => {
    const priorityConfig: Record<string, { label: string; className: string }> = {
      baixa: { label: 'Baixa', className: 'bg-muted text-muted-foreground' },
      normal: { label: 'Normal', className: 'bg-primary/10 text-primary' },
      alta: { label: 'Alta', className: 'bg-warning/10 text-warning' },
      urgente: { label: 'Urgente', className: 'bg-destructive/10 text-destructive' },
    };
    
    const config = priorityConfig[priority] || priorityConfig.normal;
    
    return (
      <Badge className={config.className}>
        {config.label}
      </Badge>
    );
  };

  const getCategoryLabel = (category: string) => {
    const categories: Record<string, string> = {
      suporte: 'Suporte',
      erro: 'Erro/Bug',
      solicitacao: 'Solicitação',
      duvida: 'Dúvida',
      ponto: 'Ponto',
      outro: 'Outro',
    };
    return categories[category] || category;
  };

  const getAttachmentIcon = (fileType: string | null) => {
    if (!fileType || fileType === 'link') return <LinkIcon className="w-4 h-4" />;
    if (fileType.startsWith('image/')) return <Image className="w-4 h-4" />;
    if (fileType.startsWith('video/')) return <Video className="w-4 h-4" />;
    return <FileText className="w-4 h-4" />;
  };

  const renderAttachment = (attachment: TicketAttachment) => {
    const isLink = attachment.file_type === 'link';
    const isImage = attachment.file_type?.startsWith('image/');
    const isVideo = attachment.file_type?.startsWith('video/');

    if (isLink) {
      return (
        <a
          href={attachment.file_url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-primary hover:underline"
        >
          <LinkIcon className="w-4 h-4" />
          <span className="truncate max-w-[200px]">{attachment.file_name}</span>
          <ExternalLink className="w-3 h-3" />
        </a>
      );
    }

    if (isImage) {
      return (
        <a href={attachment.file_url} target="_blank" rel="noopener noreferrer">
          <img
            src={attachment.file_url}
            alt={attachment.file_name}
            className="max-w-[200px] max-h-[150px] rounded-lg object-cover hover:opacity-90 transition"
          />
        </a>
      );
    }

    if (isVideo) {
      return (
        <video
          src={attachment.file_url}
          controls
          className="max-w-[300px] max-h-[200px] rounded-lg"
        />
      );
    }

    return (
      <a
        href={attachment.file_url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 p-2 bg-muted rounded-lg hover:bg-muted/80 transition"
      >
        {getAttachmentIcon(attachment.file_type)}
        <span className="truncate max-w-[150px] text-sm">{attachment.file_name}</span>
        <Download className="w-4 h-4" />
      </a>
    );
  };

  // Get attachments for ticket (not linked to a message)
  const ticketAttachments = attachments.filter(a => !a.message_id);
  
  // Get attachments for a specific message
  const getMessageAttachments = (messageId: string) => {
    return attachments.filter(a => a.message_id === messageId);
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  if (!ticket) {
    return (
      <DashboardLayout>
        <div className="text-center py-12">
          <p className="text-muted-foreground">Chamado não encontrado</p>
        </div>
      </DashboardLayout>
    );
  }

  const isClosed = ticket.status === 'fechado' || ticket.status === 'resolvido';

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/tickets')}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <TicketIcon className="w-7 h-7 text-primary" />
              {ticket.title}
            </h1>
            <p className="text-muted-foreground mt-1">
              Chamado #{ticket.id.slice(0, 8)}
            </p>
          </div>
        </div>

        {/* Ticket Info */}
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <CardTitle className="text-lg">Detalhes do Chamado</CardTitle>
                <CardDescription>
                  Aberto em {format(new Date(ticket.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                {getPriorityBadge(ticket.priority)}
                {getStatusBadge(ticket.status)}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-1">Categoria</p>
              <p>{getCategoryLabel(ticket.category)}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-1">Descrição</p>
              <p className="whitespace-pre-wrap">{ticket.description}</p>
            </div>

            {/* Ticket Attachments */}
            {ticketAttachments.length > 0 && (
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-2">Anexos</p>
                <div className="flex flex-wrap gap-3">
                  {ticketAttachments.map((att) => (
                    <div key={att.id}>
                      {renderAttachment(att)}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Admin Controls */}
            {isAdmin && (
              <div className="pt-4 border-t">
                <p className="text-sm font-medium text-muted-foreground mb-2">Alterar Status</p>
                <Select
                  value={ticket.status}
                  onValueChange={handleUpdateStatus}
                  disabled={updatingStatus}
                >
                  <SelectTrigger className="w-full sm:w-[200px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="aberto">Aberto</SelectItem>
                    <SelectItem value="em_andamento">Em Andamento</SelectItem>
                    <SelectItem value="resolvido">Resolvido</SelectItem>
                    <SelectItem value="fechado">Fechado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Messages */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Mensagens</CardTitle>
            <CardDescription>
              Histórico de comunicação
            </CardDescription>
          </CardHeader>
          <CardContent>
            {messages.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                Nenhuma mensagem ainda. Envie uma mensagem para iniciar a conversa.
              </p>
            ) : (
              <div className="space-y-4 mb-6">
                {messages.map((msg) => {
                  const msgAttachments = getMessageAttachments(msg.id);
                  return (
                    <div
                      key={msg.id}
                      className={`flex gap-3 ${msg.is_admin_reply ? 'flex-row-reverse' : ''}`}
                    >
                      <div className={`p-2 rounded-full ${msg.is_admin_reply ? 'bg-primary/10' : 'bg-muted'}`}>
                        {msg.is_admin_reply ? (
                          <Shield className="w-4 h-4 text-primary" />
                        ) : (
                          <User className="w-4 h-4 text-muted-foreground" />
                        )}
                      </div>
                      <div className={`flex-1 max-w-[80%] ${msg.is_admin_reply ? 'text-right' : ''}`}>
                        <div
                          className={`inline-block p-3 rounded-lg ${
                            msg.is_admin_reply
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-muted'
                          }`}
                        >
                          <p className="whitespace-pre-wrap">{msg.message}</p>
                        </div>
                        {/* Message Attachments */}
                        {msgAttachments.length > 0 && (
                          <div className={`flex flex-wrap gap-2 mt-2 ${msg.is_admin_reply ? 'justify-end' : ''}`}>
                            {msgAttachments.map((att) => (
                              <div key={att.id}>
                                {renderAttachment(att)}
                              </div>
                            ))}
                          </div>
                        )}
                        <p className="text-xs text-muted-foreground mt-1">
                          {format(new Date(msg.created_at), "dd/MM 'às' HH:mm", { locale: ptBR })}
                          {msg.is_admin_reply && ' • Suporte'}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* New Message */}
            {!isClosed ? (
              <div className="space-y-3 pt-4 border-t">
                <Textarea
                  placeholder="Digite sua mensagem..."
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  rows={3}
                />
                
                {/* File Input */}
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                
                {/* Selected Files Preview */}
                {selectedFiles.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {selectedFiles.map((file, index) => (
                      <div key={index} className="flex items-center gap-2 bg-muted rounded-lg px-3 py-1.5">
                        <Paperclip className="w-3 h-3" />
                        <span className="text-sm truncate max-w-[150px]">{file.name}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5"
                          onClick={() => removeSelectedFile(index)}
                        >
                          <XCircle className="w-3 h-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex justify-between">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Paperclip className="w-4 h-4 mr-2" />
                    Anexar
                  </Button>
                  <Button
                    onClick={handleSendMessage}
                    disabled={sending || (!newMessage.trim() && selectedFiles.length === 0)}
                  >
                    {sending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4 mr-2" />
                    )}
                    Enviar
                  </Button>
                </div>
              </div>
            ) : (
              <div className="text-center py-4 bg-muted rounded-lg">
                <p className="text-muted-foreground">
                  Este chamado está {ticket.status === 'resolvido' ? 'resolvido' : 'fechado'} e não aceita novas mensagens.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default TicketDetails;
