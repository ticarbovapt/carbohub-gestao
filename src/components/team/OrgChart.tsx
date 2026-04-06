import React, { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { type OrgNode, getLevelLabel, getDeptColor, DEPT_COLORS } from "@/hooks/useOrgChart";

// ── Dept color legend ────────────────────────────────────────────────────────
const DEPT_LEGEND = [
  { key: "Command",  label: "Command"  },
  { key: "OPS",      label: "OPS"      },
  { key: "Growth",   label: "Growth"   },
  { key: "Finance",  label: "Finance"  },
  { key: "Expansão", label: "Expansão" },
  { key: "B2B",      label: "B2B"      },
];

// ── Single node card (circle + name + badges) ─────────────────────────────
function NodeCard({
  node,
  size = "md",
}: {
  node: OrgNode;
  size?: "lg" | "md" | "sm";
}) {
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
      {/* Avatar circle */}
      <Avatar
        className={cn(avatarSize, "ring-2 ring-offset-2 ring-offset-background shadow-md")}
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

      {/* Name */}
      <p className={cn("text-center leading-tight max-w-[110px]", textSize)}>
        {node.full_name}
      </p>

      {/* Role badge */}
      <Badge
        className={cn("text-white border-0", badgeSize)}
        style={{ backgroundColor: deptColor }}
      >
        {getLevelLabel(node.hierarchy_level)}
      </Badge>

      {/* Dual role badge */}
      {node.dual_role && (
        <Badge className={cn("bg-violet-600 text-white border-0", badgeSize)}>
          + {node.hierarchy_level === 2 ? "Head B2B" : node.dual_role.slice(0, 20)}
        </Badge>
      )}
    </div>
  );
}

// ── Connector line helpers ────────────────────────────────────────────────
// CSS-based org tree: ul/li with ::before / ::after pseudo lines
// Applied via inline <style> tag to avoid Tailwind purge issues

// ── Recursive org tree ───────────────────────────────────────────────────
function OrgLevel({
  nodes,
  depth,
  defaultOpen,
}: {
  nodes: OrgNode[];
  depth: number;
  defaultOpen: boolean;
}) {
  return (
    <ul className="org-children">
      {nodes.map((node) => (
        <OrgTreeNode key={node.id} node={node} depth={depth} defaultOpen={defaultOpen} />
      ))}
    </ul>
  );
}

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
  const hasChildren = node.children.length > 0;
  const cardSize: "lg" | "md" | "sm" = depth === 0 ? "lg" : depth === 1 ? "md" : "sm";

  return (
    <li className="org-node">
      {/* Card wrapper — toggle button overlaid */}
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

      {/* Children subtree */}
      {hasChildren && open && (
        <OrgLevel
          nodes={node.children}
          depth={depth + 1}
          defaultOpen={depth < 1}
        />
      )}
    </li>
  );
}

// ── Main OrgChart component ──────────────────────────────────────────────
interface OrgChartProps {
  tree: OrgNode[];
  isLoading?: boolean;
}

export function OrgChart({ tree, isLoading }: OrgChartProps) {
  // Count total
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
        }
        .org-root > ul.org-children {
          padding-top: 24px;
        }

        ul.org-children {
          display: flex;
          flex-direction: row;
          justify-content: center;
          align-items: flex-start;
          padding-top: 28px;
          position: relative;
          gap: 0;
        }

        /* Horizontal connector spanning all siblings */
        ul.org-children::before {
          content: '';
          position: absolute;
          top: 0;
          left: calc(50% / var(--children-count, 1));
          right: calc(50% / var(--children-count, 1));
          height: 2px;
          background: hsl(var(--border));
        }

        li.org-node {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 0 10px;
          position: relative;
        }

        /* Vertical connector from horizontal bar down to each node */
        li.org-node::before {
          content: '';
          position: absolute;
          top: 0;
          left: 50%;
          transform: translateX(-50%);
          width: 2px;
          height: 26px;
          background: hsl(var(--border));
        }

        /* Horizontal connector: extends left for non-first children, right for non-last */
        li.org-node:not(:only-child)::after {
          content: '';
          position: absolute;
          top: 0;
          height: 2px;
          background: hsl(var(--border));
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
      `}</style>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <Badge variant="secondary">{total} colaboradores</Badge>
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
        {tree.map((root) => (
          <OrgTreeNode key={root.id} node={root} depth={0} defaultOpen />
        ))}
      </div>
    </div>
  );
}
