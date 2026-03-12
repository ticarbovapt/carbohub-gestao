import { useState, useRef, useEffect } from "react";
import { Sparkles, X, Send, Loader2, Trash2, StopCircle, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAIChat } from "@/hooks/useAIChat";
import { useNavigate } from "react-router-dom";
import DOMPurify from "dompurify";

function MarkdownText({ content }: { content: string }) {
  // Simple markdown-like rendering for bold, italic, lists
  // SECURITY FIX: All HTML is sanitized with DOMPurify before rendering
  const lines = content.split("\n");
  return (
    <div className="space-y-1 text-sm leading-relaxed">
      {lines.map((line, i) => {
        let processed = line
          .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
          .replace(/\*(.+?)\*/g, "<em>$1</em>")
          .replace(/`(.+?)`/g, '<code class="bg-muted px-1 py-0.5 rounded text-xs">$1</code>');
        const sanitized = DOMPurify.sanitize(processed);

        if (line.startsWith("- ") || line.startsWith("• ")) {
          return <div key={i} className="flex gap-1.5 ml-2"><span>•</span><span dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(processed.slice(2)) }} /></div>;
        }
        if (line.trim() === "") return <div key={i} className="h-2" />;
        return <p key={i} dangerouslySetInnerHTML={{ __html: sanitized }} />;
      })}
    </div>
  );
}

export function AIChatDrawer() {
  const [isOpen, setIsOpen] = useState(false);
  const { messages, isLoading, send, clearChat, stopGeneration } = useAIChat();
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const handleSend = () => {
    const text = input.trim();
    if (!text || isLoading) return;
    setInput("");
    send(text);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <>
      {/* Floating Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full carbo-gradient shadow-xl flex items-center justify-center transition-all hover:scale-110 hover:shadow-2xl active:scale-95 group"
          aria-label="Abrir chat IA"
        >
          <Sparkles className="h-6 w-6 text-white group-hover:animate-pulse" />
        </button>
      )}

      {/* Chat Panel */}
      {isOpen && (
        <div className="fixed bottom-6 right-6 z-50 w-[380px] max-w-[calc(100vw-2rem)] h-[560px] max-h-[calc(100vh-6rem)] bg-card border border-border rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 fade-in duration-300">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-lg carbo-gradient flex items-center justify-center">
                <Sparkles className="h-4 w-4 text-white" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">Assistente IA</h3>
                <p className="text-[10px] text-muted-foreground">CARBO CORE Intelligence</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => { navigate("/ai-assistant"); setIsOpen(false); }}
                title="Abrir página completa"
              >
                <Maximize2 className="h-3.5 w-3.5" />
              </Button>
              {messages.length > 0 && (
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={clearChat} title="Limpar conversa">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setIsOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center px-6">
                <div className="h-12 w-12 rounded-xl carbo-gradient flex items-center justify-center mb-4">
                  <Sparkles className="h-6 w-6 text-white" />
                </div>
                <h4 className="text-sm font-semibold text-foreground mb-1">Olá! Como posso ajudar?</h4>
                <p className="text-xs text-muted-foreground mb-4">
                  Pergunte sobre OPs, licenciados, métricas ou peça sugestões operacionais.
                </p>
                <div className="grid gap-2 w-full">
                  {[
                    "Quais OPs estão atrasadas?",
                    "Resumo operacional de hoje",
                    "Sugestões para melhorar o SLA",
                  ].map((suggestion) => (
                    <button
                      key={suggestion}
                      onClick={() => send(suggestion)}
                      className="text-left text-xs px-3 py-2 rounded-lg border border-border hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div
                key={i}
                className={cn(
                  "flex",
                  msg.role === "user" ? "justify-end" : "justify-start"
                )}
              >
                <div
                  className={cn(
                    "max-w-[85%] rounded-2xl px-3.5 py-2.5",
                    msg.role === "user"
                      ? "carbo-gradient text-white rounded-br-md"
                      : "bg-muted text-foreground rounded-bl-md"
                  )}
                >
                  {msg.role === "assistant" ? (
                    <MarkdownText content={msg.content} />
                  ) : (
                    <p className="text-sm">{msg.content}</p>
                  )}
                </div>
              </div>
            ))}

            {isLoading && messages[messages.length - 1]?.role !== "assistant" && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-2xl rounded-bl-md px-4 py-3">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span className="text-xs">Pensando...</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="border-t border-border p-3 bg-card">
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Digite sua pergunta..."
                rows={1}
                className="flex-1 resize-none bg-muted border-0 rounded-xl px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 max-h-24"
                style={{ minHeight: "40px" }}
              />
              {isLoading ? (
                <Button size="icon" variant="outline" className="h-10 w-10 rounded-xl" onClick={stopGeneration}>
                  <StopCircle className="h-4 w-4" />
                </Button>
              ) : (
                <Button
                  size="icon"
                  className="h-10 w-10 rounded-xl carbo-gradient"
                  onClick={handleSend}
                  disabled={!input.trim()}
                >
                  <Send className="h-4 w-4 text-white" />
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
