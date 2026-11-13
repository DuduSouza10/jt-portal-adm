import {
  Boxes,
  ClipboardList,
  History,
  LayoutDashboard,
  LayoutGrid,
  Network,
  Package,
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
  "/expedicao": Truck,
  "/produtos": Package,
  "/estoque": Boxes,
  "/admin/usuarios": Users,
  "/admin/perfis": ShieldCheck,
  "/admin/estrutura": Network,
  "/admin/auditoria": History,
};

export function NavIcon({ href, className }: { href: string; className?: string }) {
  const Icon = ICONS[href] ?? LayoutGrid;
  return <Icon className={className} aria-hidden />;
}
