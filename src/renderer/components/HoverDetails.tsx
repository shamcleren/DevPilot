import { useState } from "react";
import type { SessionStatus } from "../../shared/sessionTypes";
import type { TimelineItem } from "../monitorSession";

type HoverDetailsProps = {
  items: TimelineItem[];
  sessionStatus: SessionStatus;
};

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

function isWebHref(href: string): boolean {
  return /^https?:\/\//i.test(href);
}

function isFileLikeHref(href: string): boolean {
  return href.startsWith("/") || /^[.]{1,2}\//.test(href) || /^[A-Za-z0-9_-]+\//.test(href);
}

function renderInlineText(text: string): Array<string | JSX.Element> {
  const result: Array<string | JSX.Element> = [];
  const pattern = /\[([^\]]+)\]\(([^)]+)\)|`([^`]+)`|(https?:\/\/\S+)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      result.push(text.slice(lastIndex, match.index));
    }

    const markdownLabel = match[1];
    const markdownUrl = match[2];
    const inlineCode = match[3];
    const rawUrl = match[4];

    if (inlineCode) {
      result.push(
        <code key={`code-${match.index}`} className="session-stream__code">
          {inlineCode}
        </code>,
      );
    } else {
      const href = markdownUrl ?? rawUrl ?? "";
      const label = markdownLabel ?? rawUrl ?? href;

      if (isWebHref(href)) {
        result.push(
          <a
            key={`${href}-${match.index}`}
            className="session-stream__link"
            href={href}
            target="_blank"
            rel="noreferrer"
          >
            {label}
          </a>,
        );
      } else if (isFileLikeHref(href)) {
        result.push(
          <button
            key={`${href}-${match.index}`}
            type="button"
            className="session-stream__file-link"
            onClick={() => {
              void window.codepal.openPath(href);
            }}
          >
            {label}
          </button>,
        );
      } else {
        result.push(label);
      }
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    result.push(text.slice(lastIndex));
  }

  return result;
}

function RichTextBlock({ text }: { text: string }) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const bulletLines = lines.filter((line) => /^[-*]\s+/.test(line));
  if (lines.length > 1 && bulletLines.length === lines.length) {
    return (
      <ul className="session-stream__list">
        {lines.map((line, index) => (
          <li key={index}>{renderInlineText(line.replace(/^[-*]\s+/, ""))}</li>
        ))}
      </ul>
    );
  }

  if (lines.length === 0) {
    return <div className="session-stream__richtext">{renderInlineText(text)}</div>;
  }

  return (
    <div className="session-stream__richtext">
      {lines.map((line, index) => (
        <p key={index}>{renderInlineText(line)}</p>
      ))}
    </div>
  );
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

  return (
    <div className="session-stream" role="region" aria-label="Session activity stream">
      {items.length === 0 ? (
        <div className="session-stream__empty">No detailed context yet.</div>
      ) : (
        <>
          <div className="session-stream__section session-stream__section--primary">
            {primaryItems.map((item, index) => {
              if (item.kind === "message") {
                return (
                  <div
                    key={item.id}
                    className={`session-stream__item session-stream__item--message session-stream__item--message-${messageRole(item.label)}`}
                  >
                    <div className="session-stream__header">
                      <span className="session-stream__label">{item.label}</span>
                    </div>
                    <div className="session-stream__body">
                      <RichTextBlock text={item.body} />
                    </div>
                  </div>
                );
              }

              const expanded = expandedTools[item.id] ?? false;
              const activeArtifact =
                sessionStatus === "running" &&
                !primaryItems.slice(0, index).some((entry) => entry.kind === "tool");

              return (
                <div
                  key={item.id}
                  className={`session-stream__item session-stream__item--artifact ${
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
                          onClick={() => toggleTool(item.id)}
                        >
                          {expanded ? "收起" : "展开"}
                        </button>
                      ) : null}
                    </div>
                    <div
                      className={`session-stream__body session-stream__artifact-body ${
                        expanded ? "session-stream__artifact-body--expanded" : ""
                      }`}
                    >
                      <RichTextBlock text={item.body} />
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

          {showTypingIndicator ? (
            <div className="session-stream__section session-stream__section--footer">
              <div className="session-stream__item session-stream__item--message session-stream__item--message-assistant session-stream__item--typing">
                <div className="session-stream__header">
                  <span className="session-stream__label">Assistant</span>
                </div>
                <div className="session-stream__body">
                  <div className="session-stream__typing-indicator" aria-label="Agent 正在输入">
                    <span className="session-stream__typing-text">正在整理回复</span>
                    <span className="session-stream__typing-dots" aria-hidden="true" />
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
