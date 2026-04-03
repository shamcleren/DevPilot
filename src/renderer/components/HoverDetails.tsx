import { isValidElement, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { SessionStatus } from "../../shared/sessionTypes";
import type { TimelineItem } from "../monitorSession";

type HoverDetailsProps = {
  items: TimelineItem[];
  sessionStatus: SessionStatus;
};

type DirectiveChip = {
  id: string;
  label: string;
};

type ParsedAssistantBody = {
  cleanedText: string;
  chips: DirectiveChip[];
};

function extractCodeText(node: unknown): string {
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map((item) => extractCodeText(item)).join("");
  if (isValidElement<{ children?: unknown }>(node)) {
    return extractCodeText(node.props.children);
  }
  return "";
}

function noteToneLabel(item: TimelineItem): string {
  switch (item.tone) {
    case "completed":
      return "Done";
    case "running":
      return "Running";
    case "waiting":
      return "Waiting";
    case "idle":
      return "Idle";
    case "error":
      return "Error";
    default:
      return "Event";
  }
}

const COMPACT_STATUS_BODIES = new Set([
  "completed",
  "running",
  "working",
  "waiting",
  "done",
  "idle",
  "offline",
  "error",
]);

function isCompactStatusNote(item: TimelineItem): boolean {
  const body = item.body.trim().toLowerCase();
  const label = item.label.trim().toLowerCase();
  const toneLabel = noteToneLabel(item).trim().toLowerCase();

  return COMPACT_STATUS_BODIES.has(body) || body === label || body === toneLabel;
}

function isLowSignalSystemEvent(item: TimelineItem): boolean {
  const body = item.body.trim().toLowerCase();
  const title = item.title.trim().toLowerCase();

  if (isCompactStatusNote(item)) {
    return true;
  }

  return (
    title === "file edit" ||
    body === "file edited" ||
    body.startsWith("edited ") ||
    body.startsWith("file edited")
  );
}

function messageRole(label: string): "user" | "agent" | "assistant" {
  const normalized = label.trim().toLowerCase();
  if (normalized === "user") {
    return "user";
  }
  if (normalized === "assistant") {
    return "assistant";
  }
  return "agent";
}

function isExternalTarget(href: string): boolean {
  if (/^https?:\/\//i.test(href)) {
    return true;
  }

  return href.startsWith("/") || /^[.]{1,2}\//.test(href) || /^[A-Za-z0-9_-]+\//.test(href);
}

function readDirectiveAttribute(source: string, name: string): string | null {
  const pattern = new RegExp(`${name}="([^"]+)"`);
  const match = source.match(pattern);
  return match?.[1] ?? null;
}

function normalizeDirectiveName(name: string): string {
  return name.replace(/[-_]+/g, " ").trim().toLowerCase();
}

function toDirectiveChip(name: string, payload: string, index: number): DirectiveChip {
  switch (name) {
    case "git-stage":
      return { id: `directive-${index}`, label: "已暂存" };
    case "git-commit":
      return { id: `directive-${index}`, label: "已提交" };
    case "git-push": {
      const branch = readDirectiveAttribute(payload, "branch");
      return { id: `directive-${index}`, label: branch ? `已推送 ${branch}` : "已推送" };
    }
    case "git-create-branch": {
      const branch = readDirectiveAttribute(payload, "branch");
      return {
        id: `directive-${index}`,
        label: branch ? `已创建分支 ${branch}` : "已创建分支",
      };
    }
    case "git-create-pr":
      return { id: `directive-${index}`, label: "已创建 PR" };
    case "code-comment":
      return { id: `directive-${index}`, label: "已添加评论" };
    case "archive":
      return { id: `directive-${index}`, label: "已归档" };
    case "automation-update": {
      const mode = readDirectiveAttribute(payload, "mode");
      if (mode === "suggested create") {
        return { id: `directive-${index}`, label: "建议自动化" };
      }
      if (mode === "suggested update") {
        return { id: `directive-${index}`, label: "建议更新自动化" };
      }
      if (mode === "view") {
        return { id: `directive-${index}`, label: "查看自动化" };
      }
      return { id: `directive-${index}`, label: "自动化已更新" };
    }
    default:
      return { id: `directive-${index}`, label: normalizeDirectiveName(name) };
  }
}

function parseAssistantBody(text: string): ParsedAssistantBody {
  const matches = [...text.matchAll(/::([a-z0-9_-]+)\{([^{}]*)\}/gi)];
  if (matches.length === 0) {
    return { cleanedText: text, chips: [] };
  }

  const chips: DirectiveChip[] = [];
  let cleanedText = text;

  for (const [index, match] of matches.entries()) {
    const fullMatch = match[0];
    const directiveName = match[1] ?? "";
    const payload = match[2] ?? "";
    const chip = toDirectiveChip(directiveName, payload, index);

    chips.push(chip);
    cleanedText = cleanedText.replace(fullMatch, "");
  }

  return {
    cleanedText: cleanedText.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim(),
    chips,
  };
}

function RichTextBlock({ text }: { text: string }) {
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const { cleanedText, chips } = parseAssistantBody(text);
  const hasMarkdownBody = cleanedText.trim().length > 0;

  async function copyCodeBlock(code: string) {
    setCopiedCode(code);
    try {
      await window.codepal.writeClipboardText(code);
    } catch {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(code);
      } else {
        throw new Error("clipboard unavailable");
      }
    }
    window.setTimeout(() => {
      setCopiedCode((current) => (current === code ? null : current));
    }, 1200);
  }

  return (
    <div className="session-stream__richtext">
      {hasMarkdownBody ? (
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            a: ({ href, children }) => {
              const target = typeof href === "string" ? href : "";
              if (!isExternalTarget(target)) {
                return <>{children}</>;
              }
              return (
                <a
                  className="session-stream__link"
                  href={target}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(event) => {
                    event.preventDefault();
                    void window.codepal.openExternalTarget(target);
                  }}
                >
                  {children}
                </a>
              );
            },
            code: ({ className, children }) => {
              const isBlockCode = typeof className === "string" && className.includes("language-");
              return (
                <code
                  className={[
                    isBlockCode ? "session-stream__codeblock-code" : "session-stream__code",
                    className,
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {children}
                </code>
              );
            },
            pre: ({ children }) => {
              const codeText = extractCodeText(children).replace(/\n$/, "");
              const copied = copiedCode === codeText;
              return (
                <div className="session-stream__codeblock-shell">
                  <div className="session-stream__codeblock-toolbar">
                    <button
                      type="button"
                      className="session-stream__codeblock-copy"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        void copyCodeBlock(codeText);
                      }}
                    >
                      {copied ? "已复制" : "复制"}
                    </button>
                  </div>
                  <div className="session-stream__codeblock-content">
                    <pre className="session-stream__codeblock">{children}</pre>
                  </div>
                </div>
              );
            },
            p: ({ children }) => <p>{children}</p>,
            ul: ({ children }) => <ul className="session-stream__list">{children}</ul>,
            strong: ({ children }) => <strong className="session-stream__strong">{children}</strong>,
            em: ({ children }) => <em className="session-stream__em">{children}</em>,
          }}
        >
          {cleanedText}
        </ReactMarkdown>
      ) : null}
      {chips.length > 0 ? (
        <div className="session-stream__directive-chips" aria-label="Git actions">
          {chips.map((chip) => (
            <span key={chip.id} className="session-stream__directive-chip">
              {chip.label}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function looksLikeDiff(text: string): boolean {
  const normalized = text.trimStart();
  return (
    normalized.startsWith("diff --git ") ||
    normalized.startsWith("--- ") ||
    normalized.startsWith("+++ ") ||
    normalized.includes("\n@@ ") ||
    normalized.includes("\nindex ")
  );
}

function normalizeJsonText(text: string): string | null {
  const trimmed = text.trim();
  if (!(trimmed.startsWith("{") || trimmed.startsWith("["))) {
    return null;
  }

  try {
    return JSON.stringify(JSON.parse(trimmed), null, 2);
  } catch {
    return null;
  }
}

function diffLineClass(line: string): string {
  if (line.startsWith("diff --git ") || line.startsWith("index ") || line.startsWith("+++ ") || line.startsWith("--- ")) {
    return "session-stream__plaintext-line--meta";
  }
  if (line.startsWith("@@")) {
    return "session-stream__plaintext-line--hunk";
  }
  if (line.startsWith("+")) {
    return "session-stream__plaintext-line--add";
  }
  if (line.startsWith("-")) {
    return "session-stream__plaintext-line--remove";
  }
  return "session-stream__plaintext-line--plain";
}

function ToolTextBlock({ text }: { text: string }) {
  if (looksLikeDiff(text)) {
    return (
      <div className="session-stream__plaintext session-stream__plaintext--diff">
        {text.split("\n").map((line, index) => (
          <span
            key={`${index}:${line}`}
            className={`session-stream__plaintext-line ${diffLineClass(line)}`}
          >
            {line || " "}
          </span>
        ))}
      </div>
    );
  }

  const formattedJson = normalizeJsonText(text);
  if (formattedJson) {
    return (
      <pre className="session-stream__plaintext session-stream__plaintext--json">
        {formattedJson}
      </pre>
    );
  }

  return <pre className="session-stream__plaintext session-stream__plaintext--log">{text}</pre>;
}

export function HoverDetails({ items, sessionStatus }: HoverDetailsProps) {
  const chronologicalItems = [...items].reverse();
  const primaryItems = chronologicalItems.filter((item) => item.kind === "message" || item.kind === "tool");
  const notes = chronologicalItems
    .filter((item) => item.kind === "note" || item.kind === "system")
    .filter((item) => !(primaryItems.length > 0 && isLowSignalSystemEvent(item)));
  const [expandedTools, setExpandedTools] = useState<Record<string, boolean>>({});
  const showTypingIndicator = sessionStatus === "running" && primaryItems.length > 0;

  function toggleTool(id: string) {
    setExpandedTools((current) => ({
      ...current,
      [id]: !current[id],
    }));
  }

  const renderedPrimaryItems = showTypingIndicator
    ? [
        ...primaryItems,
        {
          id: "session-stream-typing-indicator",
          kind: "message" as const,
          source: "assistant" as const,
          label: "Assistant",
          title: "Assistant",
          body: "正在整理回复",
          timestamp: Number.MAX_SAFE_INTEGER,
        },
      ]
    : primaryItems;

  return (
    <div className="session-stream" role="region" aria-label="Session activity stream">
      {items.length === 0 ? (
        <div className="session-stream__empty">No detailed context yet.</div>
      ) : (
        <>
          <div className="session-stream__section session-stream__section--primary">
            {renderedPrimaryItems.map((item, index) => {
              if (item.kind === "message") {
                const isTypingItem = item.id === "session-stream-typing-indicator";
                return (
                  <div
                    key={item.id}
                    className={`session-stream__item session-stream__item--message session-stream__item--message-${messageRole(item.label)} ${
                      isTypingItem ? "session-stream__item--typing" : ""
                    }`}
                  >
                    <div className="session-stream__header">
                      <span className="session-stream__label">{item.label}</span>
                    </div>
                    <div className="session-stream__body">
                      {isTypingItem ? (
                        <div className="session-stream__typing-indicator" aria-label="Agent 正在输入">
                          <span className="session-stream__typing-text">正在整理回复</span>
                          <span className="session-stream__typing-dots" aria-hidden="true" />
                        </div>
                      ) : (
                        <RichTextBlock text={item.body} />
                      )}
                    </div>
                  </div>
                );
              }

              const expanded = expandedTools[item.id] ?? false;
              const activeArtifact =
                sessionStatus === "running" &&
                !primaryItems.slice(0, index).some((entry) => entry.kind === "tool");

              const artifactPhaseClass = item.toolPhase
                ? `session-stream__item--artifact-${item.toolPhase.toLowerCase()}`
                : "";

              return (
                <div
                  key={item.id}
                  className={`session-stream__item session-stream__item--artifact ${artifactPhaseClass} ${
                    activeArtifact ? "session-stream__item--artifact-active" : ""
                  }`}
                >
                  <div className="session-stream__artifact-accent" aria-hidden="true" />
                  <div className="session-stream__artifact-copy">
                    <div className="session-stream__artifact-eyebrow">
                      <span className="session-stream__artifact-kicker">Execution</span>
                      {item.toolName ? (
                        <span className="session-stream__artifact-name">{item.toolName}</span>
                      ) : null}
                    </div>
                    <div className="session-stream__header">
                      <span className="session-stream__label">{item.label}</span>
                      {item.toolPhase ? (
                        <span className="session-stream__artifact-type">{item.toolPhase}</span>
                      ) : null}
                      {item.body.length > 72 ? (
                        <button
                          type="button"
                          className="session-stream__artifact-toggle"
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            toggleTool(item.id);
                          }}
                        >
                          {expanded ? "收起" : "展开"}
                        </button>
                      ) : null}
                    </div>
                    <div
                      className="session-stream__body"
                    >
                      <div className="session-stream__artifact-body-shell">
                        <div
                          className={`session-stream__artifact-body ${
                            expanded
                              ? "session-stream__artifact-body--expanded"
                              : "session-stream__artifact-body--collapsed"
                          }`}
                        >
                          <ToolTextBlock text={item.body} />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {notes.length > 0 ? (
            <div className="session-stream__section session-stream__section--notes">
              {notes.map((item) => (
                <div key={item.id} className="session-stream__item session-stream__item--note">
                  <div className={`session-stream__note session-stream__note--${item.tone ?? "system"}`}>
                    <span className="session-stream__note-dot" aria-hidden="true" />
                    <span className="session-stream__note-body">{item.body}</span>
                    <span className="session-stream__note-meta">{noteToneLabel(item)}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
