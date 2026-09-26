import { LocalTime } from "@/components/ui/local-time";
import { cn } from "@/lib/utils";

export type ThreadMessage = { id: string; body: string; mine: boolean; author: string; at: string };

/** Conversation bubbles. Message bodies are rendered as plain text (React escapes them). */
export function MessageThread({ messages }: { messages: ThreadMessage[] }) {
  return (
    <ol className="space-y-3" data-testid="thread">
      {messages.map((m) => (
        <li key={m.id} className={cn("flex", m.mine ? "justify-end" : "justify-start")}>
          <div
            className={cn(
              "max-w-[85%] rounded-2xl px-4 py-3 text-sm",
              m.mine ? "bg-brand rounded-br-md text-white" : "rounded-bl-md border border-line bg-surface",
            )}
          >
            <p className={cn("mb-1 text-xs", m.mine ? "text-white/75" : "text-muted")}>
              {m.author} · <LocalTime date={m.at} />
            </p>
            <p className="break-words whitespace-pre-wrap">{m.body}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
