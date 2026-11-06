/**
 * Command line of the app. Pure, tested without Electron.
 */

/** Flag that starts the MCP server instead of the window. */
export const MCP_FLAG = '--mcp';

/**
 * Whether the app was started as an MCP server. `argv` is `process.argv`: the executable first
 * (and the app folder when run with `electron .`), then the arguments.
 * @param {readonly string[]} argv
 */
export function wantsMcp(argv) {
  return argv.slice(1).includes(MCP_FLAG);
}

/** Chromium switch that runs without a display server (Linux). */
export const HEADLESS_FLAG = '--ozone-platform=headless';

export const MISSING_DISPLAY_MESSAGE =
  'There is no display server (DISPLAY / WAYLAND_DISPLAY), which Chromium needs to start.\n' +
  `Add ${HEADLESS_FLAG} to the arguments of the server: ["${HEADLESS_FLAG}", "${MCP_FLAG}"].`;

/**
 * Whether the app is about to fail for lack of a display server: Linux, neither X11 nor Wayland
 * available, and not started headless.
 * @param {readonly string[]} argv
 * @param {Readonly<Record<string, string | undefined>>} env
 * @param {string} platform `process.platform`
 */
export function missingDisplay(argv, env, platform) {
  return platform === 'linux' && !env.DISPLAY && !env.WAYLAND_DISPLAY && !argv.slice(1).includes(HEADLESS_FLAG);
}

/**
 * Windows starts the app as a graphical program, and such a program receives nothing on standard
 * input (it ends at once), so it cannot be a stdio server. The same executable run as plain Node
 * (ELECTRON_RUN_AS_NODE) has proper standard streams and runs the server bundle directly.
 * @param {string} execPath The app executable.
 * @param {string} bundle The server bundle inside the app package.
 */
export function windowsMcpMessage(execPath, bundle) {
  return (
    `On Windows ${MCP_FLAG} cannot work: a graphical program gets no standard input.\n` +
    'Run the same program as plain Node instead. In the MCP client configuration use:\n' +
    `  "command": ${JSON.stringify(execPath)},\n` +
    `  "args": [${JSON.stringify(bundle)}],\n` +
    '  "env": { "ELECTRON_RUN_AS_NODE": "1", "AGENDA_MCP_ROOT": "<folder for your planners>" }'
  );
}

/** Biggest planner file the app opens from the command line or a drop (a planner with images is a few MB). */
export const MAX_OPEN_BYTES = 128 * 1024 * 1024;

/**
 * The planner file the app was asked to open ("Open with…", `heritage-studio file.agenda.json`).
 * `argv` is `process.argv`; flags (`--no-sandbox`…) and the app folder of `electron .` are skipped.
 * @param {readonly string[]} argv
 * @returns {string | null}
 */
export function agendaFileFromArgv(argv) {
  for (const arg of argv.slice(1)) {
    if (arg.startsWith('-')) continue;
    if (/\.json$/i.test(arg)) return arg;
  }
  return null;
}

/**
 * Whether Chromium will draw through Wayland: Linux, a Wayland session (or `--ozone-platform=wayland`),
 * and not forced to X11 or headless. Electron picks Wayland by itself in such a session.
 * @param {readonly string[]} argv
 * @param {Readonly<Record<string, string | undefined>>} env
 * @param {string} platform `process.platform`
 */
export function usesWayland(argv, env, platform) {
  if (platform !== 'linux') return false;
  const args = argv.slice(1);
  const forced = args.map((a) => /^--ozone-platform=(.+)$/.exec(a)?.[1]).filter(Boolean).at(-1);
  if (forced) return forced === 'wayland';
  return Boolean(env.WAYLAND_DISPLAY) || env.XDG_SESSION_TYPE === 'wayland';
}

/**
 * A `--disable-features` list with one more feature (without repeating it). Chromium reads only the
 * last `--disable-features`, so what the person already passed has to stay in the list.
 * @param {string} existing The current value (empty if none).
 * @param {string} feature
 */
export function withDisabledFeature(existing, feature) {
  const list = existing
    .split(',')
    .map((f) => f.trim())
    .filter(Boolean);
  return list.includes(feature) ? list.join(',') : [...list, feature].join(',');
}
