import React, { useState } from "react";
import { useOsMessages } from "@/hooks/useOsMessages";
import { useOsActions } from "@/hooks/useOsActions";
import { MessageList } from "./MessageList";
import { MessageInput } from "./MessageInput";
import { ActionList } from "./ActionList";
import { CreateActionDialog } from "./CreateActionDialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { MessageCircle, ListTodo, Sparkles } from "lucide-react";
import { toast } from "sonner";

interface OSChatDrawerProps {
  serviceOrderId: string;
  osNumber: string;
  currentDepartment?: string;
  onCompleteStage?: () => void;
  children?: React.ReactNode;
}

export function OSChatDrawer({ 
  serviceOrderId, 
  osNumber, 
  currentDepartment,
  onCompleteStage,
  children 
}: OSChatDrawerProps) {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("chat");
  const [showActionDialog, setShowActionDialog] = useState(false);

  const { messages } = useOsMessages(serviceOrderId);
  const { pendingActions } = useOsActions(serviceOrderId);

  const handleCompleteStage = () => {
    if (onCompleteStage) {
      onCompleteStage();
    } else {
      toast.info("Navegue até os detalhes da OP para concluir a etapa");
    }
  };

  return (
    <>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          {children || (
            <Button variant="outline" size="sm" className="gap-2">
              <MessageCircle className="h-4 w-4" />
              Chat
              {(messages.length > 0 || pendingActions.length > 0) && (
                <Badge variant="secondary" className="h-5 min-w-5 px-1.5 text-xs">
                  {messages.length + pendingActions.length}
                </Badge>
              )}
            </Button>
          )}
        </SheetTrigger>

        <SheetContent className="w-full sm:max-w-lg p-0 flex flex-col">
          <SheetHeader className="p-4 pb-0 border-b">
            <SheetTitle className="flex items-center gap-2 text-lg">
              <MessageCircle className="h-5 w-5 text-primary" />
              Chat da OP
              <Badge variant="outline" className="font-mono text-xs">
                {osNumber}
              </Badge>
            </SheetTitle>
            <p className="text-xs text-muted-foreground pb-3">
              Converse, delegue, resolva. Cada troca movimenta a operação.
            </p>
          </SheetHeader>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
            <TabsList className="mx-4 mt-3 grid grid-cols-2">
              <TabsTrigger value="chat" className="gap-2">
                <MessageCircle className="h-4 w-4" />
                Mensagens
                {messages.length > 0 && (
                  <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                    {messages.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="actions" className="gap-2">
                <ListTodo className="h-4 w-4" />
                Ações
                {pendingActions.length > 0 && (
                  <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                    {pendingActions.length}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="chat" className="flex-1 flex flex-col m-0 mt-2 data-[state=inactive]:hidden">
              <MessageList serviceOrderId={serviceOrderId} />
              <MessageInput
                serviceOrderId={serviceOrderId}
                onAddAction={() => setShowActionDialog(true)}
              />
            </TabsContent>

            <TabsContent value="actions" className="flex-1 flex flex-col m-0 mt-2 data-[state=inactive]:hidden">
              <ActionList 
                serviceOrderId={serviceOrderId} 
                currentDepartment={currentDepartment}
                onCompleteStage={handleCompleteStage}
              />
              <div className="border-t p-4">
                <Button
                  onClick={() => setShowActionDialog(true)}
                  className="w-full gap-2"
                >
                  <Sparkles className="h-4 w-4" />
                  Criar Nova Ação
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </SheetContent>
      </Sheet>

      <CreateActionDialog
        serviceOrderId={serviceOrderId}
        open={showActionDialog}
        onOpenChange={setShowActionDialog}
      />
    </>
  );
}
