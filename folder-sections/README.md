# folder-sections

The Claude Desktop **Code** sidebar no longer groups sessions by project folder. This plugin brings that back:

- Every new Code session is filed into a sidebar section named after its project folder (the git repo root when there is one). The section is created if it doesn't exist yet.
- Each section keeps its **5 most recent** sessions. Older ones move to a section called **Older** at the bottom. Pinned sessions are never moved.
- Each session is filed once. If you move a session by hand afterwards, it stays where you put it.
- Works with Windows and macOS/Linux paths.

How section names are chosen (see `sectionName` in [hooks/register.ts](hooks/register.ts)):

| Working folder | Section |
| --- | --- |
| Matches an entry in `OVERRIDES` (longest match wins) | That entry's name |
| A temp folder or scratch workspace | `Scratch` |
| Your home folder itself | `Home` |
| Inside a git repo (including `.claude/worktrees/...`) | The repo root's folder name |
| Anything else | The folder's own name |

## Install

You don't need the `claude` command-line tool. The plugin runs inside the Claude Desktop app's **Code** tab, and you install it by editing one settings file.

1. Open your Claude settings file. On Windows it's `C:\Users\<you>\.claude\settings.json`. On macOS and Linux it's `~/.claude/settings.json`. If the file doesn't exist, create it containing `{}`.
2. Merge in these three entries. If a key such as `env` or `enabledPlugins` is already there, add to it instead of replacing it:

   ```json
   {
     "extraKnownMarketplaces": {
       "fixes-for-dumb-ui-decisions": {
         "source": {
           "source": "github",
           "repo": "TheFeloniousMonk/fixes-for-dumb-ui-decisions-by-the-claude-team"
         }
       }
     },
     "enabledPlugins": {
       "folder-sections@fixes-for-dumb-ui-decisions": true
     },
     "env": {
       "CLAUDE_CODE_ENABLE_FUNCTION_HOOKS": "1"
     }
   }
   ```

   - `extraKnownMarketplaces` tells Claude where to find the plugin.
   - `enabledPlugins` turns the plugin on.
   - `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS` turns on the kind of hooks this plugin uses (`hooks/register.ts`). Without it, the plugin installs but does nothing.
3. Quit and reopen Claude Desktop, then start a new Code session. About 3 seconds after it starts, the session moves into a section named after its folder.

You can also paste the steps above into a Code session and ask Claude to make the edit for you.

### Installing from a local copy

To edit `OVERRIDES` before you install, download or clone this repo. Then use a `directory` source in place of the `github` one in step 2. The marketplace name and `enabledPlugins` stay the same:

```json
"fixes-for-dumb-ui-decisions": {
  "source": {
    "source": "directory",
    "path": "C:\\Users\\you\\code\\fixes-for-dumb-ui-decisions-by-the-claude-team"
  }
}
```

On Windows, write each backslash in the path twice, as shown. On macOS and Linux, use a normal path such as `/Users/you/code/fixes-for-dumb-ui-decisions-by-the-claude-team`.

### Terminal alternative

If you use the `claude` CLI, you can install from a terminal session with `/plugin install folder-sections --marketplace TheFeloniousMonk/fixes-for-dumb-ui-decisions-by-the-claude-team` and pick the **user** scope. That command doesn't work in the desktop app's Code tab. You still need the `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS` setting from step 2.

## Configure

All settings are constants at the top of [hooks/register.ts](hooks/register.ts):

| Constant | Default | Meaning |
| --- | --- | --- |
| `KEEP` | `5` | Sessions kept per section before the rest move to `OLDER` |
| `OLDER` | `'Older'` | Name of the overflow section |
| `DELAY_MS` | `3000` | How long after session start it files the session |
| `OVERRIDES` | `{}` | Folder → section name rules (see below) |

### OVERRIDES

Ships empty. Add entries when two projects share a folder name (otherwise both would land in the same section), or when you want a section called something other than the folder name. Keys are full paths on **your** machine; matching is case-insensitive, either slash style, and covers subfolders.

```ts
export const OVERRIDES: Record<string, string> = {
  'C:/Users/you/code/client-a/api': 'api (client-a)',
  'C:/Users/you/code/client-b/api': 'api (client-b)',
  '/home/you/work/monorepo': 'Monorepo',
}
```

After editing, restart Claude Desktop so the change takes effect. This only works for a local-copy install: a GitHub install uses the repo's version of the file.

## Troubleshooting

The plugin logs each decision to `~/.claude/folder-sections.log` (on Windows, `C:\Users\<you>\.claude\folder-sections.log`). Sessions started from a plain terminal or with `claude -p` have no sidebar and are logged as `skipped`. A session started by another session is nested under its parent and follows it.

## Sorting your existing sessions (one-time)

The plugin only files **new** sessions. To sort the sessions already in your sidebar, paste the prompt below into a Code session in the desktop app. First replace the two placeholders:

- `<BACKUP_PATH>`: where to save a backup of your current sidebar, e.g. `C:\Users\you\.claude\sidebar-backup.json` or `~/.claude/sidebar-backup.json`.
- `<REGISTER_TS_PATH>`: the full path to this plugin's `hooks/register.ts`. For a local copy that's `<repo>/folder-sections/hooks/register.ts`. For an install from GitHub, Claude keeps a copy at `~/.claude/plugins/cache/fixes-for-dumb-ui-decisions/folder-sections/<version>/hooks/register.ts`.

It stops at a checkpoint before changing anything, so you can review the mapping first.

```text
Using the mcp__ccd_sidebar tools (load them with ToolSearch), reorganize my Code sidebar by project folder. Work in this order and stop to show me the results at each checkpoint.

1. Back up the current sidebar state (all sections, their sessions, and view settings) to <BACKUP_PATH> and confirm the file exists.
2. Read <REGISTER_TS_PATH> and use its sectionName function and OVERRIDES table as the exact rules for naming each session's section. Then list every session with its working folder and the section name those rules produce. Flag any archived sessions, nested side sessions, routine runs, and sessions with no local folder. Checkpoint: show me the folder → section mapping and the existing manual sections before changing anything.
3. After I confirm: for each section name, reuse an existing manual section if one matches (case-insensitive), otherwise create one. Create new sections in alphabetical order, one at a time.
4. Move every session into its section with move_sessions, at most 100 per call. Skip nested sessions (they follow their parent), routine runs, and anything without a local folder. Don't touch Pinned or Routines.
5. Report how many sessions went into each section and list anything you skipped or couldn't move.
```

To undo, ask Claude to restore the sidebar from the backup file.

## Development

These are optional checks for people changing the plugin. They need the `claude` CLI, but using the plugin doesn't.

```
claude plugin validate folder-sections
claude plugin test folder-sections
```

## License

MIT
