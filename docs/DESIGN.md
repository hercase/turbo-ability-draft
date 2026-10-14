# Turbo Ability Draft — Design

Living document. It records decisions, open questions, and assumptions that still need verification.
Update it whenever a decision is made or changed.

## Concept

Each player builds one hero through an ability draft, played under Turbo rules. A second, Overthrow-style
arena mode ("Solo Mid") is planned.

- Display name: **Turbo Ability Draft**
- Addon name: `turbo_ability_draft` (Valve requires lowercase, digits and underscores)
- Base: [ModDota/TypeScriptAddonTemplate](https://github.com/ModDota/TypeScriptAddonTemplate) (MIT).
- License: proprietary, all rights reserved. Third-party code (ModDota template, barebones timers) is
  credited in `THIRD_PARTY_NOTICES.md` with its license texts in `licenses/`.

## Modes

Both modes ship in the first release and are chosen by vote during the setup phase.

| Mode | Map | Win condition |
| --- | --- | --- |
| **Classic** | Default Dota map | Destroy the Ancient |
| **Solo Mid** | Custom arena map built in Hammer (starting from Valve's examples) | First team to N kills (1v1, 2v2, 3v3) |

## Build order

1. Draft + Turbo rules on the default map: `dota_launch_custom_game turbo_ability_draft dota`.
2. Solo Mid arena (not started yet).

## Draft

- Each player starts with a random hero.
- Picks are simultaneous, with short timers.
- Each player ends with **3 regular abilities + 1 ultimate**.
- The detailed flow (states and Panorama UI) is proposed separately before any code is written.

## Turbo rules

- 2x gold and XP.
- Shorter respawn times.
- Weaker towers.
- Personal courier for each player.

Exact values must be checked against the current patch before implementation. Until then, the
`turbo` section of the config holds `null` placeholders.

## Problematic abilities

- **Blacklist**: abilities that depend on their original hero or on other abilities. Configured in
  the config with a reason for each entry.
- **Overrides**: balance changes for abilities that break the game. Configured per ability with a
  reason.
- Starting point: the exclusions used by Valve's official Ability Draft. Where possible these are read
  from Valve's own KV flags at runtime instead of being copied (see `abilities.honorValveAbilityDraftFlags`).
  The list grows from playtests.

## Patch resilience

- Read Dota's base data at runtime with `LoadKeyValues`. Never copy Valve's KV data into the repo.
- All our rules, exclusions and overrides live in a single file:
  [`src/vscripts/config/game_config.json`](../src/vscripts/config/game_config.json). It is plain JSON so
  both the game scripts (compiled by TSTL) and Node tooling can read it.
- `npm run abilities:diff` compares the current Dota ability list against a committed snapshot of
  ability **names and IDs only** (`src/vscripts/config/ability_snapshot.json`) and reports added,
  removed and renamed abilities, plus config entries that point to abilities that no longer exist.
  Renames are detected by matching the ability `ID`.

## Panorama UI (Valve docs)

From the Valve wiki page "Custom UI Manifest" (last edited 2026-04-13):

- The UI root is `content/dota_addons/turbo_ability_draft/panorama/layout/custom_game/custom_ui_manifest.xml`.
  It registers layouts through `CustomUIElement` entries (`type` + `layoutfile`); several entries of the
  same type stack in manifest order.
- Inline `<script>` tags are no longer allowed in the manifest. Logic goes in separate files pulled in
  with `<scripts><include src="..."/></scripts>` (the template already does this).
- Element types: `Hud`, `HeroSelection`, `GameInfo` (the "i" tab, from setup onwards), `GameSetup`
  (team select and voting; Valve's default is `layout/custom_game/team_select.xml`), `FlyoutScoreboard`,
  `HudTopBar` (also visible in the end-game state), `EndScreen`.
- Default Dota UI parts can be hidden with `GameUI.SetDefaultUIEnabled(DotaDefaultUIElement_t.*, false)`;
  toggling them dynamically may misbehave.
- Custom loading screens are handled differently from other elements (not documented on that page).
  Valve's example addons use `panorama/layout/custom_game/custom_loading_screen.xml`; Overthrow's
  background image is 1920x1080.

Consequences for us: the mode vote fits in a `GameSetup` element, the draft could live in a
`HeroSelection` element (instead of a stretched pre-game), and `GameInfo` can explain the rules.

## Rules for the codebase

- Original code only. Other mods (keymil's, Lozrantekh's fork, Legends of Dota, Poelsemix) may be
  studied for ideas but not copied.
- No monetization.
- The repository stays private until it has been validated with friends.
- Code, comments, commits and docs are written in English.

## Open questions

Decide before implementing:

- [ ] Do innate abilities, facets and talents enter the draft?
- [ ] Kills to win in Solo Mid for each team size (1v1 / 2v2 / 3v3).

## Unverified assumptions

Check before relying on them:

- [x] The template compiles with current tooling (`npm run build` / `npm run dev` pass, 2026-10-14).
- [ ] The template runs in the current Dota client (needs an in-game test on Windows).
- [ ] Where Overthrow's source content lives today: check `game/dota_addons/` in the local install and
      the "Create New Addon From Existing Addon" dialog. The SteamTracking mirror of the Dota client
      (2026-10-13) still ships `overthrow` among the example addons, with its Panorama sources in
      `content/dota_addons/overthrow/`; whether its map sources are included is unknown.
- [ ] The name "Turbo Ability Draft" is free on the Workshop.
- [ ] Valve's UIs (team/hero selection, scoreboards in `content/dota/panorama/*`) are still available.
      The wiki (2026-04) still references `team_select.xml` and `multiteam_top_scoreboard.xml`; confirm
      in game.
- [ ] State of the Arcade servers. Local testing comes first.
- [ ] Layout of Dota's ability data (single `npc_abilities.txt` vs. per-hero files pulled in with `#base`).
      The diff script's KV reader handles both.
- [ ] Names of Valve's Ability Draft KV flags (e.g. `AbilityDraftDisabled`).
