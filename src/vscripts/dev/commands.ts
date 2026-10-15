// Console commands and HUD buttons for testing in Workshop Tools only; never registered in a real game.
import { HeroBuilder } from "../draft/build";
import { Draft } from "../draft/draft";
import { findDraftEntry, getDraftableHeroes, getHeroDraftAbilities, isUltimate, splitDraftEntry } from "../draft/pool";

/**
 * The hero of the player who typed the command. Commands typed in VConsole come with a handle that is
 * not a player (it has no GetPlayerID), so they act on the first human player's hero.
 */
function commandHero(): CDOTA_BaseNPC_Hero | undefined {
    const player = Convars.GetCommandClient() as CDOTAPlayerController | undefined;
    if (player !== undefined && (player as { GetPlayerID?: unknown }).GetPlayerID !== undefined) {
        return PlayerResource.GetSelectedHeroEntity(player.GetPlayerID());
    }
    for (let id = 0; id < DOTA_MAX_TEAM_PLAYERS; id++) {
        const playerId = id as PlayerID;
        if (!PlayerResource.IsValidPlayerID(playerId) || PlayerResource.IsFakeClient(playerId)) continue;
        const hero = PlayerResource.GetSelectedHeroEntity(playerId);
        if (hero !== undefined) return hero;
    }
    return undefined;
}

/**
 * tad_build <hero> <ability> <ability> <ability> <ultimate>: gives the player that build without a
 * draft. Abilities are names from any hero's Ability Draft pool; "-" leaves a slot empty.
 */
function buildCommand(draft: Draft, builder: HeroBuilder, args: string[]): void {
    const hero = commandHero();
    const [heroName, ...abilityNames] = args;
    if (hero === undefined || heroName === undefined) {
        print("[dev] usage: tad_build npc_dota_hero_<name> <ability> <ability> <ability> <ultimate>");
        return;
    }

    const abilities: string[] = [];
    let ultimate = "";
    // The draft precaches its pool heroes; heroes outside the pool need it too, or their models and
    // particles are missing (Astral Spirit's model, for example).
    const sources = new Set<string>([heroName]);
    for (const name of abilityNames) {
        if (name === "-") continue;
        // Use the official pool entry, so grouped abilities (Jakiro's Liquids) come together.
        const found = findDraftEntry(name);
        const entry = found?.entry ?? name;
        if (found !== undefined) sources.add(found.hero);
        if (isUltimate(entry)) ultimate = entry;
        else abilities.push(entry);
    }

    const playerId = hero.GetPlayerOwnerID();
    draft.setPlayerBuild(playerId, { team: hero.GetTeamNumber(), hero: heroName, abilities, ultimate });
    builder.forget(playerId);
    print(`[dev] tad_build: ${heroName} with ${[...abilities, ultimate].filter(name => name !== "").join(", ")}`);

    let pending = sources.size;
    for (const source of sources) {
        PrecacheUnitByNameAsync(source, () => {
            pending--;
            if (pending > 0) return;
            // Same hero: rebuild it in place. Another hero: replace it; the new one is built when it spawns.
            if (hero.GetUnitName() === heroName) {
                builder.onHeroSpawned(hero);
                return;
            }
            const replaced = PlayerResource.ReplaceHeroWith(playerId, heroName, hero.GetGold(), 0);
            if (replaced !== undefined) UTIL_Remove(hero);
            else print(`[dev] tad_build: could not replace your hero with ${heroName}.`);
        });
    }
}

/**
 * tad_test_abilities: adds every ability of the Ability Draft pools (and their extras) to a test unit,
 * one by one, and reports the ones Dota refuses or that error. Candidates for the blacklist.
 */
function testAbilitiesCommand(): void {
    const names = new Set<string>();
    for (const hero of getDraftableHeroes()) {
        for (const entry of getHeroDraftAbilities(hero)) {
            for (const name of splitDraftEntry(entry)) {
                names.add(name);
                const kv = GetAbilityKeyValuesByName(name) as Record<string, unknown> | undefined;
                const extras = kv?.["AbilityDraftExtraAbilities"] as Record<string, string> | undefined;
                for (const extra of Object.keys(extras ?? {})) names.add(extra);
            }
        }
    }

    const queue = [...names];
    const failures: string[] = [];
    const dummy = CreateUnitByName(
        "npc_dota_hero_target_dummy",
        Vector(0, 0, 0),
        false,
        undefined,
        undefined,
        DotaTeam.NEUTRALS,
    );
    print(`[abilities] testing ${queue.length} abilities...`);

    // A few per tick, so the server does not stall.
    Timers.CreateTimer(0.1, () => {
        for (let count = 0; count < 10 && queue.length > 0; count++) {
            const name = queue.shift()!;
            const [added, ability] = pcall(() => dummy.AddAbility(name) as CDOTABaseAbility | undefined);
            if (!added || ability === undefined) {
                failures.push(`${name} (${added ? "refused" : tostring(ability)})`);
                continue;
            }
            const [leveled, error] = pcall(() => ability.SetLevel(1));
            if (!leveled) failures.push(`${name} (level 1: ${tostring(error)})`);
            dummy.RemoveAbilityByHandle(ability);
        }
        if (queue.length > 0) return 0.1;

        UTIL_Remove(dummy);
        print(`[abilities] done: ${names.size - failures.length} ok, ${failures.length} failed`);
        for (const failure of failures) print(`[abilities]   ${failure}`);
        return undefined;
    });
}

/** Buttons of the tools-only dev panel in the HUD. */
function devAction(playerId: PlayerID, action: string): void {
    const hero = PlayerResource.GetSelectedHeroEntity(playerId);
    if (hero === undefined) return;

    switch (action) {
        case "level6":
        case "level30": {
            const target = action === "level6" ? 6 : 30;
            for (let level = hero.GetLevel(); level < target; level++) hero.HeroLevelUp(false);
            break;
        }
        case "gold":
            PlayerResource.ModifyGold(playerId, 5000, true, ModifyGoldReason.UNSPECIFIED);
            break;
        case "refresh":
            for (let index = 0; index < hero.GetAbilityCount(); index++) hero.GetAbilityByIndex(index)?.EndCooldown();
            for (let slot = 0; slot <= 16; slot++) hero.GetItemInSlot(slot)?.EndCooldown();
            hero.SetHealth(hero.GetMaxHealth());
            hero.SetMana(hero.GetMaxMana());
            break;
        case "scepter":
            hero.AddItemByName("item_ultimate_scepter");
            break;
        case "shard":
            hero.AddItemByName("item_aghanims_shard");
            break;
        case "respawn":
            if (!hero.IsAlive()) hero.RespawnHero(false, false);
            break;
        case "dummy": {
            // An enemy target dummy in front of the hero, to test damage and effects.
            const enemy = hero.GetTeamNumber() === DotaTeam.GOODGUYS ? DotaTeam.BADGUYS : DotaTeam.GOODGUYS;
            const position = (hero.GetAbsOrigin() + hero.GetForwardVector() * 400) as Vector;
            CreateUnitByName("npc_dota_hero_target_dummy", position, true, undefined, undefined, enemy);
            break;
        }
    }
}

type DevCommand = { help: string; run: (args: string[]) => void };

declare global {
    // Dev command handlers, kept in a Lua global so script_reload can swap them: Dota keeps a console
    // command's first callback across reloads, so each callback only forwards to this table.
    var tadDevCommands: Record<string, DevCommand> | undefined;
}

function devCommands(draft: Draft, builder: HeroBuilder): Record<string, DevCommand> {
    return {
        // Finish the running draft now, with random picks for what is missing.
        tad_skip_draft: {
            help: "Tools only: finish the draft now with random picks",
            run: () => draft.skipToEnd(),
        },
        tad_build: {
            help: "Tools only: tad_build npc_dota_hero_<name> <ability> <ability> <ability> <ultimate>",
            run: args => buildCommand(draft, builder, args),
        },
        // Apply your build again (after script_reload, for example).
        tad_rebuild: {
            help: "Tools only: rebuild your hero from its draft",
            run: () => {
                const hero = commandHero();
                if (hero === undefined) return;
                builder.forget(hero.GetPlayerOwnerID());
                builder.onHeroSpawned(hero);
            },
        },
        tad_test_abilities: {
            help: "Tools only: try every Ability Draft ability on a test unit and log the ones that fail",
            run: () => testAbilitiesCommand(),
        },
        // tad_hero npc_dota_hero_invoker: replace your hero with another one, with its own abilities.
        tad_hero: {
            help: "Tools only: replace your hero, e.g. tad_hero npc_dota_hero_invoker",
            run: ([heroName]) => {
                const hero = commandHero();
                if (hero === undefined || heroName === undefined) return;
                PrecacheUnitByNameAsync(heroName, () => {
                    const playerId = hero.GetPlayerOwnerID();
                    const replaced = PlayerResource.ReplaceHeroWith(playerId, heroName, hero.GetGold(), 0);
                    if (replaced !== undefined) UTIL_Remove(hero);
                    else print(`[dev] tad_hero: could not replace your hero with ${heroName}.`);
                });
            },
        },
        // tad_ability earthshaker_fissure: add an ability (level 1) to your hero.
        tad_ability: {
            help: "Tools only: add an ability to your hero, e.g. tad_ability earthshaker_fissure",
            run: ([abilityName]) => {
                const hero = commandHero();
                if (hero === undefined || abilityName === undefined) return;
                if (hero.HasAbility(abilityName)) return;
                const ability = hero.AddAbility(abilityName);
                if (ability === undefined) print(`[dev] tad_ability: unknown ability ${abilityName}.`);
                else ability.SetLevel(1);
            },
        },
    };
}

/** Registers the dev tools. Call at startup and again on script_reload, to pick up the new code. */
export function registerDevCommands(draft: Draft, builder: HeroBuilder): void {
    if (!IsInToolsMode()) return;

    const firstLoad = tadDevCommands === undefined;
    tadDevCommands = devCommands(draft, builder);
    if (!firstLoad) return;

    // "Skip draft" button on the draft screen, and the dev panel buttons in the HUD.
    CustomGameEventManager.RegisterListener("dev_skip_draft", () => tadDevCommands?.tad_skip_draft.run([]));
    CustomGameEventManager.RegisterListener("dev_action", (_, event) => devAction(event.PlayerID, event.action));

    for (const [name, command] of Object.entries(tadDevCommands)) {
        Convars.RegisterCommand(
            name,
            (_, ...args) => tadDevCommands?.[name]?.run(args),
            command.help,
            ConVarFlags.NONE,
        );
    }
}
