import React, { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { type OrgNode, getLevelLabel, getDeptColor, DEPT_COLORS } from "@/hooks/useOrgChart";

// ── Dept color legend ─────────────────────────────────────────────────────────
const DEPT_LEGEND = [
  { key: "Command",  label: "Command"  },
  { key: "OPS",      label: "OPS"      },
  { key: "Growth",   label: "Growth"   },
  { key: "Finance",  label: "Finance"  },
  { key: "Expansão", label: "Expansão" },
  { key: "B2B",      label: "B2B"      },
];

// Group label mapping for dual-role nodes
const GROUP_LABELS: Record<string, string> = {
  Growth:  "🎨 Time Growth",
  B2B:     "💼 Time B2B",
};

// ── Single node card ───────────────────────────────────────────────────────────
function NodeCard({ node, size = "md" }: { node: OrgNode; size?: "lg" | "md" | "sm" }) {
  const initials = node.full_name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const deptColor = getDeptColor(node.department);
  const avatarSize = size === "lg" ? "h-20 w-20" : size === "md" ? "h-14 w-14" : "h-11 w-11";
  const textSize   = size === "lg" ? "text-sm font-bold" : size === "md" ? "text-xs font-semibold" : "text-[10px] font-medium";
  const badgeSize  = size === "lg" ? "text-[11px] px-2.5 py-0.5" : "text-[9px] px-1.5 py-0";

  return (
    <div className="flex flex-col items-center gap-1.5">
      <Avatar
        className={cn(avatarSize, "ring-2 ring-offset-2 ring-offset-background shadow-lg")}
        style={{ "--tw-ring-color": deptColor } as React.CSSProperties}
      >
        <AvatarImage src={node.avatar_url || undefined} />
        <AvatarFallback
          className={cn("text-white font-bold", size === "lg" ? "text-lg" : size === "md" ? "text-sm" : "text-xs")}
          style={{ backgroundColor: deptColor }}
        >
          {initials}
        </AvatarFallback>
      </Avatar>

      <p className={cn("text-center leading-tight max-w-[110px]", textSize)}>
        {node.full_name}
      </p>

      <Badge className={cn("text-white border-0", badgeSize)} style={{ backgroundColor: deptColor }}>
        {getLevelLabel(node.hierarchy_level)}
      </Badge>

      {node.dual_role && (
        <Badge className={cn("bg-violet-600 text-white border-0", badgeSize)}>
          + Head B2B
        </Badge>
      )}
    </div>
  );
}

// ── GroupBlock — renders a named group of children under a dual-role node ─────
function GroupBlock({ dept, nodes, depth }: { dept: string; nodes: OrgNode[]; depth: number }) {
  const color = getDeptColor(dept);
  const label = GROUP_LABELS[dept] || dept;

  return (
    <div className="flex flex-col items-center gap-3 min-w-[120px]">
      {/* Group header */}
      <div
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-semibold text-white shadow-sm"
        style={{ backgroundColor: color }}
      >
        {label}
      </div>

      {/* Vertical connector down from group header */}
      <div className="w-px h-4" style={{ backgroundColor: `${color}60` }} />

      {/* Children row */}
      <ul className="org-children" style={{ ["--line-color" as string]: `${color}50` }}>
        {nodes.map((node) => (
          <OrgTreeNode key={node.id} node={node} depth={depth} defaultOpen />
        ))}
      </ul>
    </div>
  );
}

// ── OrgTreeNode ───────────────────────────────────────────────────────────────
function OrgTreeNode({ node, depth, defaultOpen }: { node: OrgNode; depth: number; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const hasChildren = node.children.length > 0;
  const hasDualRole  = !!node.dual_role && node.children.length > 0;
  const cardSize: "lg" | "md" | "sm" = depth === 0 ? "lg" : depth === 1 ? "md" : "sm";

  // For dual-role nodes, group children by department
  const dualGroups: Array<{ dept: string; nodes: OrgNode[] }> = React.useMemo(() => {
    if (!hasDualRole) return [];
    const map = new Map<string, OrgNode[]>();
    node.children.forEach((child) => {
      const d = child.department || "Other";
      if (!map.has(d)) map.set(d, []);
      map.get(d)!.push(child);
    });
    return Array.from(map.entries()).map(([dept, nodes]) => ({ dept, nodes }));
  }, [hasDualRole, node.children]);

  return (
    <li className="org-node">
      <div className="relative inline-flex flex-col items-center">
        <NodeCard node={node} size={cardSize} />

        {hasChildren && (
          <Button
            variant="ghost"
            size="sm"
            className="h-5 w-5 p-0 mt-0.5 rounded-full bg-muted hover:bg-accent"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </Button>
        )}
      </div>

      {/* Dual-role: two side-by-side group blocks */}
      {hasDualRole && open && (
        <div className="flex gap-8 mt-4 pt-4 border-t border-dashed border-primary/20">
          {dualGroups.map((g) => (
            <GroupBlock key={g.dept} dept={g.dept} nodes={g.nodes} depth={depth + 1} />
          ))}
        </div>
      )}

      {/* Regular children */}
      {!hasDualRole && hasChildren && open && (
        <ul className="org-children">
          {node.children.map((child) => (
            <OrgTreeNode key={child.id} node={child} depth={depth + 1} defaultOpen={depth < 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

// ── Main OrgChart component ───────────────────────────────────────────────────
interface OrgChartProps {
  tree: OrgNode[];
  isLoading?: boolean;
}

export function OrgChart({ tree, isLoading }: OrgChartProps) {
  const countNodes = (nodes: OrgNode[]): number =>
    nodes.reduce((s, n) => s + 1 + countNodes(n.children), 0);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center gap-6 py-12">
        <div className="h-20 w-20 rounded-full bg-muted animate-pulse" />
        <div className="flex gap-8">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex flex-col items-center gap-2">
              <div className="h-14 w-14 rounded-full bg-muted animate-pulse" />
              <div className="h-3 w-20 rounded bg-muted animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (tree.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Users className="h-12 w-12 text-muted-foreground/30 mb-4" />
        <h3 className="text-lg font-semibold text-muted-foreground">Organograma vazio</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Execute a migration SQL para popular os dados hierárquicos.
        </p>
      </div>
    );
  }

  const total = countNodes(tree);

  return (
    <div className="space-y-6">
      {/* CSS tree styles */}
      <style>{`
        .org-root {
          display: flex;
          flex-direction: column;
          align-items: center;
          overflow-x: auto;
          padding-bottom: 32px;
          padding-top: 8px;
        }
        .org-root > .org-node > ul.org-children {
          padding-top: 28px;
        }

        ul.org-children {
          display: flex;
          flex-direction: row;
          justify-content: center;
          align-items: flex-start;
          padding-top: 32px;
          position: relative;
          gap: 0;
        }

        /* Horizontal bar connecting siblings */
        ul.org-children::before {
          content: '';
          position: absolute;
          top: 0;
          left: calc(50% / 1);
          right: calc(50% / 1);
          height: 2px;
          background: rgba(99,102,241,0.4);
        }

        li.org-node {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 0 14px;
          position: relative;
        }

        /* Vertical drop from horizontal bar to node */
        li.org-node::before {
          content: '';
          position: absolute;
          top: 0;
          left: 50%;
          transform: translateX(-50%);
          width: 2px;
          height: 30px;
          background: rgba(99,102,241,0.4);
        }

        /* Horizontal extenders per child */
        li.org-node:not(:only-child)::after {
          content: '';
          position: absolute;
          top: 0;
          height: 2px;
          background: rgba(99,102,241,0.4);
          width: 50%;
        }

        li.org-node:first-child:not(:only-child)::after {
          left: 50%;
        }
        li.org-node:last-child:not(:only-child)::after {
          right: 50%;
        }
        li.org-node:not(:first-child):not(:last-child):not(:only-child)::after {
          left: 0;
          width: 100%;
        }

        /* Vertical connector from parent node down to children bar — via the li::before of root item */
        .org-root > li.org-node::before {
          display: none;
        }
        .org-root > li.org-node::after {
          display: none;
        }
      `}</style>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary" className="text-xs">{total} colaboradores</Badge>
        {DEPT_LEGEND.map((d) => (
          <Badge
            key={d.key}
            variant="outline"
            className="text-[10px]"
            style={{ borderColor: DEPT_COLORS[d.key], color: DEPT_COLORS[d.key] }}
          >
            {d.label}
          </Badge>
        ))}
      </div>

      {/* Tree */}
      <div className="org-root">
        <ul className="org-children">
          {tree.map((root) => (
            <OrgTreeNode key={root.id} node={root} depth={0} defaultOpen />
          ))}
        </ul>
      </div>
    </div>
  );
}
