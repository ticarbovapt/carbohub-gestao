import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { ForcePasswordChange } from "@/components/auth/ForcePasswordChange";
import { Loader2 } from "lucide-react";

const ChangePassword = () => {
  const { user, profile, isLoading, passwordMustChange, refreshProfile } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && !user) {
      navigate("/", { replace: true });
    } else if (!isLoading && user && !passwordMustChange) {
      navigate("/dashboard", { replace: true });
    }
  }, [user, isLoading, passwordMustChange, navigate]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-board-bg">
        <Loader2 className="h-8 w-8 animate-spin text-board-navy" />
      </div>
    );
  }

  if (!user || !passwordMustChange) {
    return null;
  }

  const firstName = profile?.full_name?.split(" ")[0] || "Usuário";

  return (
    <ForcePasswordChange 
      userName={firstName} 
      onPasswordChanged={() => {
        refreshProfile();
        navigate("/onboarding", { replace: true });
      }}
      onBack={async () => {
        await supabase.auth.signOut();
        navigate("/", { replace: true });
      }}
    />
  );
};

export default ChangePassword;
