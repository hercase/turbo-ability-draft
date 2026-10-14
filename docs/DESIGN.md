# Turbo Ability Draft — Design

Living document. It records decisions, open questions, and assumptions that still need verification.
Update it whenever a decision is made or changed.

## Concept

Each player builds one hero through an ability draft, played under Turbo rules. A second mode, based on
Dota's official "Mid Only" mode, is planned.

- Display name and Workshop title: **Turbo Ability Draft** (decided 2026-10-14, see "Workshop name").
- Addon name: `turbo_ability_draft` (Valve requires lowercase, digits and underscores)
- Base: [ModDota/TypeScriptAddonTemplate](https://github.com/ModDota/TypeScriptAddonTemplate) (MIT).
- License: proprietary, all rights reserved. Third-party code (ModDota template, barebones timers) is
  credited in `THIRD_PARTY_NOTICES.md` with its license texts in `licenses/`.

## Positioning

**The official Ability Draft you already know, at Turbo speed, always up to date with the latest
patch**, plus a Mid Only mode. Free, with no donations or paid features.

Target player: someone who already plays official Ability Draft and wants shorter games (players ask
for "Turbo Ability Draft" on the Steam forums and Valve has not built it).

| | keymil's "ABILITY DRAFT TURBO 10vs10" | Turbo Ability Draft |
| --- | --- | --- |
| Format | 10 vs 10 | 5 vs 5 |
| Draft | Own rules (abilities, then innate + extra facet, then talents) | Identical to the current official mode |
| Turbo | Own values | Official Turbo rules |
| Extras | Periodic ability upgrades, Golden Treasures | Draft card info, reconnect, lobby options |
| Other modes | None | Mid Only (1v1 / 2v2 / 3v3) |
| Patches | Data maintained by hand (last update April 2026) | Reads Dota's data at runtime |
| Price | Patreon, Boosty, PayPal | Free |

Suggested Workshop subtitle: "Official Ability Draft rules at Turbo speed. Always up to date with the
latest patch."

## Modes

Both modes ship in the first release and are chosen by vote during the setup phase.

| Mode | Map | Win condition |
| --- | --- | --- |
| **Classic** | Default Dota map | Destroy the Ancient |
| **Mid Only** | Default Dota map, creeps only in the middle lane | Destroy the Ancient (official Mid Only rule) |

## Build order

1. Draft + Turbo rules on the default map: `dota_launch_custom_game turbo_ability_draft dota`.
2. Mid Only (not started yet).

## Mid Only

Decision (2026-10-14): instead of a custom Overthrow-style arena, the second mode is based on Dota's
official modes on the default map, so it needs no map work and follows patches automatically.

- Official "Mid Only" (private lobbies): creeps spawn only in the middle lane, duplicate heroes
  allowed, any number of players, the game ends when an Ancient falls.
- Official "1v1 Solo Mid": first to 2 kills or first tower wins, side towers are invulnerable, the
  first runes do not spawn, each player gets a free courier.
- Ours: 1v1, 2v2 and 3v3 with the same draft and Turbo rules.
- Win condition (decided 2026-10-14): **destroy the Ancient**, as in the official mode. It works for
  every team size without tuning, allows comebacks, and does not favor early-game burst builds the
  way a kill race would. A kill race may come later as a lobby option.
- Risks for 2v2 and 3v3: one creep wave split among several heroes slows leveling (Turbo helps; extra
  gold/XP or creeps per team size could compensate), and a group push takes a tower fast. Tune in
  playtests; drop 3v3 if it is not fun.
- A custom Overthrow-style arena stays as a possible future mode (Valve ships Overthrow's maps as
  examples).

## Draft

**Decision (2026-10-14): the draft is identical to Dota's current official Ability Draft**: same
pool, hero drafting, pick order, timings, limits, innate and talent rules, and screens. Our mode
adds Turbo rules on top; the draft itself is not reinvented.

- The hero is drafted as one of the picks (official rule since 7.39).
- Each player ends with **3 regular abilities + 1 ultimate**.
- Snake pick order and official timings (`draft` section of the config). The timings in the config
  come from the pre-7.39 rules and must be checked against the current official mode, which added
  the hero pick.
- Innate abilities and talents follow the official rules (unrelated talents become gold).
- Faster alternatives (simultaneous rounds, random hero) remain possible as config options
  (`pickMode`, `heroSelection`) but are not the default.
- The detailed flow (states and Panorama UI) is proposed separately before any code is written.

## Official Ability Draft reference

Source: [Dota 2 Wiki, Ability Draft](https://dota2.fandom.com/wiki/Ability_Draft) (read 2026-10-14),
cross-checked against the game files of the Dota client (SteamTracking mirror, 2026-10-13).
**The wiki page is outdated on hero selection and facets:**

- **Since 7.39 (May 2025)** players draft their base hero as one of the picks, at any point of the
  normal draft phase; each hero card showed its facets
  ([esports.gg](https://esports.gg/news/dota-2/5-things-we-love-about-dota-2-patch-7-39-ability-draft/),
  [BLAST](https://blast.tv/dota/news/dota-2-patch-739-spring-forward-gameplay-update)). 7.39 also
  fixed many ability interactions and added minigames while queuing. Exact pick counts and timings
  after this change are not verified.
- **Since 7.41 facets no longer exist** ("Facets removed from the game" in the client's patch notes).

The rest of this section describes the pre-7.39 rules from the wiki:

- **Pool**: every player gets a random hero with no abilities. The pool holds the abilities of those
  10 heroes plus 2 extra heroes that are not played: 48 regular abilities and 12 ultimates, on a
  shared board.
- If a hero has an unavailable ability, a replacement ability from another random hero is added.
  Only one hero needing a replacement can be in the pool.
- **Order**: player slots are shuffled within each team. 4 picking phases; phases 1 and 3 go
  R1 D1 R2 D2 ... R5 D5, phases 2 and 4 go D5 R5 ... D1 R1.
- **Timing**: 60 s planning (everyone sees heroes and pool), 7 s per pick (the full 7 s always
  elapse), 5 s break after each phase, then 5 s and a 30 s strategy phase. Total 6:35.
  A player who does not pick gets a random ability from the remaining pool.
- **Limits**: up to 3 regular abilities and 1 ultimate per player.
- **Talents**: talents tied to abilities the hero did not draft become instant gold
  (250 / 500 / 750 / 1250 by tier). A few unique talents stay.
- **Engine adaptations** (not available to custom games for free): Invoker's 10 `_ad` abilities (3
  random per draft, Quas/Wex/Exort become passive buffs), abilities using several slots (only
  ultimates may use up to 3 slots), Aghanim's Scepter/Shard abilities bound to drafted ultimates, and
  per-ability fixes (e.g. Meepo's Poof cast range, Lich's Sinister Gaze).
- Unavailable abilities listed by the wiki include Tempest Double, Divided We Stand, Morph,
  Multicast, Spell Steal and Invoke.

## Valve data we rely on

- Hero files `scripts/npc/heroes/npc_dota_hero_*.txt` hold each hero and, under
  `AbilityDefinitions`, its abilities. `npc_abilities.txt` only holds generic abilities. Ability IDs
  live in `npc_ability_ids.txt` (`DOTAAbilityIDs > UnitAbilities > Locked`).
- Each hero has an **`AbilityDraftAbilities`** block listing the abilities it brings to the official
  pool. Excluded abilities are simply missing (e.g. Ogre Magi lists Fireblast, Ignite, Bloodlust but
  not Multicast). There is no `AbilityDraftDisabled` flag.
- **`AbilityDraftExtraAbilities`** (inside ability definitions) binds Scepter/Shard abilities to an
  ability, e.g. `"crystal_maiden_crystal_clone" "shard"`. `AbilityDraftUltShardAbility` also exists.
- Runtime access: `GetUnitKeyValuesByName`, `GetAbilityKeyValuesByName` and `LoadKeyValues` exist
  in the vscripts API. Prefer the first two: they do not depend on how Valve splits its files.

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
- Starting point: Valve's official pool, read at runtime from each hero's `AbilityDraftAbilities`
  (`abilities.useValveDraftPool`), so Valve's exclusions apply without copying them. Our blacklist
  is applied on top and grows from playtests.

## Patch resilience

- Read Dota's base data at runtime (`GetUnitKeyValuesByName`, `GetAbilityKeyValuesByName`). Never copy
  Valve's KV data into the repo.
- All our rules, exclusions and overrides live in a single file:
  [`src/vscripts/config/game_config.json`](../src/vscripts/config/game_config.json). It is plain JSON so
  both the game scripts (compiled by TSTL) and Node tooling can read it.
- `npm run abilities:diff` compares the current Dota data against a committed snapshot holding only
  **ability names, IDs and each hero's official draft pool** (`src/vscripts/config/ability_snapshot.json`).
  It reports added, removed and renamed abilities (matched by ID), draft pool changes, and config
  entries that point to abilities that no longer exist. The first snapshot was generated from the
  SteamTracking mirror (2026-10-13); regenerate it from the local install once on Windows.
- The snapshot also records the Dota version it was taken from (gameplay patch from the bundled patch
  notes, client build from `steam.inf`). Current baseline: **Dota 7.41f, build 6958 (Oct 12 2026)**.
- After every Dota patch follow the checklist in the README ("After a Dota patch").

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

## Roadmap

- **v0.2**: official Ability Draft (identical rules and screens) + Turbo rules on the default map.
- **v0.3**:
  - Draft cards show Aghanim's Scepter/Shard upgrades and abilities that need a partner ability.
  - Reconnect without losing hero or picks.
  - Loading screen tips and a "GameInfo" rules tab.
- **Lobby options** (off by default):
  - Draft hints: synergies and win rates on the cards.
  - Surrender vote.
  - Catch-up mechanics: leader bounty and comeback gold.
- **Localization**: English only for now.
- **Mid Only**: after the Classic mode is solid.

Decided against (2026-10-14), to stay faithful to the official mode:

- No bots filling empty slots and no custom end screen (for now).
- No bans or rerolls (the official mode has none).
- No combo blocking (the official mode has none). A combo that breaks the game in playtests is fixed
  with a balance override, or as a last resort with the blacklist.
- No fast draft by default.

Context from the research pass (2026-10-14): official AD is seen as slow and its queues are empty;
players install overlays (Ability Draft Plus) for synergy and win-rate hints; the official UI hides
Scepter/Shard upgrades behind Ctrl+Alt. Ability Arena shut down after Valve banned monetization
(Aug 2023) because it had server costs, so avoid paid backends. Valve can pull Workshop items without
notice (Overthrow 3.0, Jul 2026): keep backups and a community channel.

## Workshop name

Decision (2026-10-14): **Turbo Ability Draft**, with no patch number in the title.

- Keeps both official mode names (Turbo + Ability Draft), which is what players search for.
- No patch number: the Arcade list already shows "Updated <time>" next to every title, and the game
  page has an UPDATES section with dated notes. None of the top 10 Arcade games puts a version in its
  title, and long titles get cut off.
- Optional short subtitle explaining the mode, as the top Arcade game does ("OMG 4+2: New ability
  draft"), e.g. "Turbo Ability Draft: Official rules". Undecided, can be added at any time.
- Our version and the Dota patch go in the Workshop Change Log (shown under UPDATES) and, later, in
  the in-game GameInfo tab.
- Titles can be edited on any update without losing the item ID, link, subscribers or comments; keep
  the base name stable.

Arcade "Active Games" on 2026-10-14 (players now): OMG 4+2: New ability draft 24,308; DOTA AUTO CHESS
15,091; Custom Hero Chaos 4,952; Guarding Athena 3,824; Dota 1x6 2,735. An ability draft mode is the
most played custom game; keymil's mod is not in the top 10.

Findings from the Workshop's top 90 custom games by subscribers (2026-10-14): short names that say
what the mode is (Overthrow, Pudge Wars, Dota Run), "Dota" + concept (Dota IMBA, Dota 10v10), an
explanatory subtitle ("Pudge Wars (1 hook = 1 kill)"), and a patch number (Legends of Dota 7.41).
Ability-building modes have demand: DOTA OMG 4+2 has 2.1M subscribers and Legends of Dota 1.3M;
keymil's mod has 22k. "Ability Draft Reborn" is already taken (102k, abandoned since 2016).

## Similar mods (ideas only, no code)

- Custom Hero Chaos (long-running top Arcade mode): limited agency (1 hero ban, 1 skill ban,
  rerolls) plus comeback tokens keep an unbalanced game fun.
- Legends of Dota Redux: ability/hero bans, blocked troll combos, a point-budget balance mode and a
  separate "all allowed" map.
- OMG 4+2 ("New ability draft"): the most played Arcade game on 2026-10-14 (24k players). Study how
  its draft screen and pacing work (ideas only).
- keymil's "ABILITY DRAFT TURBO 10vs10" (Workshop, about 22k subscribers, monetized): drafts 3
  regular + 1 ultimate, then innate + an extra facet, then talents. Its Turbo: -25% cooldowns and
  mana costs, 2x gold and XP, -50% respawn and buyback cooldown. Periodic ability upgrades every
  4 minutes and Golden Treasures every 6 minutes. Its values are its own, not Valve's Turbo.
- Lozrantekh's "Ability Draft Turbo for Friends": a re-upload of keymil's mod, published without a
  license. Not usable.
- keymil's mod is active as of 2026-10-14: 22,111 Workshop subscribers, a Discord with 2,495 members
  (621 online), updates through April 2026.
- The name "Turbo Ability Draft" (Turbo + Ability Draft, the two official modes combined) is very close
  to keymil's. Both words are generic Dota terms, so it stays; the difference comes from the
  positioning (see "Positioning" and "Workshop name").

## Rules for the codebase

- Original code only. Other mods (keymil's, Lozrantekh's fork, Legends of Dota, Poelsemix) may be
  studied for ideas but not copied.
- No monetization.
- The repository stays private until it has been validated with friends.
- Code, comments, commits and docs are written in English.

## Open questions

Decide before implementing:

- [ ] Optional Workshop subtitle (see "Workshop name"). Not blocking.

## Unverified assumptions

Check before relying on them:

- [x] The template compiles with current tooling (`npm run build` / `npm run dev` pass, 2026-10-14).
- [ ] The template runs in the current Dota client (needs an in-game test on Windows).
- [ ] Mid Only: side lane creeps can be disabled and side towers made invulnerable from vscripts.
- [ ] Whether publishing requires copying `maps/dota.vpk` into the addon (and re-copying it after map
      changes). Our repo still needs a `game/addoninfo.txt` declaring the `dota` map.
- [ ] (Future arena mode only) Where Overthrow's source content lives today: check `game/dota_addons/` in the local install and
      the "Create New Addon From Existing Addon" dialog. The SteamTracking mirror of the Dota client
      (2026-10-13) still ships `overthrow` among the example addons, with its Panorama sources in
      `content/dota_addons/overthrow/`; whether its map sources are included is unknown.
- [ ] The name "Turbo Ability Draft" is free on the Workshop.
- [ ] Valve's UIs (team/hero selection, scoreboards in `content/dota/panorama/*`) are still available.
      The wiki (2026-04) still references `team_select.xml` and `multiteam_top_scoreboard.xml`; confirm
      in game.
- [ ] State of the Arcade servers. Local testing comes first.
- [x] Layout of Dota's ability data: per-hero files with `AbilityDefinitions`, IDs in
      `npc_ability_ids.txt` (checked against the 2026-10-13 client files).
- [x] Valve's Ability Draft KV data: `AbilityDraftAbilities`, `AbilityDraftExtraAbilities`,
      `AbilityDraftUltShardAbility`; no `AbilityDraftDisabled` flag.
- [ ] `GetUnitKeyValuesByName` returns the `AbilityDraftAbilities` block in game.
- [ ] Current official draft details after 7.39: number of phases, pick timer, when the hero pick
      happens, and how the hero pool is built. Play or watch a current Ability Draft match.
- [ ] Whether a custom game can run on top of Valve's official Ability Draft mode (its UI and engine
      adaptations) and only add Turbo rules. Test on Windows before building our own draft screen.
