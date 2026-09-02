export {
  parseTerminalogue,
  isTerminalogueTheme,
  DEFAULT_PROMPT,
  DEFAULT_THEME,
  TERMINALOGUE_THEMES,
} from './parser.js';
export { parseDuration } from './duration.js';
export type { DurationResult } from './duration.js';
export { toTranscript, toCommands, joinPrompt } from './transcript.js';
export type {
  ClearStep,
  CommandStep,
  Diagnostic,
  DiagnosticSeverity,
  OutputStep,
  PauseStep,
  Step,
  TerminalogueDocument,
  TerminalogueTheme,
  TypeStep,
  WaitStep,
} from './types.js';
