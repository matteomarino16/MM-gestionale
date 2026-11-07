import {
  ArrowDownLeftIcon,
  ArrowUpRightIcon,
  BellIcon,
  LayersIcon,
  RefreshCwIcon,
  LayoutDashboardIcon,
  SettingsIcon,
  TruckIcon,
  UsersIcon,
  WalletIcon,
  type LucideIcon,
} from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon };

// Le voci vengono aggiunte man mano che i moduli sono implementati:
// nessun collegamento a pagine inesistenti.
export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboardIcon },
  { href: "/clienti", label: "Clienti", icon: UsersIcon },
  { href: "/servizi", label: "Servizi", icon: LayersIcon },
  { href: "/rinnovi", label: "Rinnovi", icon: RefreshCwIcon },
  { href: "/fornitori", label: "Fornitori", icon: TruckIcon },
  { href: "/entrate", label: "Entrate", icon: ArrowDownLeftIcon },
  { href: "/uscite", label: "Uscite", icon: ArrowUpRightIcon },
  { href: "/pagamenti", label: "Pagamenti", icon: WalletIcon },
  { href: "/notifiche", label: "Notifiche", icon: BellIcon },
];

export const NAV_FOOTER: NavItem[] = [{ href: "/impostazioni", label: "Impostazioni", icon: SettingsIcon }];
