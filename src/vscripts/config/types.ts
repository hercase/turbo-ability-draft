/**
 * Shape of game_config.json. `null` means the value is still undecided or unverified
 * (see docs/DESIGN.md) and must be resolved before the feature that uses it ships.
 */
export interface GameConfig {
    version: number;
    draft: DraftConfig;
    turbo: TurboConfig;
    modes: {
        classic: { enabled: boolean };
        mid_only: MidOnlyConfig;
    };
    abilities: AbilityRules;
}

/** Based on Dota's official "Mid Only" mode: default map, creeps only in the middle lane. */
export interface MidOnlyConfig {
    enabled: boolean;
    teamSizes: number[];
    /** "ancient": official Mid Only rule. "kills": first team to killsToWin. Undecided. */
    winCondition: "ancient" | "kills" | null;
    killsToWin: Record<"1v1" | "2v2" | "3v3", number | null>;
}

export interface DraftConfig {
    /** "draft": the hero is one of the picks (official since 7.39). "random": one random hero per player. */
    heroSelection: "random" | "draft";
    /** "snake": official turn order. "simultaneous": everyone picks each round at once. */
    pickMode: "snake" | "simultaneous";
    regularAbilities: number;
    ultimates: number;
    /** Heroes whose abilities join the pool without being played (official Ability Draft uses 2). */
    extraPoolHeroes: number;
    planningSeconds: number;
    pickTimeSeconds: number;
    phaseBreakSeconds: number;
    strategySeconds: number;
}

export interface TurboConfig {
    goldMultiplier: number | null;
    xpMultiplier: number | null;
    respawnTimeMultiplier: number | null;
    towerDamageMultiplier: number | null;
    towerArmorBonus: number | null;
    personalCourier: boolean;
}

export interface AbilityRules {
    /**
     * Build each hero's pool from Valve's "AbilityDraftAbilities" hero KV block, which already leaves
     * out abilities the official mode excludes. The blacklist is applied on top.
     */
    useValveDraftPool: boolean;
    /** Ability name -> reason it is excluded from the draft pool. */
    blacklist: Record<string, string>;
    /** Ability name -> balance override applied on top of Valve's KV values. */
    overrides: Record<string, AbilityOverride>;
}

export interface AbilityOverride {
    reason: string;
    /** KV key -> replacement value, e.g. { "AbilityCooldown": "30 25 20" }. */
    values: Record<string, string | number>;
}
