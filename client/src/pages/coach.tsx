import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useSearch } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Loader2, MessageCircle } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { ChatMessage } from "@shared/schema";

export default function Coach() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const lineId = params.get("lineId") ? Number(params.get("lineId")) : null;
  const [message, setMessage] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: messages, isLoading } = useQuery<ChatMessage[]>({
    queryKey: ["/api/chat", lineId || "general"],
    queryFn: async () => {
      if (!lineId) return [];
      const res = await apiRequest("GET", `/api/chat/${lineId}`);
      return res.json();
    },
  });

  const sendMessage = useMutation({
    mutationFn: async (text: string) => {
      const res = await apiRequest("POST", "/api/chat", {
        lineId,
        message: text,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/chat", lineId || "general"] });
      setMessage("");
    },
  });

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = () => {
    if (!message.trim() || sendMessage.isPending) return;
    sendMessage.mutate(message.trim());
  };

  return (
    <div className="flex flex-col h-full max-w-3xl mx-auto">
      {/* Header */}
      <div className="p-6 pb-3">
        <h1 className="text-xl font-semibold" data-testid="text-page-title">Coach</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Ask questions about your singing, feedback, or technique
        </p>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 space-y-3 pb-4">
        {!lineId && (
          <Card className="bg-muted/30">
            <CardContent className="p-4 text-sm text-muted-foreground">
              Tip: Go to a practice session first, then tap "Ask a question about this feedback" to get context-aware coaching.
              You can also type a general question below.
            </CardContent>
          </Card>
        )}

        {messages && messages.length === 0 && lineId && (
          <Card className="bg-muted/30">
            <CardContent className="p-4 text-sm text-muted-foreground">
              Ask me anything about this line — "Why does my voice crack here?", "How can I hold the note longer?", or anything else.
            </CardContent>
          </Card>
        )}

        {messages?.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[80%] rounded-md px-4 py-2.5 text-sm ${
                msg.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-card border"
              }`}
              data-testid={`text-message-${msg.id}`}
            >
              <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
            </div>
          </div>
        ))}

        {sendMessage.isPending && (
          <div className="flex justify-start">
            <div className="bg-card border rounded-md px-4 py-3 flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Thinking...</span>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="p-4 border-t bg-background/80 backdrop-blur-sm">
        <div className="flex gap-2 max-w-3xl mx-auto">
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Ask your coach a question..."
            className="resize-none min-h-[40px] max-h-[120px]"
            rows={1}
            data-testid="input-chat-message"
          />
          <Button
            onClick={handleSend}
            disabled={!message.trim() || sendMessage.isPending}
            size="icon"
            data-testid="button-send-message"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
