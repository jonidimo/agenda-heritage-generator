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
