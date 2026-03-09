import { motion } from "framer-motion";
import logoAvatar from "@/assets/logo-avatar.png";
import logoAvatarLight from "@/assets/logo-avatar-light.png";

interface LoginLoadingProps {
  userName?: string;
}

export function LoginLoading({ userName }: LoginLoadingProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background"
    >
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.4, ease: [0.34, 1.56, 0.64, 1] }}
        className="flex flex-col items-center gap-6"
      >
        <img 
          src={logoAvatar} 
          alt="Grupo Carbo" 
          className="h-20 w-auto dark:hidden"
        />
        <img 
          src={logoAvatarLight} 
          alt="Grupo Carbo" 
          className="h-20 w-auto hidden dark:block"
        />
        
        {/* Animated loading bar */}
        <div className="w-48 h-1 bg-muted rounded-full overflow-hidden">
          <motion.div
            className="h-full carbo-gradient"
            initial={{ x: "-100%" }}
            animate={{ x: "100%" }}
            transition={{
              repeat: Infinity,
              duration: 1.2,
              ease: "easeInOut",
            }}
          />
        </div>
        
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="text-muted-foreground text-center"
        >
          Preparando sua jornada{userName ? `, ${userName}` : ""}.
        </motion.p>
      </motion.div>
    </motion.div>
  );
}
