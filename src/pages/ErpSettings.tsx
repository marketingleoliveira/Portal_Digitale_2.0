import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import DashboardLayout from "@/components/layouts/DashboardLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { AppRole, ROLE_LABELS } from "@/types/auth";
import { navItems, NavItem } from "@/config/navigation";
import { useErpSettings, MenuVisibility } from "@/hooks/useErpSettings";
import {
  SlidersHorizontal,
  Eye,
  EyeOff,
  Loader2,
  Save,
  RotateCcw,
  Users as UsersIcon,
  Database,
  Search,
  ShieldCheck,
} from "lucide-react";

const MANAGEABLE_ROLES = (Object.keys(ROLE_LABELS) as AppRole[]).filter((r) => r !== "dev");

interface ManagedUser {
  id: string;
  full_name: string;
  email: string;
  is_active: boolean | null;
  role?: AppRole;
}

/** Flattens parent + children so every menu entry can be toggled individually. */
const flattenNav = (items: NavItem[]): { item: NavItem; parentLabel?: string }[] =>
  items.flatMap((item) => [
    { item },
    ...(item.children || []).map((child) => ({ item: child, parentLabel: item.label })),
  ]);

const ErpSettings: React.FC = () => {
  const { hiddenMenus, loading, saveHiddenMenus } = useErpSettings();
  const [draft, setDraft] = useState<MenuVisibility>({});
  const [saving, setSaving] = useState(false);

  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    setDraft(hiddenMenus);
  }, [hiddenMenus]);

  const flatNav = useMemo(() => flattenNav(navItems), []);

  const dirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(hiddenMenus),
    [draft, hiddenMenus],
  );

  const fetchUsers = async () => {
    setUsersLoading(true);
    try {
      const { data: profiles, error } = await supabase
        .from("profiles")
        .select("id, full_name, email, is_active")
        .order("full_name");

      if (error) throw error;

      const { data: roles, error: rolesError } = await supabase
        .from("user_roles")
        .select("user_id, role");

      if (rolesError) throw rolesError;

      const roleByUser = new Map<string, AppRole>();
      (roles || []).forEach((r) => roleByUser.set(r.user_id, r.role as AppRole));

      setUsers(
        (profiles || []).map((p) => ({
          ...p,
          role: roleByUser.get(p.id),
        })),
      );
    } catch (err) {
      console.error("Erro ao carregar usuários:", err);
      toast.error("Não foi possível carregar os usuários");
    } finally {
      setUsersLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const toggleMenuForRole = (href: string, role: AppRole) => {
    setDraft((prev) => {
      const current = prev[href] || [];
      const next = current.includes(role)
        ? current.filter((r) => r !== role)
        : [...current, role];
      return { ...prev, [href]: next };
    });
  };

  const setMenuForAllRoles = (href: string, hide: boolean) => {
    setDraft((prev) => ({ ...prev, [href]: hide ? [...MANAGEABLE_ROLES] : [] }));
  };

  const handleSave = async () => {
    setSaving(true);
    const ok = await saveHiddenMenus(draft);
    setSaving(false);
    if (ok) toast.success("Configurações de menu salvas");
    else toast.error("Erro ao salvar. Apenas o cargo Desenvolvedor pode alterar.");
  };

  const handleToggleActive = async (target: ManagedUser) => {
    const { error } = await supabase
      .from("profiles")
      .update({ is_active: !target.is_active })
      .eq("id", target.id);

    if (error) {
      toast.error("Erro ao atualizar usuário");
      return;
    }

    setUsers((prev) =>
      prev.map((u) => (u.id === target.id ? { ...u, is_active: !target.is_active } : u)),
    );
    toast.success(`Usuário ${!target.is_active ? "ativado" : "desativado"}`);
  };

  const handleChangeRole = async (target: ManagedUser, role: AppRole) => {
    const { data: existing } = await supabase
      .from("user_roles")
      .select("id")
      .eq("user_id", target.id)
      .maybeSingle();

    const { error } = existing
      ? await supabase.from("user_roles").update({ role }).eq("user_id", target.id)
      : await supabase.from("user_roles").insert({ user_id: target.id, role });

    if (error) {
      toast.error("Erro ao alterar cargo");
      return;
    }

    setUsers((prev) => prev.map((u) => (u.id === target.id ? { ...u, role } : u)));
    toast.success(`Cargo alterado para ${ROLE_LABELS[role]}`);
  };

  const filteredUsers = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return users;
    return users.filter(
      (u) =>
        u.full_name?.toLowerCase().includes(term) || u.email?.toLowerCase().includes(term),
    );
  }, [users, search]);

  const hiddenCount = useMemo(
    () => Object.values(draft).reduce((acc, roles) => acc + (roles?.length || 0), 0),
    [draft],
  );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <SlidersHorizontal className="w-6 h-6 text-primary" />
              Configurações do ERP
            </h1>
            <p className="text-sm text-muted-foreground">
              Área exclusiva do cargo Desenvolvedor: controle de menus, usuários e ambiente.
            </p>
          </div>
          <Badge variant="secondary" className="w-fit gap-1">
            <ShieldCheck className="w-3 h-3" />
            Acesso restrito
          </Badge>
        </div>

        <Tabs defaultValue="menus">
          <TabsList>
            <TabsTrigger value="menus" className="gap-2">
              <EyeOff className="w-4 h-4" /> Menus
            </TabsTrigger>
            <TabsTrigger value="usuarios" className="gap-2">
              <UsersIcon className="w-4 h-4" /> Usuários
            </TabsTrigger>
            <TabsTrigger value="sistema" className="gap-2">
              <Database className="w-4 h-4" /> Sistema
            </TabsTrigger>
          </TabsList>

          {/* ---------------- MENUS ---------------- */}
          <TabsContent value="menus" className="mt-4">
            <Card>
              <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle>Visibilidade de menus por cargo</CardTitle>
                  <CardDescription>
                    Desmarque um cargo para ocultar o menu daquele cargo. O cargo Desenvolvedor
                    sempre vê tudo. {hiddenCount} restrição(ões) configurada(s).
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setDraft(hiddenMenus)}
                    disabled={!dirty || saving}
                  >
                    <RotateCcw className="w-4 h-4 mr-2" />
                    Desfazer
                  </Button>
                  <Button size="sm" onClick={handleSave} disabled={!dirty || saving}>
                    {saving ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4 mr-2" />
                    )}
                    Salvar
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex justify-center py-10">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <div className="space-y-3">
                    {flatNav.map(({ item, parentLabel }) => {
                      const Icon = item.icon;
                      const hiddenRoles = draft[item.href] || [];
                      const applicableRoles = MANAGEABLE_ROLES.filter((r) =>
                        item.roles.includes(r),
                      );

                      return (
                        <div
                          key={`${parentLabel || "root"}-${item.href}-${item.label}`}
                          className="rounded-lg border border-border p-4 space-y-3"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-3 min-w-0">
                              <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
                              <div className="min-w-0">
                                <p className="font-medium truncate">
                                  {parentLabel ? `${parentLabel} › ${item.label}` : item.label}
                                </p>
                                <p className="text-xs text-muted-foreground truncate">
                                  {item.href}
                                </p>
                              </div>
                            </div>
                            {item.locked ? (
                              <Badge variant="outline" className="shrink-0">
                                Fixo
                              </Badge>
                            ) : (
                              <div className="flex gap-2 shrink-0">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setMenuForAllRoles(item.href, false)}
                                >
                                  <Eye className="w-4 h-4 mr-1" /> Todos
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setMenuForAllRoles(item.href, true)}
                                >
                                  <EyeOff className="w-4 h-4 mr-1" /> Ninguém
                                </Button>
                              </div>
                            )}
                          </div>

                          {!item.locked && applicableRoles.length > 0 && (
                            <div className="flex flex-wrap gap-4">
                              {applicableRoles.map((role) => {
                                const visible = !hiddenRoles.includes(role);
                                return (
                                  <label
                                    key={role}
                                    className="flex items-center gap-2 text-sm cursor-pointer"
                                  >
                                    <Switch
                                      checked={visible}
                                      onCheckedChange={() => toggleMenuForRole(item.href, role)}
                                    />
                                    <span
                                      className={
                                        visible ? "text-foreground" : "text-muted-foreground"
                                      }
                                    >
                                      {ROLE_LABELS[role]}
                                    </span>
                                  </label>
                                );
                              })}
                            </div>
                          )}

                          {!item.locked && applicableRoles.length === 0 && (
                            <p className="text-xs text-muted-foreground">
                              Menu exclusivo de cargos com nível de desenvolvedor.
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ---------------- USUÁRIOS ---------------- */}
          <TabsContent value="usuarios" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Controle de usuários</CardTitle>
                <CardDescription>
                  Ative/desative acessos e altere cargos rapidamente. Para criar usuários ou
                  redefinir senhas use a página{" "}
                  <Link to="/usuarios" className="text-primary underline">
                    Usuários
                  </Link>
                  .
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="relative max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    placeholder="Buscar por nome ou e-mail"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>

                {usersLoading ? (
                  <div className="flex justify-center py-10">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredUsers.map((u) => (
                      <div
                        key={u.id}
                        className="flex flex-col gap-3 rounded-lg border border-border p-4 md:flex-row md:items-center md:justify-between"
                      >
                        <div className="min-w-0">
                          <p className="font-medium truncate">{u.full_name || "Sem nome"}</p>
                          <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-3">
                          <Select
                            value={u.role ?? undefined}
                            onValueChange={(value) => handleChangeRole(u, value as AppRole)}
                          >
                            <SelectTrigger className="w-44">
                              <SelectValue placeholder="Sem cargo" />
                            </SelectTrigger>
                            <SelectContent className="bg-popover">
                              {(Object.keys(ROLE_LABELS) as AppRole[]).map((r) => (
                                <SelectItem key={r} value={r}>
                                  {ROLE_LABELS[r]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={!!u.is_active}
                              onCheckedChange={() => handleToggleActive(u)}
                            />
                            <span className="text-sm text-muted-foreground w-14">
                              {u.is_active ? "Ativo" : "Inativo"}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                    {filteredUsers.length === 0 && (
                      <p className="py-8 text-center text-sm text-muted-foreground">
                        Nenhum usuário encontrado.
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ---------------- SISTEMA ---------------- */}
          <TabsContent value="sistema" className="mt-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Atalhos administrativos</CardTitle>
                  <CardDescription>Áreas de gestão do ERP.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-2">
                  {[
                    { label: "Usuários", href: "/usuarios" },
                    { label: "Usuários inativos", href: "/inativos" },
                    { label: "Categorias", href: "/categorias" },
                    { label: "Arquivos", href: "/arquivos" },
                    { label: "Relatórios", href: "/relatorios" },
                    { label: "Atualizações", href: "/atualizacoes" },
                  ].map((link) => (
                    <Button key={link.href} variant="outline" asChild className="justify-start">
                      <Link to={link.href}>{link.label}</Link>
                    </Button>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Resumo do ambiente</CardTitle>
                  <CardDescription>Informações rápidas do portal.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Usuários cadastrados</span>
                    <span className="font-medium">{users.length}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Usuários ativos</span>
                    <span className="font-medium">
                      {users.filter((u) => u.is_active).length}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Menus mapeados</span>
                    <span className="font-medium">{flatNav.length}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Restrições de menu</span>
                    <span className="font-medium">{hiddenCount}</span>
                  </div>
                  <div className="pt-2">
                    <Label className="text-xs text-muted-foreground">
                      As restrições valem para todos os cargos, exceto Desenvolvedor.
                    </Label>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default ErpSettings;
