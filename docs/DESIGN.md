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

## Improvement backlog

From a research pass on 2026-10-14 (player complaints, similar mods, third-party AD tools). Nothing
here is decided; each item needs a design before implementation. Effort S/M/L, impact in brackets.

- **Fast draft as an optional lobby setting** (S, high; the default stays official): official AD is seen as slow and its queues are empty; players ask for
  Turbo AD and Valve has not built it ([Steam thread](https://steamcommunity.com/app/570/discussions/0/594017161232565803)).
- **Bots fill empty slots** (L, high), so a lobby never stalls; Arcade lobbies suffer from bots and
  low counts.
- **Combo rules** (M, high): block known broken pairs and mark abilities that need a partner
  (e.g. Eclipse without Lucent Beam). Legends of Dota Redux blocked "troll combos".
- **Native draft hints** (M, high): synergy, strong/trap combos and win rates on the cards. Players
  install overlays (Ability Draft Plus) because the official UI lacks this; we know the pool on the
  server.
- **Show Scepter/Shard upgrades on every card** (S, high): the official UI hides them behind Ctrl+Alt.
- **Bans and rerolls** (S, med): e.g. 1 ability ban per player, 1 pool reroll per team by vote.
- **Catch-up mechanics** (M, high): leader bounty, comeback gold; Overthrow-style deliveries in Solo Mid.
- **Disconnect handling** (M, high): keep hero and picks, bot control while away.
- **Conditional surrender vote** (S, med).
- **End screen** (M, med): builds, combo spotlight, MVP.
- **Loading screen tips and a "GameInfo" rules tab** (S, med).
- **Localization** (M, med): EN/ES/RU/ZH/PT.
- **No paid backend**: Ability Arena shut down after Valve banned monetization (Aug 2023) because it
  had server costs. Valve can also pull Workshop items without notice (Overthrow 3.0, Jul 2026):
  keep backups and a community channel.

## Similar mods (ideas only, no code)

- Custom Hero Chaos (long-running top Arcade mode): limited agency (1 hero ban, 1 skill ban,
  rerolls) plus comeback tokens keep an unbalanced game fun.
- Legends of Dota Redux: ability/hero bans, blocked troll combos, a point-budget balance mode and a
  separate "all allowed" map.

- keymil's "ABILITY DRAFT TURBO 10vs10" (Workshop, about 22k subscribers, monetized): drafts 3
  regular + 1 ultimate, then innate + an extra facet, then talents. Its Turbo: -25% cooldowns and
  mana costs, 2x gold and XP, -50% respawn and buyback cooldown. Periodic ability upgrades every
  4 minutes and Golden Treasures every 6 minutes. Its values are its own, not Valve's Turbo.
- Lozrantekh's "Ability Draft Turbo for Friends": a re-upload of keymil's mod, published without a
  license. Not usable.
- The name "Turbo Ability Draft" is very close to keymil's; consider a distinct display name before
  publishing.

## Rules for the codebase

- Original code only. Other mods (keymil's, Lozrantekh's fork, Legends of Dota, Poelsemix) may be
  studied for ideas but not copied.
- No monetization.
- The repository stays private until it has been validated with friends.
- Code, comments, commits and docs are written in English.

## Open questions

Decide before implementing:

- [ ] Display name for the Workshop (see "Similar mods").
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
- [x] Layout of Dota's ability data: per-hero files with `AbilityDefinitions`, IDs in
      `npc_ability_ids.txt` (checked against the 2026-10-13 client files).
- [x] Valve's Ability Draft KV data: `AbilityDraftAbilities`, `AbilityDraftExtraAbilities`,
      `AbilityDraftUltShardAbility`; no `AbilityDraftDisabled` flag.
- [ ] `GetUnitKeyValuesByName` returns the `AbilityDraftAbilities` block in game.
- [ ] Current official draft details after 7.39: number of phases, pick timer, when the hero pick
      happens, and how the hero pool is built. Play or watch a current Ability Draft match.
- [ ] Whether a custom game can run on top of Valve's official Ability Draft mode (its UI and engine
      adaptations) and only add Turbo rules. Test on Windows before building our own draft screen.
