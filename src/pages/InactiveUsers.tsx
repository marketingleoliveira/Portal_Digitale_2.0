import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import DashboardLayout from '@/components/layouts/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/local/client';
import { UserProfile, AppRole, ROLE_LABELS, hasFullAccess } from '@/types/auth';
import RoleBadge from '@/components/RoleBadge';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Search, UserCheck, Loader2, UserX, RotateCcw } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface InactiveUser extends UserProfile {
  role?: AppRole;
}

const InactiveUsers: React.FC = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [users, setUsers] = useState<InactiveUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [restoringUser, setRestoringUser] = useState<InactiveUser | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (hasFullAccess(user?.role)) {
      fetchInactiveUsers();
    }
  }, [user]);

  const fetchInactiveUsers = async () => {
    try {
      // Only fetch inactive users (is_active = false)
      const { data: profiles, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('is_active', false)
        .order('updated_at', { ascending: false });

      if (error) throw error;

      // Fetch roles for each user
      const usersWithRoles = await Promise.all(
        (profiles || []).map(async (profile) => {
          const { data: roleData } = await supabase
            .from('user_roles')
            .select('role')
            .eq('user_id', profile.id)
            .maybeSingle();

          return {
            ...profile,
            role: roleData?.role as AppRole | undefined,
          };
        })
      );

      setUsers(usersWithRoles);
    } catch (error) {
      console.error('Error fetching inactive users:', error);
      toast({
        title: 'Erro',
        description: 'Erro ao carregar usuários inativos',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRestoreUser = async () => {
    if (!restoringUser) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ is_active: true })
        .eq('id', restoringUser.id);

      if (error) throw error;

      toast({
        title: 'Sucesso',
        description: `Usuário ${restoringUser.full_name} foi restaurado com sucesso`,
      });

      // Remove from local list
      setUsers(prev => prev.filter(u => u.id !== restoringUser.id));
      setRestoreDialogOpen(false);
      setRestoringUser(null);
    } catch (error) {
      console.error('Error restoring user:', error);
      toast({
        title: 'Erro',
        description: 'Erro ao restaurar usuário',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const openRestoreDialog = (userToRestore: InactiveUser) => {
    setRestoringUser(userToRestore);
    setRestoreDialogOpen(true);
  };

  const filteredUsers = users.filter(
    (u) =>
      u.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Wait for user data to be fully loaded before checking permissions
  if (!user || user.role === null) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  if (!hasFullAccess(user?.role)) {
    return (
      <DashboardLayout>
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">Você não tem permissão para acessar esta página</p>
          </CardContent>
        </Card>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <UserX className="w-6 h-6 text-destructive" />
              Usuários Inativos
            </h1>
            <p className="text-muted-foreground">
              Usuários desativados do sistema. Você pode restaurar o acesso.
            </p>
          </div>
        </div>

        {/* Search */}
        <Card>
          <CardContent className="pt-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome ou email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </CardContent>
        </Card>

        {/* Users Table */}
        <Card>
          <CardHeader>
            <CardTitle>Contas Inativas</CardTitle>
            <CardDescription>
              {filteredUsers.length} usuário(s) inativo(s)
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="text-center py-12">
                <UserCheck className="w-12 h-12 mx-auto text-green-500 mb-4" />
                <p className="text-lg font-medium text-foreground mb-2">
                  Nenhum usuário inativo
                </p>
                <p className="text-muted-foreground">
                  {searchTerm 
                    ? 'Nenhum usuário inativo encontrado com esse termo de busca.' 
                    : 'Todos os usuários do sistema estão ativos.'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Usuário</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Cargo</TableHead>
                      <TableHead>Desativado em</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredUsers.map((u) => (
                      <TableRow key={u.id} className="opacity-70 hover:opacity-100 transition-opacity">
                        <TableCell>
                          <div className="flex items-center gap-3">
                            {u.avatar_url ? (
                              <img
                                src={u.avatar_url}
                                alt={u.full_name}
                                className="w-10 h-10 rounded-full object-cover grayscale"
                              />
                            ) : (
                              <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                                <UserX className="w-5 h-5 text-muted-foreground" />
                              </div>
                            )}
                            <div>
                              <p className="font-medium line-through text-muted-foreground">{u.full_name}</p>
                              {u.phone && (
                                <p className="text-sm text-muted-foreground">{u.phone}</p>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{u.email}</TableCell>
                        <TableCell>
                          {u.role ? (
                            <RoleBadge role={u.role} size="sm" />
                          ) : (
                            <span className="text-muted-foreground text-sm">Sem cargo</span>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {u.updated_at
                            ? format(new Date(u.updated_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
                            : '-'}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openRestoreDialog(u)}
                            className="gap-2"
                          >
                            <RotateCcw className="w-4 h-4" />
                            Restaurar
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Restore Dialog */}
      <AlertDialog open={restoreDialogOpen} onOpenChange={setRestoreDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restaurar Usuário</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja restaurar o usuário <strong>{restoringUser?.full_name}</strong>?
              <br /><br />
              O usuário voltará a ter acesso ao sistema com suas permissões anteriores.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleRestoreUser} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Restaurando...
                </>
              ) : (
                <>
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Restaurar Usuário
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
};

export default InactiveUsers;
