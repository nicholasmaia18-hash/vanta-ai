function InlineAttachmentPreview({ attachment }) {
  if (attachment.kind === "image" && typeof attachment.data === "string") {
    return (
      <figure className="overflow-hidden rounded-[1rem] border border-white/10 bg-black/20">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={attachment.data}
          alt={attachment.name}
          className="max-h-64 w-full object-cover"
        />
        <figcaption className="border-t border-white/8 px-3 py-2 text-xs text-white/55">
          {attachment.name}
        </figcaption>
      </figure>
    );
  }

  return (
    <div className="rounded-[0.8rem] border border-white/12 bg-white/8 px-3 py-1.5 text-xs text-white/70">
      {attachment.name}
    </div>
  );
}

export function MessageBody({ content, user, attachments = [] }) {
  const safeContent = typeof content === "string" ? content : "";
  const blocks = safeContent.split(/```/);

  return (
    <div className="space-y-3 text-sm leading-7 text-white/88 sm:text-base">
      {attachments.length > 0 && (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            {attachments.map((attachment) => (
              <InlineAttachmentPreview key={attachment.id} attachment={attachment} />
            ))}
          </div>
        </div>
      )}

      {blocks.map((block, index) => {
        if (index % 2 === 1) {
          const lines = block.split("\n");
          const firstLine = lines[0]?.trim();
          const language = firstLine && !firstLine.includes(" ") ? firstLine : "";
          const code = language ? lines.slice(1).join("\n") : block;

          return (
            <div
              key={`${index}-${language}`}
              className={`overflow-hidden rounded-[1.1rem] border ${
                user
                  ? "border-white/14 bg-[#2a1348]/55"
                  : "border-white/8 bg-[#12091d]"
              }`}
            >
              <div className="border-b border-white/10 px-3 py-2 text-[11px] font-medium uppercase tracking-[0.18em] text-white/40">
                {language || "code"}
              </div>
              <pre className="overflow-x-auto px-4 py-3 text-sm leading-6 text-white/90">
                <code>{code.trim()}</code>
              </pre>
            </div>
          );
        }

        return block
          .split("\n")
          .filter((line) => line.trim())
          .map((line, lineIndex) => {
            if (line.trim().startsWith("- ")) {
              return (
                <div key={`${index}-${lineIndex}`} className="flex gap-2">
                  <span className="mt-[10px] h-2 w-2 rounded-full bg-current opacity-70" />
                  <p>{renderInline(line.trim().slice(2))}</p>
                </div>
              );
            }

            return (
              <p key={`${index}-${lineIndex}`} className="whitespace-pre-wrap">
                {renderInline(line)}
              </p>
            );
          });
      })}
    </div>
  );
}

function renderInline(text) {
  const parts = text.split(/(`[^`]+`)/g);

  return parts.map((part, index) => {
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code
          key={`${part}-${index}`}
          className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[0.94em] text-white"
        >
          {part.slice(1, -1)}
        </code>
      );
    }

    return <span key={`${part}-${index}`}>{part}</span>;
  });
}
