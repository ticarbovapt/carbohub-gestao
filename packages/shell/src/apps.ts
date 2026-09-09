// Registro dos apps do ecossistema Carbo + resolução de acesso por usuário.
// Espelha carbohub-landing/src/lib/apps.ts (fonte da verdade do Hub):
// acesso = coluna profiles.allowed_interfaces (text[]) + regra "vê tudo" (Admin).
// Mantido sem dependências além de lucide-react (só ícones).
import {
  Home, Building2, TrendingUp, Boxes, Handshake, Store, Wallet, ShieldCheck, Megaphone, LifeBuoy,
  MessagesSquare,
  type LucideIcon,
} from "lucide-react";

export const HUB_URL = "https://carbohub.com.br";

export type AppKey = "controle" | "crm" | "ops" | "licenciados" | "lojas" | "financas" | "mkt" | "admin" | "ti" | "atendimento";

export interface EcoApp {
  key: AppKey;
  name: string;
  tag: string;
  href: string;
  icon: LucideIcon;
  /** Cor de destaque do app (chip do ícone no switcher). */
  accent: string;
}

// Catálogo (mesmos hrefs/nome do Hub). Ícones lucide + cor de destaque por app.
export const HUB_APPS: EcoApp[] = [
  { key: "controle",    name: "Carbo Controle",   tag: "Gestão Interna",              href: "https://controle.carbohub.com.br",    icon: Building2,   accent: "#3B82F6" },
  { key: "crm",         name: "Carbo Sales",       tag: "Comercial · Vendas",          href: "https://sales.carbohub.com.br",       icon: TrendingUp,  accent: "#6366F1" },
  { key: "ops",         name: "Carbo Ops",         tag: "Operação · Logística",        href: "https://ops.carbohub.com.br",         icon: Boxes,       accent: "#F59E0B" },
  { key: "licenciados", name: "Carbo Licenciados", tag: "Portal do Licenciado",        href: "https://licenciados.carbohub.com.br", icon: Handshake,   accent: "#38BDF8" },
  { key: "lojas",       name: "Portal de Vendas",  tag: "Lojas",                       href: "https://lojas.carbohub.com.br",       icon: Store,       accent: "#22C55E" },
  { key: "financas",    name: "Carbo Finanças",    tag: "Financeiro · NF e faturamento", href: "https://finance.carbohub.com.br",   icon: Wallet,      accent: "#14B8A6" },
  { key: "mkt",         name: "Carbo Marketing",   tag: "Marketing · Campanhas",       href: "https://mkt.carbohub.com.br",         icon: Megaphone,   accent: "#EC4899" },
  { key: "ti",          name: "Carbo TI",          tag: "Suporte · Demandas",          href: "https://ti.carbohub.com.br",          icon: LifeBuoy,    accent: "#0EA5E9" },
  { key: "atendimento", name: "Carbo Atendimento", tag: "Atendimento · Clientes",      href: "https://atendimento.carbohub.com.br", icon: MessagesSquare, accent: "#9333EA" },
];

// ⚠️ O Admin segue a flag `carbo_admin` (ver `temFlagAdmin`), como o proprio app.
// Ate 09/09/2026 dependia do perfil e discordava do `ProtectedRoute` de la.
export const ADMIN_APP: EcoApp = {
  key: "admin", name: "Carbo Admin", tag: "Identidades e acessos",
  href: "https://admin.carbohub.com.br", icon: ShieldCheck, accent: "#64748B",
};

// interface (allowed_interfaces) → app do catálogo.
const INTERFACE_TO_APPS: Record<string, AppKey[]> = {
  carbo_ops: ["controle"],
  carbo_ops_app: ["ops"],
  carbo_crm: ["crm"],
  portal_licenciado: ["licenciados"],
  portal_pdv: ["lojas"],
  carbo_financas: ["financas"],
  carbo_mkt: ["mkt"],
  carbo_ti: ["ti"],
  // ⚠️ SEM esta linha o app existe, a pessoa tem a flag, e ele simplesmente NAO
  // APARECE no seletor de apps de nenhum dos sete — sem erro em lugar nenhum. A
  // resolucao abaixo e estrita: interface sem entrada aqui nao vira app.
  carbo_atendimento: ["atendimento"],
  // ⚠️ `carbo_admin` NAO entra aqui: o Admin nao esta em `HUB_APPS` (e o
  // `ADMIN_APP`, somado a parte no `buildSwitcherApps`). Quem decide e a flag,
  // conferida la — ver o comentario daquela funcao.
};

export function resolveAllowedApps(allowedInterfaces?: string[] | null): EcoApp[] {
  const list = Array.isArray(allowedInterfaces) ? allowedInterfaces : [];
  const keys = new Set<AppKey>();
  for (const iface of list) {
    for (const k of INTERFACE_TO_APPS[iface.toLowerCase()] ?? []) keys.add(k);
  }
  return HUB_APPS.filter((a) => keys.has(a.key));
}

export interface Identity {
  department?: string | null;
  funcao?: string | null;
  secondary_department?: string | null;
  secondary_funcao?: string | null;
}

const MANDA_FUNCOES = new Set(["head", "ceo", "command"]);
const MANDA_DEPARTAMENTOS = new Set(["command", "ti_suporte"]);

/**
 * "Manda" no ecossistema (command / head / TI)? Derivado do perfil.
 *
 * ⚠️ NAO governa mais quem enxerga o Admin — isso e a flag (`temFlagAdmin`).
 * Se for usar isto para decidir acesso, confira antes se o app do outro lado
 * concorda: foi a discordancia entre as duas pontas que criou o problema.
 */
export function seesEverything(id?: Identity | null): boolean {
  if (!id) return false;
  return (
    MANDA_DEPARTAMENTOS.has(id.department ?? "") ||
    MANDA_DEPARTAMENTOS.has(id.secondary_department ?? "") ||
    MANDA_FUNCOES.has(id.funcao ?? "") ||
    MANDA_FUNCOES.has(id.secondary_funcao ?? "")
  );
}

export interface SwitcherApp extends EcoApp {
  /** É o app atual (destacado, não navega). */
  current?: boolean;
  /** É o "Início" (Hub). */
  isHub?: boolean;
}

// Item fixo "Início" — sempre no topo, leva ao launcher do Hub.
export const HUB_HOME: SwitcherApp = {
  key: "controle", // placeholder — identificado por isHub
  name: "Início",
  tag: "carbohub.com.br",
  href: `${HUB_URL}/home`,
  icon: Home,
  accent: "#3BC770",
  isHub: true,
};

export type SwitcherProfile = Identity & { allowed_interfaces?: string[] | null };

/** A MESMA pergunta que o `ProtectedRoute` do app Admin faz para deixar entrar. */
export function temFlagAdmin(allowedInterfaces?: string[] | null): boolean {
  const list = Array.isArray(allowedInterfaces) ? allowedInterfaces : [];
  return list.some((i) => i.toLowerCase() === "carbo_admin");
}

/**
 * Monta a lista do switcher para um perfil: [Início, ...apps liberados
 * (+ Admin se tiver a flag)], mantendo a ordem do catálogo e marcando o app
 * atual. O app atual sempre aparece (mesmo que a flag não esteja no perfil).
 *
 * ⚠️ O Admin segue a FLAG `carbo_admin`, não o perfil (corrigido em
 * 09/09/2026). Aqui estava `seesEverything(profile)` — department
 * command/ti_suporte ou funcao head/ceo —, que é regra DIFERENTE da que o
 * próprio app Admin usa para deixar entrar (`hasAdminInterface`, só a flag).
 * Duas regras para a mesma porta erram nos dois sentidos, sempre em silêncio:
 * quem tinha a flag não via o Admin no seletor, e quem tinha só o perfil via
 * um item que levava a "Acesso restrito".
 *
 * ⚠️ São TRÊS lugares com a mesma pergunta — este, o `mostraAdmin` do
 * carbohub-landing (azulejo do Hub) e o `hasAdminInterface` do apps/admin
 * (entrada). Mudou um, confira os outros dois.
 */
export function buildSwitcherApps(profile: SwitcherProfile | null | undefined, currentKey: string): SwitcherApp[] {
  const wanted = new Set<string>(resolveAllowedApps(profile?.allowed_interfaces).map((a) => a.key));
  if (temFlagAdmin(profile?.allowed_interfaces)) wanted.add("admin");
  if (currentKey) wanted.add(currentKey); // garante o app atual na lista

  const registry: EcoApp[] = [...HUB_APPS, ADMIN_APP];
  const list: SwitcherApp[] = registry
    .filter((a) => wanted.has(a.key))
    .map((a) => ({ ...a, current: a.key === currentKey }));

  return [{ ...HUB_HOME }, ...list];
}

/**
 * Em qual app este código está rodando, resolvido pelo HOSTNAME.
 *
 * Existe porque telas replicadas (o `/vender` vive nos SEIS apps, byte a byte
 * idêntico) às vezes precisam de destinos diferentes por app. Sem isto, a
 * alternativa seria divergir o arquivo — e arquivo replicado que diverge é
 * justamente o que este repositório já pagou caro várias vezes.
 *
 * ⚠️ Fora de produção o hostname é `localhost`, e aí não há como saber: cada
 * app sobe numa porta, não num subdomínio. Devolve `null` nesse caso, e quem
 * chama deve tratar `null` como "não sei" — nunca como "não é o app X".
 */
export function appKeyAtual(): AppKey | null {
  if (typeof window === "undefined") return null;
  const host = window.location.hostname;
  const todos = [...HUB_APPS, ADMIN_APP];
  for (const a of todos) {
    try {
      if (new URL(a.href).hostname === host) return a.key;
    } catch {
      // href inválido no catálogo não pode derrubar a tela de quem só queria
      // saber onde está.
    }
  }
  return null;
}
