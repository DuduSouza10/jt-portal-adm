import {
  BarChart3,
  Boxes,
  ClipboardList,
  History,
  LayoutDashboard,
  LayoutGrid,
  Network,
  Package,
  PackageCheck,
  Send,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Truck,
  Users,
  type LucideIcon,
} from "lucide-react";

/** Ícone de cada área do menu (pela rota). Área nova sem ícone usa o genérico. */
const ICONS: Record<string, LucideIcon> = {
  "/": LayoutDashboard,
  "/solicitacoes/nova": ShoppingCart,
  "/solicitacoes": ClipboardList,
  "/separacao": PackageCheck,
  "/expedicao": Truck,
  "/produtos": Package,
  "/estoque": Boxes,
  "/relatorios": BarChart3,
  "/admin/configuracoes": Settings,
  "/admin/usuarios": Users,
  "/admin/perfis": ShieldCheck,
  "/admin/estrutura": Network,
  "/admin/auditoria": History,
  "/admin/feishu": Send,
};

export function NavIcon({ href, className }: { href: string; className?: string }) {
  const Icon = ICONS[href] ?? LayoutGrid;
  return <Icon className={className} aria-hidden />;
}
