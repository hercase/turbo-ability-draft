# Turbo Ability Draft

A Dota 2 custom game. Each player builds one hero through an ability draft, played under Turbo rules.
A Mid Only mode (1v1 / 2v2 / 3v3 in the middle lane) is planned.

Addon name: `turbo_ability_draft`. Status: early development, private.

- Design decisions, open questions and unverified assumptions: [docs/DESIGN.md](docs/DESIGN.md)
- Rules for contributors and AI agents: [AGENTS.md](AGENTS.md)

## Requirements

- Windows with Dota 2 and the Dota 2 Workshop Tools DLC installed.
- Node.js 18 or newer.

## Setup

```bash
git clone https://github.com/hercase/turbo-ability-draft.git
cd turbo-ability-draft
npm install
```

`npm install` runs [scripts/install.js](scripts/install.js), which links the addon into Dota:

1. It finds Dota through Steam (`dota 2 beta`).
2. It **moves** `game/` and `content/` into `<dota>/game/dota_addons/turbo_ability_draft` and
   `<dota>/content/dota_addons/turbo_ability_draft`.
3. It replaces them in the repo with directory junctions pointing to the new location.

After that, the real files live inside the Dota folder and the repo sees them through the junctions.
If Dota is not found (for example on macOS or in CI), linking is skipped and the build still works.

Manual linking, if you prefer to keep the files in the repo (run `cmd` from the repo root, and
replace the Dota path with yours):

```bat
mklink /J "C:\Program Files (x86)\Steam\steamapps\common\dota 2 beta\game\dota_addons\turbo_ability_draft" "%CD%\game"
mklink /J "C:\Program Files (x86)\Steam\steamapps\common\dota 2 beta\content\dota_addons\turbo_ability_draft" "%CD%\content"
```

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Compiles vscripts and Panorama and watches for changes (also `Ctrl+Shift+B` in VS Code). |
| `npm run build` | One-off compile. CI runs this. |
| `npm run launch` | Opens Dota 2 Workshop Tools with this addon. |
| `npm run abilities:diff` | Compares Dota's current abilities with the committed snapshot (see below). |

To start a game from the Dota console: `dota_launch_custom_game turbo_ability_draft dota`.

### Ability diff

```bash
npm run abilities:diff                       # read from the local Dota install
npm run abilities:diff -- --game-dir <dir>   # or from a folder with steam.inf and an extracted pak01_dir/
npm run abilities:diff -- --update           # accept the changes and rewrite the snapshot
```

It reports the Dota version (gameplay patch and client build), added, removed and renamed
abilities (renames are matched by ability ID), changes to each hero's official Ability Draft pool,
and config entries that point to abilities that no longer exist. It exits with code 1 when
something changed. The snapshot in `src/vscripts/config/ability_snapshot.json` records which Dota
version the project was last checked against.

## Versioning

- The project follows [semantic versioning](https://semver.org) from `0.x`; the version lives in
  `package.json`. Bump it and tag the commit (`v0.2.0`) for every build shared with playtesters.
- Commits follow Conventional Commits (see [AGENTS.md](AGENTS.md)), so the changelog can be built
  from them.
- The Dota version we support is the one recorded in the ability snapshot (`dota.patch` and
  `dota.build`).

## After a Dota patch

Most patches need no code changes: abilities, values and the official draft pool are read from the
game at runtime. Engine or API changes can only be caught by playing. After each patch:

1. Run `npm run abilities:diff` and review the report.
2. Fix blacklist or override entries for renamed or removed abilities.
3. Launch the game and play a short match, watching the console for errors.
4. Check the patch notes for Turbo changes that affect our Turbo values.
5. Run `npm run abilities:diff -- --update`, bump the version, and commit
   (`chore: update to Dota 7.xx`).
6. Re-publish to the Workshop only if something changed.

## Repository layout

| Path | Contents |
| --- | --- |
| `src/vscripts/` | Game logic in TypeScript, compiled to Lua in `game/scripts/vscripts/`. |
| `src/vscripts/config/` | `game_config.json` (all our rules, blacklist and overrides), its types, and the ability snapshot. |
| `src/panorama/` | UI scripts in TypeScript, compiled to `content/panorama/scripts/custom_game/`. |
| `src/common/` | Types shared by vscripts and Panorama (for example custom event payloads). |
| `game/` | Dota game folder: KV files and compiled Lua. |
| `content/` | Dota content folder: Panorama layouts, styles, images and compiled JS. |
| `scripts/` | Node tooling: install, launch, ability diff. |
| `docs/` | Design documentation. |
| `art/` | Source images (loading screen, Workshop preview). Game copies live in `content/`. |

## Author

Created by Hernan Case: [hercase.vercel.app](https://hercase.vercel.app).

## License

Proprietary, all rights reserved. See [LICENSE](LICENSE).
Third-party code and its licenses are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
