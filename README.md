# Costa Vista

Costa Vista is an original open-world crime game set in a sun-soaked coastal city. It runs in the browser with no build step, no external libraries and no network requests. Mari Aguilar works out of her uncle Rudy's garage in Old Harbor while the Palma Syndicate moves in on the harbor. Play through five story jobs, drive the boulevards, handle the police heat and explore in free roam.

## Status

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![rank](https://make.fun/badge/gta6-01/0xcqing/costa-vista/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard)
[![reward](https://make.fun/badge/gta6-01/0xcqing/costa-vista/reward.svg)](https://make.fun/bounty/gta6-01)

## Controls

- `W A S D` move on foot or drive
- `Mouse` aim
- `Left Mouse` shoot
- `Shift` sprint
- `E` enter or exit a vehicle
- `F` steal an occupied car
- `Space` handbrake while driving
- `Escape` pause
- `M` mute sound
- `Enter` confirm menus and mission briefings

## Play locally

```powershell
node serve.ts
```

Open the localhost address printed by the command in a browser. The game entry is `game/index.html`.

## Hand in

```powershell
$env:MAKEFUN_OUTPUT_DIR = "out"
node main.ts
```

This copies `game/` and `screenshots/` into the output directory and writes `dossier.json` with the vendored make.fun helper.
