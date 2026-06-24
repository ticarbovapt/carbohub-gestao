import { ResponsiveContainer, AreaChart, Area, Tooltip } from "recharts";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

interface MiniTrendChartProps {
  data: { date: string; saidas: number }[];
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const d = typeof label === "string" && label.includes("-") ? parseISO(label) : new Date();
  return (
    <div className="rounded-md bg-popover border border-border px-2.5 py-1.5 shadow-md text-xs">
      <p className="font-medium text-foreground">{format(d, "dd MMM", { locale: ptBR })}</p>
      <p className="text-muted-foreground">{payload[0].value} un saída</p>
    </div>
  );
}

export function MiniTrendChart({ data }: MiniTrendChartProps) {
  const hasData = data.some(d => d.saidas > 0);

  if (!hasData) {
    return (
      <div className="h-[60px] flex items-center justify-center text-[10px] text-muted-foreground">
        Sem movimentações nos últimos 30 dias
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={60}>
      <AreaChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(207, 77%, 61%)" stopOpacity={0.3} />
            <stop offset="100%" stopColor="hsl(207, 77%, 61%)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <Tooltip content={<CustomTooltip />} />
        <Area
          type="monotone"
          dataKey="saidas"
          stroke="hsl(207, 77%, 61%)"
          strokeWidth={1.5}
          fill="url(#trendGrad)"
          dot={false}
          activeDot={{ r: 3, fill: "hsl(207, 77%, 61%)" }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
