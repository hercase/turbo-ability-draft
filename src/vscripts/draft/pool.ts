import { config } from "../config";

/** One ability on the shared draft board. */
export interface PoolAbility {
    name: string;
    /** Hero the ability comes from. */
    hero: string;
    ultimate: boolean;
    /** Aghanim's Scepter / Shard upgrade or grant something for this entry (shown with Ctrl+Alt). */
    scepter: boolean;
    shard: boolean;
}

export interface DraftPool {
    heroes: string[];
    abilities: PoolAbility[];
}

// Hero IDs are not contiguous (some are retired), so scan a range wider than the current max ID.
const maxHeroId = 255;

/** Every hero the engine knows, read at runtime so new heroes appear without a code change. */
export function getAllHeroNames(): string[] {
    const heroes: string[] = [];
    for (let id = 1; id <= maxHeroId; id++) {
        const name = DOTAGameManager.GetHeroUnitNameByID(id);
        if (name !== undefined && name.startsWith("npc_dota_hero_")) {
            heroes.push(name);
        }
    }
    return heroes;
}

/**
 * Abilities a hero brings to the official pool (its "AbilityDraftAbilities" KV block), in slot order.
 * An entry can be a comma-separated group drafted as one pick (e.g. Jakiro's Liquid Fire and Liquid
 * Frost, Kez's two stances); the first name is the card shown on the board.
 */
export function getHeroDraftAbilities(hero: string): string[] {
    const kv = GetUnitKeyValuesByName(hero) as Record<string, unknown> | undefined;
    const block = kv?.["AbilityDraftAbilities"] as Record<string, string> | undefined;
    if (block === undefined) return [];

    // Keys are "Ability<slot>" with gaps (Jakiro uses 1, 2, 3, 6); sort them by slot number.
    const slots = Object.keys(block)
        .filter(key => key.startsWith("Ability"))
        .map(key => tonumber(key.substring("Ability".length)))
        .filter((slot): slot is number => slot !== undefined)
        .sort((a, b) => a - b);
    return slots.map(slot => block[`Ability${slot}`]);
}

/** Abilities granted by one pool entry: the card first, then the rest of its group. */
export function splitDraftEntry(entry: string): string[] {
    return entry.split(",").map(name => name.trim());
}

export function isUltimate(entry: string): boolean {
    const ability = splitDraftEntry(entry)[0];
    const kv = GetAbilityKeyValuesByName(ability) as Record<string, unknown> | undefined;
    // Valve's files use both "ABILITY_TYPE_ULTIMATE" and "DOTA_ABILITY_TYPE_ULTIMATE".
    const type = kv?.["AbilityType"];
    return type === "ABILITY_TYPE_ULTIMATE" || type === "DOTA_ABILITY_TYPE_ULTIMATE";
}

/** Heroes that can take part in a draft: they bring at least one ability to the pool. */
export function getDraftableHeroes(): string[] {
    return getAllHeroNames().filter(hero => getHeroDraftAbilities(hero).length > 0);
}

/** Picks `count` distinct random items from `candidates`, skipping any in `exclude`. */
export function pickRandom<T>(candidates: T[], count: number, exclude: T[] = []): T[] {
    const remaining = candidates.filter(item => !exclude.includes(item));
    const picked: T[] = [];
    while (picked.length < count && remaining.length > 0) {
        const index = RandomInt(0, remaining.length - 1);
        picked.push(remaining[index]);
        remaining.splice(index, 1);
    }
    return picked;
}

/** Builds the shared board from the given heroes' official pools, minus the config blacklist. */
export function buildAbilityPool(heroes: string[]): DraftPool {
    const blacklist = config.abilities.blacklist;
    const abilities: PoolAbility[] = [];
    for (const hero of heroes) {
        let names = getHeroDraftAbilities(hero).filter(name => blacklist[name] === undefined);
        const subset = config.abilities.randomSubset[hero];
        if (subset !== undefined) {
            names = pickRandom(names, subset.count);
        }
        for (const name of names) {
            abilities.push({ name, hero, ultimate: isUltimate(name), ...entryUpgrades(name) });
        }
    }
    return { heroes, abilities };
}

/** Whether Aghanim's Scepter or Shard upgrades or grants something for one ability (from its KV). */
export function upgradedBy(kv: Record<string, unknown>, item: "Scepter" | "Shard"): boolean {
    if (tostring(kv[`Has${item}Upgrade`]) === "1" || tostring(kv[`IsGrantedBy${item}`]) === "1") return true;
    const values = kv["AbilityValues"] as Record<string, unknown> | undefined;
    if (values === undefined) return false;
    for (const value of Object.values(values)) {
        if (type(value) === "table" && tostring((value as Record<string, unknown>)[`Requires${item}`]) === "1") {
            return true;
        }
    }
    return false;
}

/**
 * Scepter / Shard upgrades for a pool entry: its abilities' own upgrades plus the extra abilities
 * Valve's Ability Draft grants with them ("AbilityDraftExtraAbilities": ability -> "scepter" / "shard").
 */
function entryUpgrades(entry: string): { scepter: boolean; shard: boolean } {
    const result = { scepter: false, shard: false };
    for (const name of splitDraftEntry(entry)) {
        const kv = GetAbilityKeyValuesByName(name) as Record<string, unknown> | undefined;
        if (kv === undefined) continue;
        if (upgradedBy(kv, "Scepter")) result.scepter = true;
        if (upgradedBy(kv, "Shard")) result.shard = true;
        const extras = kv["AbilityDraftExtraAbilities"] as Record<string, string> | undefined;
        for (const grantedWith of Object.values(extras ?? {})) {
            if (grantedWith === "scepter") result.scepter = true;
            if (grantedWith === "shard") result.shard = true;
        }
    }
    return result;
}

/**
 * The official pool entry that contains an ability, with its hero, searched over every hero (e.g.
 * "jakiro_liquid_fire" -> "jakiro_liquid_fire,jakiro_liquid_ice"). For abilities outside the current
 * board (tools commands); undefined if no hero brings it to Ability Draft.
 */
export function findDraftEntry(ability: string): { entry: string; hero: string } | undefined {
    for (const hero of getAllHeroNames()) {
        for (const entry of getHeroDraftAbilities(hero)) {
            if (entry === ability || splitDraftEntry(entry).includes(ability)) return { entry, hero };
        }
    }
    return undefined;
}
