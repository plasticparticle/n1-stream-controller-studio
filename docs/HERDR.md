# herdr deck

N1 Stream Controller Studio turns the N1 into a control panel for
[herdr](https://herdr.dev), the terminal workspace manager for coding agents. The
deck shows which agents need you, takes you there with one press, and answers
approval prompts without leaving the current window.

## How it starts

Studio watches herdr's API socket (`~/.config/herdr/herdr.sock`, or
`HERDR_SOCKET_PATH`). As soon as the herdr server is reachable, the N1 switches to
the **herdr** profile. When herdr stops, the N1 returns to the profile you were
using before.

To keep the profile without automatic switching, turn **herdr** off in the profile
rotation strip, or set `"autoSwitch": false` in the deck configuration.

Studio must be running; enable **Start on login** to make the deck follow herdr from
the first login.

## Layout

| Keys | Function |
| --- | --- |
| 1–10 | One key per herdr workspace, in sidebar order |
| 11 | **Next**: jump to the agent that needs you longest |
| 12 | **Approve**: answer a waiting approval prompt |
| 13 | **Back**: return to the previous workspace |
| 14 | **New**: start an agent beside the focused pane |
| 15 | Optional slot, **Dictate** by default |
| Status 1 | Profile button |
| Status 2 | Visible workspace range; the page button shows the next ten workspaces |
| Status 3 | Agents working, waiting, and done |
| Dial | Turn to step through workspaces, press for **Next** |

While the focused agent waits for an answer, keys 11–14 and the dial answer its
dialog instead; see [Answering a dialog](#answering-a-dialog).

### Workspace keys

Each workspace key shows the workspace name and a row of dots along the top: one
dot per pane. A pane running an agent is a filled dot in the agent's state color; a
plain shell is an empty ring. Dots of waiting agents pulse, and a highlight runs
across working ones. More than seven panes end in a count such as `+3`. The key
color follows the most urgent agent:

| Look | Meaning | Press |
| --- | --- | --- |
| Red, pulsing `!` | An agent waits for approval or an answer | Focus that agent |
| Green `✓` | An agent finished and its result has not been seen | Focus that agent |
| Amber spinner | An agent is working | Focus the workspace |
| Blue `○` | Agents are idle | Focus the workspace |
| Grey | No agent in the workspace | Focus the workspace |

The workspace currently focused in herdr is filled with its status color and framed
in white. Agent states come from
herdr's own detection: `blocked`, `done`, `working`, `idle`, and `unknown`.

### Panes of a workspace

Hold a workspace key for half a second to list its panes on keys 1–9, in tab order.
Each pane key shows the tab (`T1`), the agent (or `SHELL`), and the agent state
(`WAITING`, `WORKING`, `DONE`, `IDLE`) in color, symbol, and text; shells show their
terminal title. The focused pane is filled. Press a pane to focus it. Key 10 shows
the workspace itself with its state and pane dots, and closes the list, as does holding any workspace key again, the page button, or 15
seconds without a press. Status display 2 names the workspace while the list is
open.

Workspace keys act when released, so a short press still jumps to the workspace.

Every action that changes focus also raises the terminal running the herdr client,
through `hyprctl` on Hyprland or `wmctrl` on X11 desktops.

### Next

Next works through a queue: blocked agents first, then finished ones, each oldest
first. The key shows how many agents are waiting and which workspace comes next.

### Approve

Approve presses Enter in the approval prompt of the focused agent when it is blocked,
otherwise in the prompt of the agent that has been blocked longest. The key names the
workspace it will answer. Studio asks herdr for the agent's live state immediately
before sending the key and refuses when the agent is no longer blocked, so a stale
display never answers a different prompt.

Enter accepts the default choice of the agent's dialog. Read the prompt first with
**Next** whenever the change matters.

### Answering a dialog

When the agent you are looking at stops with a question, such as a permission
prompt or a list of options, the N1 switches its action keys to dialog controls:

| Key | Control | Shows |
| --- | --- | --- |
| 11 | **Up** | The option above the highlighted one |
| 12 | **Down** | The option below the highlighted one |
| 13 | **Select** (Enter) | The highlighted option and its position, such as `2/3` |
| 14 | **Cancel** (Esc) | |
| Dial | Turn to move through the options, press to select | |

Status display 2 shows the highlighted option. Studio reads the options from the
agent's screen, so they follow whatever numbered list the agent draws (Claude Code,
Codex, and similar). When no list can be read, the keys still send Up, Down, Enter,
and Esc. Every control first checks that herdr still reports the agent as waiting.

The keys return to Next, Approve, Back, and New as soon as the agent continues or
you focus another pane. The optional slot keeps its action. Approve stays useful
for agents waiting in the background.

### Dictate

Dictate uses the voice mode of Claude Code. Press it once to start recording in the
focused Claude Code agent and again to stop; Claude Code transcribes the recording
and submits it. While recording, the key turns red and pulses with `REC` and the
workspace name. The second press always goes to the agent that is recording, even
after you moved to another pane. The key is disabled for other agents (`CLAUDE
ONLY`) and while the agent waits at a dialog.

The key sends Space, which Claude Code binds to push-to-talk. Claude Code must use
tap mode, because the N1 can send a key press but cannot hold a key down. Add this
to `~/.claude/settings.json` once:

```json
"voiceEnabled": true,
"voice": { "enabled": true, "mode": "tap" }
```

Tap mode also changes the Space key on the keyboard from hold-to-talk to
tap-to-talk. Studio forgets a recording when the agent starts working or after three
minutes, so a recording stopped at the keyboard does not leave the key stuck on
`REC` for long.

Codex has no comparable dictation for its terminal interface; its `/voice` command
starts a spoken conversation instead.

### New

New splits the focused herdr pane to the right in the same working directory and
starts `newAgentKind` there (Claude by default). Studio names these agents
`n1-<id>`.

## Configuration owned by herdr

The deck layout belongs to herdr, not to Studio. Studio reads it from herdr's plugin
configuration directory:

```text
~/.config/herdr/plugins/config/n1-studio/deck.json
```

Install the bundled plugin once so herdr seeds that file when its server starts:

```bash
herdr plugin link "$PWD/integrations/herdr"
```

Studio uses the built-in default when the file is missing, and picks up edits
without a restart. An invalid file falls back to the default; the error appears in
the herdr state that Studio reports.

```json
{
  "version": 1,
  "newAgentKind": "claude",
  "autoSwitch": true,
  "keys": [
    "workspace", "workspace", "workspace", "workspace", "workspace",
    "workspace", "workspace", "workspace", "workspace", "workspace",
    "attention", "approve", "back", "new-agent",
    { "action": "dictate", "optional": true }
  ]
}
```

| Field | Meaning |
| --- | --- |
| `keys` | Exactly 15 entries, one per key |
| `newAgentKind` | herdr agent kind started by **New**, such as `claude` or `codex` |
| `autoSwitch` | Switch the N1 to the herdr profile when herdr starts |

A key entry is an action name, `null` for a free slot, or an object with `action` and
`optional`. Actions: `workspace`, `attention`, `approve`, `back`, `new-agent`,
`interrupt`, `dictate`, `next-workspace`, and `previous-workspace`. Workspace keys are numbered
in the order they appear.

## What Studio may change

Managed keys are locked in the editor. Only optional slots and free slots accept
other actions, colors, or icons. The herdr actions are also available in the AI
catalogue, so any other profile can include them.

The herdr profile has a single page; the page button scrolls through workspaces
instead. Reset restores the deck from herdr's configuration. The profile cannot be
deleted; remove it from the rotation instead.

## Troubleshooting

- **Keys show HERDR OFF.** Studio cannot reach the herdr socket. Check
  `herdr status`; named sessions need `HERDR_SOCKET_PATH` in Studio's environment.
- **Keys do not change color.** Run `herdr agent list` to confirm that herdr detects
  the agents. `herdr integration status` shows whether agent integrations are
  installed.
- **The terminal does not come to the front.** Install `wmctrl` on X11 desktops.
  Hyprland uses `hyprctl`.
