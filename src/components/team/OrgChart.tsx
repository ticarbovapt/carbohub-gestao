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
function NodeCard({
  node,
  size = "md",
  showDept = false,
  className,
}: {
  node: OrgNode;
  size?: "lg" | "md" | "sm";
  showDept?: boolean;
  className?: string;
}) {
  const initials = node.full_name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const deptColor = getDeptColor(node.department);

  const avatarSize =
    size === "lg" ? "h-20 w-20" : size === "md" ? "h-14 w-14" : "h-11 w-11";
  const textSize =
    size === "lg"
      ? "text-sm font-bold"
      : size === "md"
      ? "text-xs font-semibold"
      : "text-[10px] font-medium";
  const badgeSize =
    size === "lg" ? "text-[11px] px-2.5 py-0.5" : "text-[9px] px-1.5 py-0";

  return (
    <div
      className={cn(
        "flex flex-col items-center gap-1.5 transition-transform duration-150 hover:scale-105 cursor-default",
        className
      )}
    >
      <Avatar
        className={cn(avatarSize, "ring-2 ring-offset-2 ring-offset-background shadow-lg")}
        style={{ "--tw-ring-color": deptColor } as React.CSSProperties}
      >
        <AvatarImage src={node.avatar_url || undefined} />
        <AvatarFallback
          className={cn(
            "text-white font-bold",
            size === "lg" ? "text-lg" : size === "md" ? "text-sm" : "text-xs"
          )}
          style={{ backgroundColor: deptColor }}
        >
          {initials}
        </AvatarFallback>
      </Avatar>

      <p className={cn("text-center leading-tight max-w-[130px]", textSize)}>
        {node.full_name}
      </p>

      {node.job_title && size !== "sm" && (
        <p className="text-[9px] text-muted-foreground text-center max-w-[130px] leading-tight -mt-0.5">
          {node.job_title}
        </p>
      )}

      {node.department && size !== "sm" && (
        <p className="text-[8px] text-muted-foreground/50 text-center max-w-[120px] leading-none -mt-0.5">
          {node.department}
        </p>
      )}

      <Badge
        className={cn("text-white border-0 shadow-sm", badgeSize)}
        style={{ backgroundColor: deptColor }}
      >
        {getLevelLabel(node.hierarchy_level)}
      </Badge>

      {showDept && node.department && (
        <Badge
          variant="outline"
          className={cn("border shadow-sm", badgeSize)}
          style={{ borderColor: deptColor, color: deptColor }}
        >
          {node.department}
        </Badge>
      )}

      {node.dual_role && (
        <Badge className={cn("bg-violet-600 text-white border-0 shadow-sm", badgeSize)}>
          + Head B2B
        </Badge>
      )}
    </div>
  );
}

// ── AssistantCard — rendered to the right of parent with dashed connector ──────
function AssistantCard({ node }: { node: OrgNode }) {
  const deptColor = getDeptColor(node.department);
  return (
    <div className="flex items-center gap-0 select-none">
      {/* Dashed horizontal line */}
      <div
        className="w-10 h-0 border-t-2 border-dashed"
        style={{ borderColor: `${deptColor}90` }}
      />
      {/* Assistant node */}
      <div className="flex flex-col items-center gap-1 ml-1">
        <div
          className="relative flex flex-col items-center gap-1 px-3 py-2 rounded-xl border-2 border-dashed"
          style={{ borderColor: `${deptColor}50`, backgroundColor: `${deptColor}08` }}
        >
          {/* "Assistente" label chip */}
          <span
            className="absolute -top-2.5 text-[8px] font-semibold px-1.5 py-0.5 rounded-full text-white"
            style={{ backgroundColor: deptColor }}
          >
            Assistente
          </span>
          <NodeCard node={node} size="sm" />
        </div>
      </div>
    </div>
  );
}

// ── GroupBlock — renders a named group of children under a dual-role node ─────
function GroupBlock({
  dept,
  nodes,
  depth,
}: {
  dept: string;
  nodes: OrgNode[];
  depth: number;
}) {
  const color = getDeptColor(dept);
  const label = GROUP_LABELS[dept] || dept;

  return (
    <div className="flex flex-col items-center gap-3 min-w-[120px]">
      <div
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-semibold text-white shadow-sm"
        style={{ backgroundColor: color }}
      >
        {label}
      </div>
      <div className="w-px h-4" style={{ backgroundColor: `${color}70` }} />
      <ul className="org-children" style={{ ["--line-color" as string]: `${color}60` }}>
        {nodes.map((node) => (
          <OrgTreeNode key={node.id} node={node} depth={depth} defaultOpen />
        ))}
      </ul>
    </div>
  );
}

// ── OrgTreeNode ───────────────────────────────────────────────────────────────
function OrgTreeNode({
  node,
  depth,
  defaultOpen,
}: {
  node: OrgNode;
  depth: number;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  const assistants     = node.children.filter((c) => c.assistant);
  const regularChildren = node.children.filter((c) => !c.assistant);

  const hasRegular  = regularChildren.length > 0;
  const hasDualRole = !!node.dual_role && regularChildren.length > 0;
  const cardSize: "lg" | "md" | "sm" =
    depth === 0 ? "lg" : depth === 1 ? "md" : "sm";

  // For dual-role nodes: group regular children by department
  const dualGroups: Array<{ dept: string; nodes: OrgNode[] }> = React.useMemo(() => {
    if (!hasDualRole) return [];
    const map = new Map<string, OrgNode[]>();
    regularChildren.forEach((child) => {
      const d = child.department || "Other";
      if (!map.has(d)) map.set(d, []);
      map.get(d)!.push(child);
    });
    return Array.from(map.entries()).map(([dept, nodes]) => ({ dept, nodes }));
  }, [hasDualRole, regularChildren]);

  return (
    <li className="org-node">
      <div className="relative inline-flex flex-col items-center">
        {/* Node + assistente ao lado */}
        <div className="flex items-start justify-center gap-0">
          <NodeCard node={node} size={cardSize} />
          {assistants.map((a) => (
            <AssistantCard key={a.id} node={a} />
          ))}
        </div>

        {hasRegular && (
          <Button
            variant="ghost"
            size="sm"
            className="h-5 w-5 p-0 mt-0.5 rounded-full bg-muted hover:bg-accent"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
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
      {!hasDualRole && hasRegular && open && (
        <ul
          className="org-children"
          style={{ ["--line-color" as string]: `${getDeptColor(node.department)}99` }}
        >
          {regularChildren.map((child) => (
            <OrgTreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              defaultOpen={depth < 1}
            />
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
          background: var(--line-color, rgba(99,102,241,0.6));
        }

        li.org-node {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 0 10px;
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
          background: var(--line-color, rgba(99,102,241,0.6));
        }

        /* Horizontal extenders per child */
        li.org-node:not(:only-child)::after {
          content: '';
          position: absolute;
          top: 0;
          height: 2px;
          background: var(--line-color, rgba(99,102,241,0.6));
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

        /* Hide connectors on root */
        .org-root > li.org-node::before,
        .org-root > li.org-node::after {
          display: none;
        }
      `}</style>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary" className="text-xs font-semibold">
          {total} colaboradores
        </Badge>
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
        <Badge variant="outline" className="text-[10px] border-dashed text-muted-foreground">
          ╌╌ Assistente
        </Badge>
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
