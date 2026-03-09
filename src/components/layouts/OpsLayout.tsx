import { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import logoAvatar from "@/assets/logo-avatar.png";
import logoAvatarLight from "@/assets/logo-avatar-light.png";

interface OpsLayoutProps {
  children: ReactNode;
  title?: string;
  showBack?: boolean;
  backTo?: string;
  onBack?: () => void;
}

export function OpsLayout({ 
  children, 
  title, 
  showBack = false, 
  backTo = "/",
  onBack 
}: OpsLayoutProps) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-carbo-green/5 via-background to-carbo-blue/5 ops-layer">
      {/* Header */}
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between bg-card/90 backdrop-blur-md px-4 border-b border-border shadow-sm">
        <div className="flex items-center gap-3">
          {showBack ? (
            onBack ? (
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-11 w-11 rounded-xl hover:bg-carbo-green/10"
                onClick={onBack}
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
            ) : (
              <Link to={backTo}>
                <Button variant="ghost" size="icon" className="h-11 w-11 rounded-xl hover:bg-carbo-green/10">
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              </Link>
            )
          ) : (
            <>
              <img 
                src={logoAvatar} 
                alt="Grupo Carbo" 
                className="h-9 w-auto dark:hidden"
              />
              <img 
                src={logoAvatarLight} 
                alt="Grupo Carbo" 
                className="h-9 w-auto hidden dark:block"
              />
            </>
          )}
          {title && (
            <h1 className="text-lg font-bold text-foreground">{title}</h1>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link to="/home">
            <Button variant="ghost" size="icon" className="h-11 w-11 rounded-xl hover:bg-carbo-green/10">
              <Home className="h-5 w-5" />
            </Button>
          </Link>
        </div>
      </header>

      {/* Page content */}
      <main className="flex flex-col pb-8 ops-slide-up">
        {children}
      </main>
    </div>
  );
}
