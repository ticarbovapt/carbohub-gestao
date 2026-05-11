import React, { useState } from "react";
import { useNotifications } from "@/hooks/useNotifications";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Popover, 
  PopoverContent, 
  PopoverTrigger 
} from "@/components/ui/popover";
import { Bell } from "lucide-react";
import { NotificationPanel } from "./NotificationPanel";
import { motion, AnimatePresence } from "framer-motion";

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const { unreadCount } = useNotifications();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-11 w-11 rounded-xl transition-all duration-200 hover:bg-secondary active:scale-95"
          aria-label="Notificações"
        >
          <motion.div
            animate={unreadCount > 0 && !open ? { rotate: [0, -8, 8, -5, 5, 0] } : {}}
            transition={{ duration: 0.5, repeat: Infinity, repeatDelay: 4 }}
          >
            <Bell className="h-[18px] w-[18px]" />
          </motion.div>

          <AnimatePresence>
            {unreadCount > 0 && (
              <motion.div
                key="badge"
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                transition={{ type: "spring", stiffness: 400, damping: 20 }}
                className="absolute -top-0.5 -right-0.5"
              >
                <Badge
                  variant="destructive"
                  className="h-5 min-w-5 px-1.5 text-[10px] font-bold flex items-center justify-center shadow-sm pointer-events-none"
                >
                  {unreadCount > 99 ? "99+" : unreadCount}
                </Badge>
              </motion.div>
            )}
          </AnimatePresence>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[380px] p-0 bg-popover shadow-2xl rounded-xl border border-border/80"
        align="end"
        sideOffset={10}
      >
        <NotificationPanel onClose={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}
