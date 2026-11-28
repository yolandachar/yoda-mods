# Yoda mods

My Claude Code desktop mods:

- `valley-theme`: the Nordic valley theme, 🏡 Yoda's Studio, ☕ Yoda's Daily and ✨ Yoda's Prompt Assistant
- `quota-band`: the 5-hour, Weekly and Context usage row above the prompt

## Set up a Mac

1. Get the code into `~/.claude/yoda-mods`:

   ```bash
   git clone <this repository's URL> ~/.claude/yoda-mods
   ```

2. Tell Claude Code to load the mods in every conversation. Create `~/.claude/settings.json` with this content, or add the `env` entry if the file already exists:

   ```json
   {
     "env": {
       "CLAUDE_CODE_PLUGIN_DIRS": "~/.claude/yoda-mods/valley-theme:~/.claude/yoda-mods/quota-band"
     }
   }
   ```

3. Use the shared Claude rules (`CLAUDE.md` in this repository) on this Mac too. If `~/.claude/CLAUDE.md` already exists, merge it into the repository's copy first:

   ```bash
   ln -s yoda-mods/CLAUDE.md ~/.claude/CLAUDE.md
   ```

4. Turn on iCloud Drive (same Apple ID on both Macs). ☕ Yoda's Daily keeps its shared records in `iCloud Drive/Yoda/`.

5. Open a new Claude conversation.

## Update

On the Mac where you changed a mod:

```bash
cd ~/.claude/yoda-mods && git add -A && git commit -m "Update mods" && git push
```

On the other Mac:

```bash
cd ~/.claude/yoda-mods && git pull
```

Then open a new conversation, or reopen the current one.

## What syncs where

| What | How |
| --- | --- |
| Mod code and the shared Claude rules (CLAUDE.md) | this repository (git push / git pull) |
| Daily water, restroom, eye-rest and stand-up records | iCloud Drive: one file per Mac, merged when shown |
| Daily settings | iCloud Drive: the latest change wins |
| Reminder timers, weather cache, outfit of the day | each Mac on its own |
| Studio tasks | each Mac on its own (it reads that Mac's Claude sessions) |

Nothing here uses Claude usage: the sync is plain files.
