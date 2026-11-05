# Desktop app (Windows, macOS, Linux)

Heritage Studio also comes as a desktop app. It is the same app as the website, packaged
with Electron (the Chromium engine the app is tested on). It works offline and keeps your
planners on your computer.

## 1. Download

- **Releases** (recommended): open the repository's
  [Releases](https://github.com/jonidimo/agenda-heritage-generator/releases) page and pick
  the file for your system under **Assets**.
- **Latest build**: every change to the app on the `main` and `refactor-v2` branches
  builds new installers. In the **Actions** tab, open the **Desktop apps** workflow, click
  the latest finished run and download the artifact for your system at the bottom of the
  page. You must be signed in to GitHub. Artifacts are zip files and expire after 90 days
  by default.

| System | File | Notes |
| --- | --- | --- |
| Windows 10/11, 64-bit | `heritage-studio-<version>-win-x64-setup.exe` | Installer |
| Windows 10/11, 64-bit | `heritage-studio-<version>-win-x64-portable.exe` | No installation: run it from any folder or USB drive |
| macOS 13 or later, Apple silicon (M1 and newer) | `heritage-studio-<version>-mac-arm64.dmg` | |
| macOS 13 or later, Intel | `heritage-studio-<version>-mac-x64.dmg` | |
| Linux, x86-64 | `heritage-studio-<version>-linux-x86_64.AppImage` | Any distribution, no installation |
| Debian, Ubuntu, Mint… (amd64) | `heritage-studio-<version>-linux-amd64.deb` | Adds the app to the applications menu |

## 2. Install

The apps are not signed with a paid developer certificate, so the system warns you the
first time you open them. This is expected.

### Windows

1. Run the `…-setup.exe` file. If **Windows protected your PC** (SmartScreen) appears,
   click **More info → Run anyway**.
2. Choose whether to install for you only or for everyone, and the folder. The installer
   adds **Heritage Studio** to the Start menu and the desktop.

The portable `.exe` shows the same warning. To uninstall: **Settings → Apps → Heritage
Studio → Uninstall** (your planners are kept, see [Your data](#3-your-data)).

### macOS

1. Open the `.dmg` and drag **Heritage Studio** to **Applications**.
2. The first time, in **Applications**, right-click (or Control-click) **Heritage Studio →
   Open**, then **Open** again in the dialog.
   - On macOS 15 (Sequoia) and later, that shortcut is gone: double-click the app, close
     the warning, then go to **System Settings → Privacy & Security**, scroll down to the
     message about Heritage Studio and click **Open Anyway**.
3. If macOS says the app "is damaged and can't be opened", remove the download
   quarantine in Terminal and open it again:
   `xattr -dr com.apple.quarantine "/Applications/Heritage Studio.app"`

### Linux

**AppImage**: make the file executable and run it:

```sh
chmod +x heritage-studio-*.AppImage
./heritage-studio-*.AppImage
```

(Or, in the file manager, **Properties → Permissions → Allow executing file as program**,
then double-click it.) AppImages need FUSE 2: if nothing happens, install it
(`sudo apt install libfuse2t64` on Ubuntu 24.04 and later, `libfuse2` on older versions),
or start the app with `--appimage-extract-and-run`. On systems that restrict user
namespaces (Ubuntu 24.04 and later), the AppImage turns Chromium's sandbox off on its own
so that it can start; the `.deb` keeps it on, so prefer the `.deb` there.

**deb** (Debian, Ubuntu, Mint…):

```sh
sudo apt install ./heritage-studio-<version>-linux-amd64.deb
```

It appears in the applications menu as **Heritage Studio**. To uninstall:
`sudo apt remove agenda-heritage-studio`.

## 3. Your data

The desktop app keeps your planners, uploaded images and fonts, and settings in its own
storage folder:

| System | Folder |
| --- | --- |
| Windows | `%APPDATA%\Heritage Studio` |
| macOS | `~/Library/Application Support/Heritage Studio` |
| Linux | `~/.config/Heritage Studio` |

The portable Windows version uses the same folder. Uninstalling the app does not delete
it. This storage is separate from the website: what you save in the browser is not seen
by the desktop app, and the other way round.

**`.agenda.json` files are the portable backup.** Save each planner as a file (**File →
Save**) or back up everything, and keep those files somewhere safe. They open in the
desktop app, on the website and on any other computer. Anything that was not saved as a
file is lost if that folder is deleted. Files and PDFs are saved through the usual system
**Save** dialog.

## 4. If the window does not appear

On some Linux computers (for example Wayland with an NVIDIA graphics card) Chromium cannot
start its graphics process, and an app that waits for it never shows a window. Heritage
Studio does not wait: it shows the window as soon as the page has loaded and, if the
graphics process failed while starting, it restarts once with graphics acceleration off by
itself. If that does not work either, it says so in a message. You can also start it that
way yourself:

```sh
./heritage-studio-*.AppImage --disable-gpu
./heritage-studio-*.AppImage --ozone-platform=x11   # use X11 (XWayland) instead of Wayland
```

## 5. Use it with an AI model (MCP)

The same program is the **MCP server** that lets Claude Desktop, Claude Code or any MCP
client create and edit planners, look at their pages and export the PDF (see [the
guide](llm-templates.md)). Nothing else to install: Node.js and the repository are not
needed. The client starts the app with `--mcp`, which opens no window.

Set `AGENDA_MCP_ROOT` to the folder where the model may read and write planners; the server
touches nothing outside it. In Claude Desktop (`claude_desktop_config.json`, under
*Settings → Developer*), use the command for your system:

| System | `command` |
| --- | --- |
| Linux, AppImage | The `AppRun` of the extracted AppImage, e.g. `/home/me/Apps/squashfs-root/AppRun` (see below) |
| Linux, `.deb` | `/opt/Heritage Studio/agenda-heritage-studio` |
| Windows (installed) | The `Heritage Studio.exe` in the folder you installed it in (backslashes doubled, as JSON needs), e.g. `C:\\Users\\me\\AppData\\Local\\Programs\\Heritage Studio\\Heritage Studio.exe` |
| macOS | `/Applications/Heritage Studio.app/Contents/MacOS/Heritage Studio` |

```json
{
  "mcpServers": {
    "agenda": {
      "command": "/home/me/Apps/squashfs-root/AppRun",
      "args": ["--ozone-platform=headless", "--mcp"],
      "env": { "AGENDA_MCP_ROOT": "/home/me/Planners" }
    }
  }
}
```

On Windows and macOS the arguments are just `["--mcp"]`. On Linux keep
`--ozone-platform=headless`: Chromium needs a display server to start, and clients often
start the server without one; this option makes it unnecessary. For Claude Code:

```sh
claude mcp add agenda --env AGENDA_MCP_ROOT="$HOME/Planners" -- "/opt/Heritage Studio/agenda-heritage-studio" --ozone-platform=headless --mcp
```

**AppImage:** extract it once, in the folder where you keep it, and point the client to the
extracted `AppRun`:

```sh
cd ~/Apps
./heritage-studio-2.1.0-linux-x86_64.AppImage --appimage-extract   # creates ~/Apps/squashfs-root
```

This also starts faster and needs no FUSE. Do not use `--appimage-extract-and-run` (or the
`APPIMAGE_EXTRACT_AND_RUN` variable) for the server: the AppImage then prints the list of
extracted files on standard output, which breaks the channel the client talks through. The
`.deb` needs none of this.

Everything the server needs travels inside the app, so the first start does not download
or generate anything. It ends by itself when the client closes it. If the client says the
server stopped right away, run the same command in a terminal: the reason is printed there
(for example a missing `AGENDA_MCP_ROOT` folder, or no display server on Linux).

## 6. Build it yourself

You need Node.js 22.12 or later. The first run downloads Electron and the packaging tools
(a few hundred MB).

```sh
npm ci
npm run desktop:build   # builds the web app and the MCP server, then packages them for this system into release/
```

Each system builds its own installers: Windows files on Windows, `.dmg` files on a Mac,
Linux files on Linux. That is why the workflow uses three machines. The packaging
settings are in `electron-builder.yml`.

To try the app without packaging it:

```sh
npm run build:desktop   # web app → dist/, MCP server → dist-mcp/
npm run desktop         # opens dist/ in Electron (add -- --mcp to start the server instead)
```

This development run keeps its data in a separate `Heritage Studio (dev)` folder and adds
a **View** menu with **Reload** and **Toggle Developer Tools**.

## 7. Publish a release

1. Set the new `version` in `package.json` (the files are named after it) and commit.
2. Push a tag that starts with `v`:

   ```sh
   git tag v2.1.0
   git push origin v2.1.0
   ```

3. The **Desktop apps** workflow builds the three systems and creates the GitHub Release
   **v2.1.0** with all the installers and generated release notes. Tags with a hyphen,
   such as `v2.1.0-beta.1`, become pre-releases. You can edit the notes afterwards on the
   Releases page.

To build the installers without publishing anything, open **Actions → Desktop apps → Run
workflow**: the files appear as artifacts of that run. GitHub shows that button only once
the workflow file is on the default branch (`main`).

If the macOS job is cancelled after about 15 minutes without starting, GitHub had no Mac
machine free for it; the Linux and Windows files of that run are fine. Open the run and
click **Re-run failed jobs** to try the Mac again. On a release, the GitHub Release is still
created with the files that were built; once the Mac job succeeds on a re-run, re-run the
**GitHub Release** job too and it adds the missing files.

## How it works

- `electron/desktop.mjs` serves the built web app (`dist/`) at the private address
  `app://heritage/`. The address never changes, so saved data persists between launches.
- The page runs sandboxed, without access to Node.js. Links to websites open in your
  default browser, and the app does not navigate anywhere else.
- The website's service worker (its offline cache) is not used: in the desktop app every
  file is already local.
- Opening the app again while it is running brings the existing window to the front.
- With `--mcp`, `electron/mcp.mjs` starts the server bundled in `dist-mcp/` instead: no
  window, no menu, nothing written to standard output except the protocol. `npm run
  build:mcp` creates the bundle, and `scripts/mcp-smoke.ts` checks any build of the server
  end to end.
