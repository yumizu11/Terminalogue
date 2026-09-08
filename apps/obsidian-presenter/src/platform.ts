import { Platform } from 'obsidian';
import type { FileUrlFactory } from './browser.js';
import type { SpawnTargetEnvironment } from './marp/command-line.js';
import type { ExecutableEnvironment } from './marp/executable.js';
import type { SpawnFn } from './marp/runner.js';
import type { WorkspaceFileSystem } from './marp/workspace.js';

/**
 * Everything the plugin needs from Node, in one place.
 *
 * The command, process and workspace modules take these as injected
 * dependencies rather than importing Node themselves, which is what makes them
 * testable — and what keeps `child_process` to exactly one require in the whole
 * plugin. That require starts one program: the Marp CLI the reader configured.
 * A `termlogue` block is still, as it has always been, text.
 *
 * Nothing is imported statically. Obsidian only has Node on the desktop, so a
 * static import is code that runs on a phone before anything can decide not to;
 * every module here is required through {@link node}, behind
 * `Platform.isDesktop`. The manifest says `isDesktopOnly` and this is where
 * that is enforced rather than merely declared.
 */

const DESKTOP_ONLY =
  'Terminalogue Presenter needs Node, which Obsidian provides on the desktop only.';

/** The Node modules this plugin uses, and the only ones it ever loads. */
interface NodeModules {
  childProcess: typeof import('node:child_process');
  fs: typeof import('node:fs');
  os: typeof import('node:os');
  path: typeof import('node:path');
  process: typeof import('node:process');
  url: typeof import('node:url');
}

let loaded: NodeModules | null = null;

/** Node's own modules, loaded once, and only where there is a Node to load. */
function node(): NodeModules {
  if (!Platform.isDesktop) throw new Error(DESKTOP_ONLY);
  /* eslint-disable @typescript-eslint/no-require-imports -- The guard above is
     the point: these have to be loaded when they are needed, not when the file
     is, because on mobile there is nothing to load. */
  loaded ??= {
    childProcess: require('node:child_process') as NodeModules['childProcess'],
    fs: require('node:fs') as NodeModules['fs'],
    os: require('node:os') as NodeModules['os'],
    path: require('node:path') as NodeModules['path'],
    process: require('node:process') as NodeModules['process'],
    url: require('node:url') as NodeModules['url'],
  };
  /* eslint-enable @typescript-eslint/no-require-imports -- Back to normal:
     nothing below this line may load a Node module. */
  return loaded;
}

/** `child_process.spawn`, narrowed to what the runner uses. */
export const nodeSpawn: SpawnFn = (command, args, options) =>
  node().childProcess.spawn(command, [...args], options);

/** `Promise`-shaped `setTimeout`. */
export const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => window.setTimeout(resolve, ms));

/** True when the path is a file with something in it. */
export function hasContent(path: string): boolean {
  try {
    const stats = node().fs.statSync(path);
    return stats.isFile() && stats.size > 0;
  } catch {
    return false;
  }
}

export function isFile(path: string): boolean {
  try {
    return node().fs.statSync(path).isFile();
  } catch {
    return false;
  }
}

/** The operating system's temporary directory. */
export function temporaryDirectory(): string {
  return node().os.tmpdir();
}

/** `path.join`, as the workspace takes it. */
export function joinPath(...segments: string[]): string {
  return node().path.join(...segments);
}

/** The folder a file is in, which is the directory Marp CLI is run from. */
export function parentDirectory(path: string): string {
  return node().path.dirname(path);
}

/**
 * The `file:` URL for an absolute path.
 *
 * Node's own `pathToFileURL` percent-encodes everything a URL cannot carry, so
 * a vault in `~/My Notes & Slides/` opens exactly like any other. The path
 * never becomes part of a command line.
 */
export const nodeFileUrl: FileUrlFactory = (path) => node().url.pathToFileURL(path).href;

/** What the runner needs to know about the machine it is spawning on. */
export function spawnEnvironment(): SpawnTargetEnvironment {
  const { platform, env } = node().process;
  return { platform, comSpec: env.ComSpec };
}

/** The `PATH` lookup environment for the process the plugin is running in. */
export function executableEnvironment(): ExecutableEnvironment {
  const { platform, env } = node().process;
  const { isAbsolute, join } = node().path;
  return {
    platform,
    path: env.PATH,
    pathExt: env.PATHEXT,
    isFile,
    join,
    isPathLike: (value) => value.includes('/') || value.includes('\\') || isAbsolute(value),
  };
}

/** The workspace's file operations, backed by `node:fs`. */
export const nodeWorkspaceFileSystem: WorkspaceFileSystem = {
  makeDirectory(path) {
    node().fs.mkdirSync(path, { recursive: true });
  },
  writeFile(path, contents) {
    node().fs.writeFileSync(path, contents, 'utf8');
  },
  listDirectory(path) {
    try {
      return node().fs.readdirSync(path);
    } catch {
      return [];
    }
  },
  isDirectory(path) {
    try {
      return node().fs.statSync(path).isDirectory();
    } catch {
      return false;
    }
  },
  modifiedAt(path) {
    try {
      return node().fs.statSync(path).mtimeMs;
    } catch {
      return null;
    }
  },
  removeDirectory(path) {
    node().fs.rmSync(path, { recursive: true, force: true });
  },
};
