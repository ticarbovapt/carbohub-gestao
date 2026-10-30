import { Link } from "react-router-dom";
import { Megaphone, MessagesSquare, ArrowRight } from "lucide-react";
import { CarboCard, CarboCardContent } from "@/components/ui/carbo-card";

// Home do Carbo Marketing — esqueleto inicial. Os atalhos/telas de verdade
// entram aqui conforme as funcionalidades de marketing forem construídas.
export default function Home() {
  const atalhos = [
    { to: "/campanhas", icon: Megaphone, title: "Campanhas" },
    { to: "/chat", icon: MessagesSquare, title: "Carbo Chat" },
  ];

  return (
    <div className="space-y-6 max-w-[1200px] mx-auto">
      <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
        <Megaphone className="h-6 w-6 text-primary" /> Carbo Marketing
      </h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {atalhos.map((a) => (
          <Link key={a.to} to={a.to}>
            <CarboCard className="transition-all hover:-translate-y-0.5 hover:shadow-md h-full">
              <CarboCardContent className="p-5 flex items-center gap-4">
                <div className="h-11 w-11 shrink-0 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                  <a.icon className="h-5 w-5" />
                </div>
                <p className="min-w-0 flex-1 font-semibold text-foreground flex items-center gap-1">
                  {a.title} <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                </p>
              </CarboCardContent>
            </CarboCard>
          </Link>
        ))}
      </div>
    </div>
  );
}
