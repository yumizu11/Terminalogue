/**
 * Opening a generated presentation in the reader's default browser.
 *
 * The path never becomes part of a command. It is converted to a `file:` URL —
 * by `src/platform.ts`, the one module that reaches for Node — and handed to
 * the shell integration as a single string, so a vault in
 * `~/My Notes & Slides/` opens exactly like any other.
 */

/** Hands one URL to the operating system. */
export type ExternalOpener = (url: string) => Promise<void> | void;

/** The `file:` URL for an absolute path. */
export type FileUrlFactory = (path: string) => string;

/** How a finished presentation reaches the reader. */
export interface BrowserEnvironment {
  fileUrl: FileUrlFactory;
  open: ExternalOpener;
}

/**
 * Opens a generated file in the default browser.
 *
 * Called only after a conversion has succeeded and the file is on disk, so a
 * failed conversion never opens a window, and a watch-mode reconversion never
 * opens a second one.
 */
export async function openInBrowser(
  path: string,
  environment: BrowserEnvironment,
): Promise<void> {
  await environment.open(environment.fileUrl(path));
}
