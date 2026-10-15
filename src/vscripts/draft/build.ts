// Turns a spawned hero into the drafted build: drafted base hero, drafted abilities, its own innate.
import { config } from "../config";
import { getHeroDraftAbilities, splitDraftEntry, upgradedBy } from "./pool";
import { fillSlotsBefore, firstFreeSlot } from "./slots";
import { replaceDeadTalents } from "./talents";

/** Abilities the hero keeps from its own kit: talents, its innate and empty slot placeholders. */
function keepsOwnAbility(name: string): boolean {
    return name.startsWith("special_bonus_") || name === "generic_hidden" || isInnate(name);
}

export function isInnate(name: string): boolean {
    const kv = GetAbilityKeyValuesByName(name) as Record<string, unknown> | undefined;
    return tostring(kv?.["Innate"]) === "1";
}

// Dota's hero layout: slots 0-2 basic abilities, 3 Shard/extra, 4 innate, 5 the ultimate (R).
const ultimateSlot = 5;

/**
 * Abilities Valve's Ability Draft adds along with a drafted one ("AbilityDraftExtraAbilities"):
 * Scepter/Shard upgrades and companion abilities. Scepter/Shard ones stay hidden until granted.
 */
function getDraftExtraAbilities(ability: string): string[] {
    const kv = GetAbilityKeyValuesByName(ability) as Record<string, unknown> | undefined;
    const extras = kv?.["AbilityDraftExtraAbilities"] as Record<string, string> | undefined;
    return extras === undefined ? [] : Object.keys(extras);
}

/**
 * Hidden, non-learnable abilities in a hero's own kit that its draftable abilities rely on (Astral
 * Spirit's move and return, for example). Valve's data does not link them to the main ability, so
 * every such helper of a source hero is added; unused ones stay hidden.
 */
function getHiddenSubAbilities(sourceHero: string): string[] {
    if (config.abilities.noHiddenHelpers[sourceHero] !== undefined) return [];
    const heroKv = GetUnitKeyValuesByName(sourceHero) as Record<string, unknown> | undefined;
    if (heroKv === undefined) return [];

    const draftable = new Set<string>();
    for (const entry of getHeroDraftAbilities(sourceHero)) {
        for (const name of splitDraftEntry(entry)) draftable.add(name);
    }

    const helpers: string[] = [];
    for (const key of Object.keys(heroKv)) {
        if (!key.startsWith("Ability") || tonumber(key.substring("Ability".length)) === undefined) continue;
        const name = heroKv[key];
        if (typeof name !== "string" || draftable.has(name) || keepsOwnAbility(name)) continue;
        // Empty slot placeholders (Rubick's stolen spells, Doom's devoured ones) are not helpers.
        if (name.includes("_empty") || name.includes("_hidden")) continue;

        const kv = GetAbilityKeyValuesByName(name) as Record<string, unknown> | undefined;
        if (kv === undefined) continue;
        if (isGrantedByItem(name)) continue;
        const behavior = tostring(kv["AbilityBehavior"]);
        if (behavior.includes("NOT_LEARNABLE") || behavior.includes("BEHAVIOR_HIDDEN")) helpers.push(name);
    }
    return helpers;
}

function addAbility(hero: CDOTA_BaseNPC_Hero, name: string): void {
    if (hero.HasAbility(name)) return;
    // Dota may refuse a name (an extra or helper that does not work on this hero): skip it instead of
    // erroring halfway, which would leave the hero without its kit.
    const ability = hero.AddAbility(name) as CDOTABaseAbility | undefined;
    if (ability === undefined) {
        print(`[draft] Could not add ${name} to ${hero.GetUnitName()}.`);
        return;
    }
    ability.SetLevel(0);
    // Shard/Scepter upgrades show as a greyed-out slot when added by script; a hero's own ones stay
    // hidden until the item is bought, so hide them the same way.
    if (isGrantedByItem(name)) ability.SetHidden(true);
}

function isGrantedByItem(name: string): boolean {
    const kv = GetAbilityKeyValuesByName(name) as Record<string, unknown> | undefined;
    return tostring(kv?.["IsGrantedByShard"]) === "1" || tostring(kv?.["IsGrantedByScepter"]) === "1";
}

/**
 * Removes the hero's own abilities and adds the drafted ones: regular abilities in the basic slots,
 * placeholders up to the ultimate slot so the ultimate lands on R, then every extra ability.
 */
export function applyDraftedAbilities(
    hero: CDOTA_BaseNPC_Hero,
    picks: DraftPlayerData,
    getAbilityHero: (this: void, entry: string) => string | undefined,
): void {
    // Innates have their own button on the HUD, but some heroes keep theirs in a hotkeyed slot (Witch
    // Doctor's Gris-Gris sits on R). Take those out and add them back after the drafted layout.
    const movedInnates: { name: string; level: number }[] = [];
    for (let index = hero.GetAbilityCount() - 1; index >= 0; index--) {
        const ability = hero.GetAbilityByIndex(index);
        if (ability === undefined) continue;
        const name = ability.GetAbilityName();
        if (!keepsOwnAbility(name)) {
            hero.RemoveAbilityByHandle(ability);
        } else if (index <= ultimateSlot && isInnate(name)) {
            movedInnates.push({ name, level: ability.GetLevel() });
            hero.RemoveAbilityByHandle(ability);
        }
    }

    // Each pick is a pool entry: its first ability takes a basic slot (Q, W, E).
    for (const entry of picks.abilities) addAbility(hero, splitDraftEntry(entry)[0]);

    // Everything else the drafted abilities need, most important first: the rest of each grouped
    // entry (Jakiro's second Liquid), hidden helpers from the source heroes' kits (Io's Spirits In/Out,
    // Kunkka's Return) and Valve's Ability Draft extras (Scepter/Shard upgrades).
    const entries = picks.ultimate !== "" ? [...picks.abilities, picks.ultimate] : picks.abilities;
    const secondary: string[] = [];
    // Order matters for the two hotkeyed D/F slots: real spells first (grouped companions, then
    // Valve's extras such as Shadow Raze 2/3), hidden helpers last (their parent spell finds them by name).
    for (const entry of entries) secondary.push(...splitDraftEntry(entry).slice(1));
    for (const entry of entries) {
        for (const name of splitDraftEntry(entry)) secondary.push(...getDraftExtraAbilities(name));
    }
    const sourceHeroes = new Set<string>();
    for (const entry of entries) {
        const source = getAbilityHero(entry);
        if (source !== undefined) sourceHeroes.add(source);
    }
    for (const source of sourceHeroes) secondary.push(...getHiddenSubAbilities(source));

    // Only slots 0-5 have hotkeys (Q, W, E, D, F, R). AddAbility fills the first free slot, so the
    // secondary abilities take the free D/F slots first, placeholders plug any gap left before R, and
    // whatever does not fit goes after the ultimate.
    const pending = secondary.filter((name, index) => secondary.indexOf(name) === index && !hero.HasAbility(name));
    while (pending.length > 0 && firstFreeSlot(hero) < ultimateSlot) addAbility(hero, pending.shift()!);
    if (picks.ultimate !== "") {
        fillSlotsBefore(hero, ultimateSlot);
        addAbility(hero, splitDraftEntry(picks.ultimate)[0]);
    }
    for (const name of pending) addAbility(hero, name);

    for (const innate of movedInnates) {
        if (hero.HasAbility(innate.name)) continue;
        const ability = hero.AddAbility(innate.name) as CDOTABaseAbility | undefined;
        ability?.SetLevel(innate.level);
    }
}

/**
 * Which of the hero's abilities Aghanim's Scepter and Shard upgrade or grant. Dota's HUD describes the
 * base hero's upgrades, which is wrong for a drafted hero, so the HUD shows this list instead.
 */
function listUpgrades(hero: CDOTA_BaseNPC_Hero): DraftUpgradesData {
    const upgrades: DraftUpgradesData = { scepter: [], shard: [], innates: [] };
    for (let index = 0; index < hero.GetAbilityCount(); index++) {
        const name = hero.GetAbilityByIndex(index)?.GetAbilityName();
        if (name === undefined || name.startsWith("special_bonus_") || name === "generic_hidden") continue;
        const kv = GetAbilityKeyValuesByName(name) as Record<string, unknown> | undefined;
        if (kv === undefined) continue;
        for (const [item, list] of [
            ["Scepter", upgrades.scepter],
            ["Shard", upgrades.shard],
        ] as const) {
            if (!upgradedBy(kv, item)) continue;
            const granted = tostring(kv[`IsGrantedBy${item}`]) === "1";
            list.push({ ability: name, kind: granted ? "new" : "upgrade" });
        }
        if (isInnate(name)) upgrades.innates.push(name);
    }
    return upgrades;
}

/**
 * Called for every spawned real hero. Bots (and any player whose hero did not follow the draft) get
 * their hero replaced first; the replacement spawns again and is then built.
 */
export class HeroBuilder {
    private readonly built = new Set<PlayerID>();
    private readonly upgrades: Record<string, DraftUpgradesData> = {};

    constructor(
        private readonly getPicks: (this: void, playerId: PlayerID) => DraftPlayerData | undefined,
        private readonly getAbilityHero: (this: void, entry: string) => string | undefined,
    ) {}

    public onHeroSpawned(hero: CDOTA_BaseNPC_Hero): void {
        const playerId = hero.GetPlayerOwnerID();
        if (this.built.has(playerId)) return;

        const picks = this.getPicks(playerId);
        if (picks === undefined || picks.hero === "") return;

        // Wait one frame: the engine finishes setting up the hero's abilities after npc_spawned.
        Timers.CreateTimer(0, () => {
            if (this.built.has(playerId) || !IsValidEntity(hero)) return;

            if (hero.GetUnitName() !== picks.hero) {
                // Bots (tools only) keep their body: removing a hero a bot still controls crashed Dota
                // (2026-10-15). Players get the replacement, which spawns again and is built then.
                const isBot = PlayerResource.IsFakeClient(playerId);
                if (!isBot && this.replaceHero(playerId, hero, picks.hero)) return;
                print(`[draft] Player ${playerId} keeps ${hero.GetUnitName()} with the ${picks.hero} draft.`);
            }

            this.built.add(playerId);
            applyDraftedAbilities(hero, picks, this.getAbilityHero);
            replaceDeadTalents(hero);
            this.upgrades[tostring(playerId)] = listUpgrades(hero);
            CustomNetTables.SetTableValue("draft", "upgrades", this.upgrades);
        });
    }

    /** Swaps a player's hero for the drafted one; false if Dota refuses. */
    private replaceHero(playerId: PlayerID, hero: CDOTA_BaseNPC_Hero, heroName: string): boolean {
        const replaced = PlayerResource.ReplaceHeroWith(playerId, heroName, hero.GetGold(), 0) as
            CDOTA_BaseNPC_Hero | undefined;
        if (replaced === undefined) return false;
        UTIL_Remove(hero);
        return true;
    }
}
