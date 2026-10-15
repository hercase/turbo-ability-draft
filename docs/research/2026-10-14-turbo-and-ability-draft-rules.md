# Turbo and Ability Draft rules (2026-10-14)

Current patch: **7.41f** (2026-09-15, [patch list](https://www.dota2.com/datafeed/patchnoteslist)).
Valve does not publish exact Turbo or Ability Draft numbers in one place; values below come from the
sources linked on each line. UNCONFIRMED means no current source was found.

## Turbo

Main source: [Liquipedia, Game Modes](https://liquipedia.net/dota2/Game_Modes) (revised 2026-08-23).

- All XP is doubled.
- Creep bounties, Hand of Midas and Bounty Rune gold are doubled. No gold is lost on death.
- Passive gold doubling: UNCONFIRMED. Both wikis comment it out ("Removed since 7.23, probably is a
  bug"). Gris-Gris passive gold ticks 2x in Turbo (7.36a notes).
- Wisdom Rune XP +100% ([Tinkering With Turbo](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/5129083846337012326), 2023-06-08).
- Towers: T1 1350 HP / 9 armor; T2 and T3 2500 HP / 16 armor; T4 2600 HP / 21 armor. Not applied to
  damage from summons. Ancients do not regenerate. The wiki itself flags these as taken from the
  changelog, not measured.
- Respawn "25% faster" ([Fandom, Game modes](https://dota2.fandom.com/wiki/Game_modes), revised
  2025-10-15). Liquipedia drops this line: UNCONFIRMED.
- Personal flying courier per player, auto-delivers (toggleable), hasted at 1100 move speed, not
  controllable.
- Lane creeps upgrade 9x faster (3 upgrades every 5 waves). Mega creeps have 2x HP and damage.
- Items sell anywhere; Secret Shop items in regular shops; TP Scroll and Boots of Travel cooldowns
  halved.
- Roshan respawn halved; Aegis lasts 4 minutes.
- Aghanim's Shard at 7:30, Infused Raindrop at 1:30; Lotus Pool every 90 s.
- Madstone timings halved (Tier 1 at 2:30); Tormentor first spawns at 7:30
  ([7.38 notes](https://www.dota2.com/datafeed/patchnotes?version=7.38)).
- AFK timer 3 minutes since 7.39 ([Spring Forward 2025](https://www.dota2.com/springforward2025)).
- Starting gold, buyback and denies: no Turbo-specific value found (UNCONFIRMED, likely unchanged).
- No Turbo rule changes found in the 7.39 to 7.41f patch notes.

## Ability Draft after 7.39

- Since 2025-05-22 the base hero is drafted at any point of the draft and keeps its innate. In-game
  rules text: a custom hero via a **5-round draft**, base hero plus up to 3 regular abilities and 1
  ultimate, in any order (`DOTA_AbilityDraft_Explanation` in the client's `dota_english.txt`,
  [GameTracking-Dota2](https://github.com/SteamDatabase/GameTracking-Dota2)).
- Ability pick timeout: a random ability is assigned ("%s1 randomly assigned [%s2]"). Hero pick
  timeout: UNCONFIRMED.
- Timers (60 s planning, 7 s per pick, 5 s breaks, 30 s strategy), pool size (10 + 2 heroes, 48
  regular + 12 ultimates) and pick order (Radiant first, reversed each phase): only documented for the
  old 4-round format ([Liquipedia, Ability Draft](https://liquipedia.net/dota2/Ability_Draft), revised
  2026-01-22). UNCONFIRMED for the 5-round format.
- Whether the 2 extra pool heroes can be drafted as bodies: UNCONFIRMED.
- Innates: "All heroes now have their innate ability when drafted" (7.41).
- Talents for undrafted abilities become bonus gold: **250 / 500 / 750 / 1250** by row (levels 10 / 15 /
  20 / 25), from Valve's own talents `ad_special_bonus_gold_lvl<row>_<l|r>` in the client's
  `npc_abilities.txt`. The client's Ability Draft changelog says 300 for the first row ("150→300",
  around January 2021); the current data says 250, so the data wins. Since 2025-06-18 the draft shows each hero's talent tree.
- The client's Ability Draft strings also say a drafted standard ability "can be re-ordered by dragging
  the ability to another slot".
- Facets were removed in [7.41](https://www.dota2.com/datafeed/patchnotes?version=7.41).
- Scepter/Shard info shown with Ctrl+Alt; the 2026-07-30
  [Summer Scrub](https://www.dota2.com/summerscrub2026) fixes added more Scepter/Shard abilities and
  made Invoker's upgrade all his possible abilities.
- Pool changes: 7.40 (2025-12-15) and 7.41 updated the pool; 2026-07-30 made Bone Guard, Midnight
  Feast, Objurgation and Berserker's Rage draftable.

To settle the UNCONFIRMED draft numbers, play one current Ability Draft lobby.
