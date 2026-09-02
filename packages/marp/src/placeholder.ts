import { DEFAULT_PROMPT, DEFAULT_THEME, isTerminalogueTheme } from '@terminalogue/core';
import type { Diagnostic, Step, TerminalogueDocument } from '@terminalogue/core';

/**
 * The contract between the Marp side and the browser side of the integration.
 *
 * Marp runs the shared parser at conversion time and writes the resulting
 * document into an inert placeholder element; the browser runtime reads it back
 * and hands it to the shared renderer. Nothing else crosses the boundary — in
 * particular no HTML, so a `termlogue` block cannot contribute markup to the
 * generated presentation.
 */

/** Fenced code block language Terminalogue claims. */
export const TERMINALOGUE_LANGUAGE = 'termlogue';

/** Class name the browser runtime looks for. */
export const PLACEHOLDER_CLASS = 'terminalogue-block';

/** Attribute carrying the percent-encoded parsed document. */
export const PAYLOAD_ATTRIBUTE = 'data-terminalogue';

/**
 * Attribute carrying the block's resolved `@theme`.
 *
 * The renderer sets its own `data-theme` when it mounts; this one exists so the
 * theme is visible in the generated HTML before any script has run, which is
 * what lets a test assert that `@theme` survived the conversion.
 */
export const THEME_ATTRIBUTE = 'data-terminalogue-theme';

/** `id` of the injected runtime script, also its idempotency key. */
export const RUNTIME_ELEMENT_ID = 'terminalogue-marp-runtime';

/** `id` of the injected stylesheet, used only when Marpit is not driving. */
export const STYLE_ELEMENT_ID = 'terminalogue-marp-style';

/** Reads the language word from a fence info string such as `termlogue {1-3}`. */
export function fenceLanguage(info: string): string {
  return info.trim().split(/\s+/, 1)[0]?.toLowerCase() ?? '';
}

/**
 * Percent-encodes a parsed document for a `data-` attribute.
 *
 * `encodeURIComponent` escapes `<`, `>`, `&` and `"`, so no block content can
 * close the attribute or open a tag. The value is written into a
 * double-quoted attribute and read back with `getAttribute`, never parsed as
 * markup.
 */
export function encodeDocument(document: TerminalogueDocument): string {
  return encodeURIComponent(JSON.stringify(document));
}

/**
 * Reads a document back out of a placeholder attribute.
 *
 * Returns `null` for anything that is not a plausible document, so a truncated
 * or hand-edited attribute degrades to a diagnostic in that one block instead
 * of an exception that would take the whole presentation's runtime down.
 */
export function decodeDocument(raw: string | null | undefined): TerminalogueDocument | null {
  if (typeof raw !== 'string' || raw === '') return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(decodeURIComponent(raw));
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;

  const candidate = parsed as Partial<TerminalogueDocument>;
  if (!Array.isArray(candidate.steps)) return null;
  if (!candidate.steps.every(isStep)) return null;

  const diagnostics = Array.isArray(candidate.diagnostics)
    ? candidate.diagnostics.filter(isDiagnostic)
    : [];

  return {
    ...(typeof candidate.title === 'string' ? { title: candidate.title } : {}),
    theme: isTerminalogueTheme(candidate.theme) ? candidate.theme : DEFAULT_THEME,
    steps: candidate.steps,
    finalPrompt: typeof candidate.finalPrompt === 'string' ? candidate.finalPrompt : DEFAULT_PROMPT,
    diagnostics,
  };
}

/** A stand-in document shown when a placeholder cannot be read at all. */
export function unreadableDocument(message: string): TerminalogueDocument {
  return {
    theme: DEFAULT_THEME,
    steps: [],
    finalPrompt: DEFAULT_PROMPT,
    diagnostics: [{ line: 1, message, severity: 'error' }],
  };
}

const STEP_KINDS: ReadonlySet<string> = new Set([
  'command',
  'output',
  'type',
  'wait',
  'clear',
  'pause',
]);

function isStep(value: unknown): value is Step {
  if (typeof value !== 'object' || value === null) return false;
  const step = value as { kind?: unknown };
  return typeof step.kind === 'string' && STEP_KINDS.has(step.kind);
}

function isDiagnostic(value: unknown): value is Diagnostic {
  if (typeof value !== 'object' || value === null) return false;
  const diagnostic = value as Partial<Diagnostic>;
  return (
    typeof diagnostic.line === 'number' &&
    typeof diagnostic.message === 'string' &&
    (diagnostic.severity === 'error' || diagnostic.severity === 'warning')
  );
}
