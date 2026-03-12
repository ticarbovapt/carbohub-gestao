import { useRef, useEffect, useState } from "react";
import { Sparkles, Send, Loader2, Trash2, StopCircle, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAIChat } from "@/hooks/useAIChat";
import { useNavigate } from "react-router-dom";
import { BoardLayout } from "@/components/layouts/BoardLayout";
import DOMPurify from "dompurify";

function MarkdownText({ content }: { content: string }) {
  // SECURITY FIX: All HTML is sanitized with DOMPurify before rendering
  const lines = content.split("\n");
  return (
    <div className="space-y-1.5 text-sm leading-relaxed">
      {lines.map((line, i) => {
        let processed = line
          .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
          .replace(/\*(.+?)\*/g, "<em>$1</em>")
          .replace(/`(.+?)`/g, '<code class="bg-muted px-1 py-0.5 rounded text-xs font-mono">$1</code>');
        const sanitized = DOMPurify.sanitize(processed);

        if (line.startsWith("- ") || line.startsWith("• ")) {
          return <div key={i} className="flex gap-2 ml-3"><span className="text-primary">•</span><span dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(processed.slice(2)) }} /></div>;
        }
        if (line.startsWith("# ")) return <h2 key={i} className="text-lg font-bold text-foreground mt-2" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(processed.slice(2)) }} />;
        if (line.startsWith("## ")) return <h3 key={i} className="text-base font-semibold text-foreground mt-2" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(processed.slice(3)) }} />;
        if (line.trim() === "") return <div key={i} className="h-3" />;
        return <p key={i} dangerouslySetInnerHTML={{ __html: sanitized }} />;
      })}
    </div>
  );
}

const SUGGESTIONS = [
  "Quais OPs estão atrasadas hoje?",
  "Resumo operacional da semana",
  "Análise de performance dos licenciados",
  "Sugestões para reduzir o SLA",
  "Quais máquinas precisam de reposição?",
  "Me ajude a redigir uma justificativa de compra",
];

export default function AIAssistantPage() {
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
    inputRef.current?.focus();
  }, []);

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
    <BoardLayout>
      <div className="flex flex-col h-[calc(100vh-5rem)] max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-border">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="h-10 w-10 rounded-xl carbo-gradient flex items-center justify-center">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground">Assistente IA</h1>
              <p className="text-xs text-muted-foreground">CARBO CORE Intelligence — Chat completo</p>
            </div>
          </div>
          {messages.length > 0 && (
            <Button variant="outline" size="sm" onClick={clearChat} className="gap-1.5">
              <Trash2 className="h-3.5 w-3.5" />
              Limpar
            </Button>
          )}
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto py-6 space-y-6">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center px-8">
              <div className="h-16 w-16 rounded-2xl carbo-gradient flex items-center justify-center mb-6">
                <Sparkles className="h-8 w-8 text-white" />
              </div>
              <h2 className="text-xl font-bold text-foreground mb-2">Como posso ajudar?</h2>
              <p className="text-sm text-muted-foreground mb-8 max-w-md">
                Sou seu assistente inteligente para a plataforma CARBO CORE. 
                Pergunte sobre operações, dados, métricas ou peça sugestões.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-lg">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="text-left text-sm px-4 py-3 rounded-xl border border-border hover:bg-muted hover:border-primary/30 transition-all text-muted-foreground hover:text-foreground"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div
              key={i}
              className={cn(
                "flex gap-3",
                msg.role === "user" ? "justify-end" : "justify-start"
              )}
            >
              {msg.role === "assistant" && (
                <div className="h-8 w-8 rounded-lg carbo-gradient flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Sparkles className="h-4 w-4 text-white" />
                </div>
              )}
              <div
                className={cn(
                  "max-w-[75%] rounded-2xl px-4 py-3",
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
            <div className="flex gap-3 justify-start">
              <div className="h-8 w-8 rounded-lg carbo-gradient flex items-center justify-center flex-shrink-0">
                <Sparkles className="h-4 w-4 text-white" />
              </div>
              <div className="bg-muted rounded-2xl rounded-bl-md px-4 py-3">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">Pensando...</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <div className="border-t border-border pt-4 pb-2">
          <div className="flex items-end gap-3">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Digite sua pergunta..."
              rows={1}
              className="flex-1 resize-none bg-muted border-0 rounded-xl px-4 py-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 max-h-32"
              style={{ minHeight: "48px" }}
            />
            {isLoading ? (
              <Button size="icon" variant="outline" className="h-12 w-12 rounded-xl" onClick={stopGeneration}>
                <StopCircle className="h-5 w-5" />
              </Button>
            ) : (
              <Button
                size="icon"
                className="h-12 w-12 rounded-xl carbo-gradient"
                onClick={handleSend}
                disabled={!input.trim()}
              >
                <Send className="h-5 w-5 text-white" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </BoardLayout>
  );
}
