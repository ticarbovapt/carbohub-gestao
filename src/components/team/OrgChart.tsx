import React, { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ChevronDown,
  ChevronRight,
  Users,
  Building2,
  Crown,
  Briefcase,
  UserCircle,
  Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { type OrgNode, getLevelLabel, getDeptColor } from "@/hooks/useOrgChart";

// ── Level icon mapping ──────────────────────────────────────────────────────
function LevelIcon({ level }: { level: number }) {
  switch (level) {
    case 1: return <Crown className="h-4 w-4 text-amber-500" />;
    case 2: return <Briefcase className="h-4 w-4 text-purple-500" />;
    case 3: return <Shield className="h-4 w-4 text-blue-500" />;
    case 4: return <Building2 className="h-4 w-4 text-emerald-500" />;
    default: return <UserCircle className="h-4 w-4 text-slate-400" />;
  }
}

// ── Single Node Card ────────────────────────────────────────────────────────
function OrgNodeCard({
  node,
  depth,
  isExpanded,
  onToggle,
  hasChildren,
}: {
  node: OrgNode;
  depth: number;
  isExpanded: boolean;
  onToggle: () => void;
  hasChildren: boolean;
}) {
  const initials = node.full_name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const deptColor = getDeptColor(node.department);

  return (
    <div
      className={cn(
        "flex items-center gap-3 px-4 py-3 rounded-xl border transition-all",
        "hover:shadow-md hover:border-carbo-green/40",
        node.hierarchy_level === 1 && "bg-gradient-to-r from-amber-50 to-amber-100/50 dark:from-amber-950/20 dark:to-amber-900/10 border-amber-200 dark:border-amber-800",
        node.hierarchy_level === 2 && "bg-gradient-to-r from-purple-50 to-purple-100/30 dark:from-purple-950/20 dark:to-purple-900/10 border-purple-200 dark:border-purple-800",
        node.hierarchy_level === 3 && "bg-gradient-to-r from-blue-50 to-blue-100/30 dark:from-blue-950/20 dark:to-blue-900/10 border-blue-200 dark:border-blue-800",
        node.hierarchy_level === 4 && "bg-gradient-to-r from-emerald-50 to-emerald-100/30 dark:from-emerald-950/20 dark:to-emerald-900/10 border-emerald-200 dark:border-emerald-800",
        node.hierarchy_level >= 5 && "bg-card border-border",
      )}
    >
      {/* Expand button */}
      {hasChildren ? (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 flex-shrink-0"
          onClick={onToggle}
        >
          {isExpanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </Button>
      ) : (
        <div className="w-7 flex-shrink-0" />
      )}

      {/* Avatar */}
      <Avatar className="h-10 w-10 flex-shrink-0">
        <AvatarImage src={node.avatar_url || undefined} />
        <AvatarFallback
          className="text-xs font-bold text-white"
          style={{ backgroundColor: deptColor }}
        >
          {initials}
        </AvatarFallback>
      </Avatar>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <LevelIcon level={node.hierarchy_level} />
          <span className="font-semibold text-sm truncate">{node.full_name}</span>
          {hasChildren && (
            <span className="text-xs text-muted-foreground">
              ({node.children.length})
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground truncate">
          {node.job_title || "—"}
        </p>
      </div>

      {/* Badges */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <Badge
          variant="outline"
          className="text-[10px] px-2 py-0.5"
          style={{ borderColor: deptColor, color: deptColor }}
        >
          {node.department || "—"}
        </Badge>
        <Badge variant="secondary" className="text-[10px] px-2 py-0.5">
          {getLevelLabel(node.hierarchy_level)}
        </Badge>
      </div>
    </div>
  );
}

// ── Recursive Tree ──────────────────────────────────────────────────────────
function OrgNodeTree({
  node,
  depth,
  defaultExpanded,
}: {
  node: OrgNode;
  depth: number;
  defaultExpanded: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const hasChildren = node.children.length > 0;

  return (
    <div>
      <OrgNodeCard
        node={node}
        depth={depth}
        isExpanded={expanded}
        onToggle={() => setExpanded(!expanded)}
        hasChildren={hasChildren}
      />

      {/* Children */}
      {hasChildren && expanded && (
        <div className="ml-6 mt-1 space-y-1 relative">
          {/* Vertical connector line */}
          <div className="absolute left-3 top-0 bottom-4 w-px bg-border" />

          {node.children.map((child) => (
            <div key={child.id} className="relative">
              {/* Horizontal connector */}
              <div className="absolute left-[-12px] top-5 w-3 h-px bg-border" />
              <OrgNodeTree
                node={child}
                depth={depth + 1}
                defaultExpanded={depth < 1}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main OrgChart Component ─────────────────────────────────────────────────
interface OrgChartProps {
  tree: OrgNode[];
  isLoading?: boolean;
}

export function OrgChart({ tree, isLoading }: OrgChartProps) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" />
        ))}
      </div>
    );
  }

  if (tree.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Users className="h-12 w-12 text-muted-foreground/30 mb-4" />
        <h3 className="text-lg font-semibold text-muted-foreground">
          Organograma vazio
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          Execute a migration SQL para popular os dados hierárquicos.
        </p>
      </div>
    );
  }

  // Count total people
  const countNodes = (nodes: OrgNode[]): number =>
    nodes.reduce((sum, n) => sum + 1 + countNodes(n.children), 0);
  const total = countNodes(tree);

  return (
    <div className="space-y-4">
      {/* Summary badges */}
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <Badge variant="secondary">{total} colaboradores</Badge>
        <Badge variant="outline" style={{ borderColor: "#6366f1", color: "#6366f1" }}>Command</Badge>
        <Badge variant="outline" style={{ borderColor: "#3b82f6", color: "#3b82f6" }}>OPS</Badge>
        <Badge variant="outline" style={{ borderColor: "#22c55e", color: "#22c55e" }}>Growth</Badge>
        <Badge variant="outline" style={{ borderColor: "#f59e0b", color: "#f59e0b" }}>Finance</Badge>
        <Badge variant="outline" style={{ borderColor: "#8b5cf6", color: "#8b5cf6" }}>Expansão</Badge>
        <Badge variant="outline" style={{ borderColor: "#ec4899", color: "#ec4899" }}>B2B</Badge>
      </div>

      {/* Tree */}
      <div className="space-y-1">
        {tree.map((root) => (
          <OrgNodeTree key={root.id} node={root} depth={0} defaultExpanded />
        ))}
      </div>
    </div>
  );
}
