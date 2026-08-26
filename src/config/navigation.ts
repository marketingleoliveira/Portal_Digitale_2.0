import React from "react";
import {
  LayoutDashboard,
  Users,
  Bell,
  FolderOpen,
  BarChart3,
  FileText,
  Upload,
  Package,
  HelpCircle,
  TicketIcon,
  Target,
  Clock,
  Rocket,
  UserX,
  DollarSign,
  MapPin,
  Video,
  Film,
  Handshake,
  CalendarCheck,
  Megaphone,
  FileVideo,
  DoorOpen,
  ClipboardList,
  Briefcase,
  Receipt,
  Wallet,
  UsersRound,
  SlidersHorizontal,
} from "lucide-react";
import { AppRole } from "@/types/auth";

export interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  roles: AppRole[];
  highlight?: boolean;
  showNewBadge?: boolean;
  /** Menus that can never be hidden through the ERP settings screen. */
  locked?: boolean;
  children?: NavItem[];
}

export const navItems: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, roles: ["dev", "admin", "gerente", "vendedor", "criacao", "sdr", "marketing", "qualidade", "financeiro", "diretoria"], showNewBadge: true, locked: true },
  { label: "Ponto", href: "/ponto", icon: Clock, roles: ["dev", "admin", "gerente", "vendedor", "diretoria"] },
  { label: "Reunião", href: "/reunioes", icon: Video, roles: ["dev", "admin", "gerente", "vendedor", "criacao", "sdr", "marketing", "qualidade", "financeiro", "diretoria"] },
  { label: "Reserva de Salas", href: "/reserva-salas", icon: DoorOpen, roles: ["dev", "admin", "gerente", "vendedor", "criacao", "sdr", "marketing", "qualidade", "financeiro", "diretoria"] },
  { label: "Localizar", href: "/localizar", icon: MapPin, roles: ["dev", "diretoria", "gerente"] },
  { label: "Metas", href: "/metas", icon: Target, roles: ["dev", "admin", "gerente", "vendedor", "diretoria"] },
  { label: "Reembolso", href: "/reembolsos", icon: Receipt, roles: ["dev", "admin", "vendedor", "diretoria", "gerente"] },
  {
    label: "Financeiro",
    href: "/financeiro/reembolsos",
    icon: Wallet,
    roles: ["dev", "financeiro", "diretoria", "gerente"],
    children: [
      { label: "Reembolsos", href: "/financeiro/reembolsos", icon: Receipt, roles: ["dev", "financeiro", "diretoria", "gerente"] },
      { label: "Pontos", href: "/financeiro/pontos", icon: Clock, roles: ["dev", "financeiro", "diretoria", "gerente"] },
      { label: "Registros", href: "/financeiro/registros", icon: MapPin, roles: ["dev", "financeiro", "diretoria", "gerente"] },
    ],
  },
  { label: "Agendor", href: "/agendor", icon: Briefcase, roles: ["dev", "admin", "gerente", "vendedor", "criacao", "sdr", "marketing", "qualidade", "financeiro", "diretoria"] },
  {
    label: "CRM",
    href: "/crm-alimentador",
    icon: Briefcase,
    roles: ["dev", "sdr", "diretoria", "gerente"],
    children: [
      { label: "Agendamentos CRM", href: "/agendamentos-crm", icon: CalendarCheck, roles: ["dev", "sdr", "diretoria", "gerente"] },
    ],
  },
  {
    label: "Atendimento EAD",
    href: "/crm",
    icon: Handshake,
    roles: ["dev", "vendedor", "gerente", "admin", "diretoria"],
    children: [
      { label: "Agendamentos EAD", href: "/agendamentos", icon: CalendarCheck, roles: ["dev", "vendedor", "gerente", "admin", "diretoria"] },
    ],
  },
  {
    label: "Marketing",
    href: "/marketing",
    icon: Megaphone,
    roles: ["dev", "marketing", "diretoria", "gerente"],
    children: [
      { label: "Depoimentos", href: "/depoimentos", icon: FileVideo, roles: ["dev", "marketing", "diretoria", "gerente"] },
      { label: "Solicitações", href: "/solicitacoes", icon: ClipboardList, roles: ["dev", "marketing", "diretoria", "gerente"] },
    ],
  },
  { label: "Gravações", href: "/gravacoes", icon: Film, roles: ["dev", "marketing", "diretoria", "gerente"] },
  { label: "Categorias", href: "/categorias", icon: FolderOpen, roles: ["dev", "admin", "criacao", "diretoria", "gerente"] },
  { label: "Usuários", href: "/usuarios", icon: Users, roles: ["dev", "admin", "diretoria", "gerente"] },
  { label: "Inativos", href: "/inativos", icon: UserX, roles: ["dev", "admin", "diretoria", "gerente"] },
  { label: "Equipe", href: "/equipe", icon: UsersRound, roles: ["dev", "admin", "gerente", "vendedor", "criacao", "sdr", "marketing", "financeiro", "diretoria"] },
  { label: "Arquivos", href: "/arquivos", icon: Upload, roles: ["dev", "admin", "diretoria", "gerente"] },
  { label: "Relatórios", href: "/relatorios", icon: BarChart3, roles: ["dev", "admin", "gerente", "diretoria"] },
  { label: "Tabelas de Preços", href: "/precos", icon: DollarSign, roles: ["dev", "admin", "gerente", "vendedor", "sdr", "diretoria"] },
  { label: "Materiais Comerciais", href: "/downloads", icon: FileText, roles: ["dev", "admin", "gerente", "vendedor", "criacao", "sdr", "marketing", "diretoria"] },
  { label: "Material Criação", href: "/material-criacao", icon: Package, roles: ["dev", "criacao", "marketing", "diretoria", "gerente"] },
  { label: "Notificações", href: "/notificacoes", icon: Bell, roles: ["dev", "admin", "gerente", "vendedor", "criacao", "sdr", "marketing", "qualidade", "financeiro", "diretoria"] },
  {
    label: "Solicitar Ajuda",
    href: "/tickets",
    icon: TicketIcon,
    roles: ["dev", "admin", "gerente", "vendedor", "criacao", "sdr", "marketing", "qualidade", "financeiro", "diretoria"],
    highlight: true,
  },
  { label: "FAQ", href: "/ajuda", icon: HelpCircle, roles: ["dev", "admin", "gerente", "vendedor", "criacao", "sdr", "marketing", "qualidade", "financeiro", "diretoria"] },
  { label: "Atualizações", href: "/atualizacoes", icon: Rocket, roles: ["dev", "admin", "gerente", "vendedor", "criacao", "sdr", "marketing", "qualidade", "financeiro", "diretoria"] },
  { label: "Configurações ERP", href: "/configuracoes", icon: SlidersHorizontal, roles: ["dev"], locked: true },
];
