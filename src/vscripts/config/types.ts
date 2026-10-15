/**
 * Shape of game_config.json. `null` means the value is still undecided or unverified
 * (see docs/DESIGN.md) and must be resolved before the feature that uses it ships.
 */
export interface GameConfig {
    version: number;
    draft: DraftConfig;
    turbo: TurboConfig;
    shop: ShopConfig;
    modes: {
        classic: { enabled: boolean; teamSize: number };
        mid_only: MidOnlyConfig;
    };
    abilities: AbilityRules;
    dev: DevConfig;
}

/** Based on Dota's official "Mid Only" mode: default map, creeps only in the middle lane. */
export interface MidOnlyConfig {
    enabled: boolean;
    teamSizes: number[];
    /** "ancient": official Mid Only rule (default). A kill race may come later as a lobby option. */
    winCondition: "ancient";
}

export interface DraftConfig {
    /** "draft": the hero is one of the picks (official since 7.39). "random": one random hero per player. */
    heroSelection: "random" | "draft";
    /** "snake": official turn order. "simultaneous": everyone picks each round at once. */
    pickMode: "snake" | "simultaneous";
    regularAbilities: number;
    ultimates: number;
    /** House rule (not in the official mode): most abilities one player may take from the same hero. `null` = no limit. */
    maxAbilitiesPerHero: number | null;
    /** Heroes whose abilities join the pool without being played (official Ability Draft uses 2). */
    extraPoolHeroes: number;
    /** Smallest board: small lobbies (1v1, 2v2) still get this many heroes, for variety. */
    minPoolHeroes: number;
    planningSeconds: number;
    pickTimeSeconds: number;
    phaseBreakSeconds: number;
    strategySeconds: number;
}

/** House rules for the shop (not in the official modes). */
export interface ShopConfig {
    /** Aghanim's Shard applies and the Scepter moves to the inventory right away when bought from afar. */
    aghanimsToHero: boolean;
}

/** Official Turbo rules; sources in docs/research/2026-10-14-turbo-and-ability-draft-rules.md. */
export interface TurboConfig {
    /** Applied to all XP. */
    xpMultiplier: number | null;
    /** Applied only to the gold sources listed in `goldMultiplierReasons`. */
    goldMultiplier: number | null;
    /** `ModifyGoldReason` names, e.g. "CREEP_KILL". Passive gold is not doubled in Turbo. */
    goldMultiplierReasons: GoldReasonName[];
    loseGoldOnDeath: boolean;
    respawnTimeMultiplier: number | null;
    /** Each player gets a hasted flying courier. */
    personalCourier: boolean;
    /** Items can be sold from anywhere on the map. */
    sellAnywhere: boolean;
    /** Secret Shop items can be bought at any shop. */
    universalShop: boolean;
    /** Item name -> game clock time (seconds) when it first comes in stock (Shard 7:30, Raindrop 1:30). */
    itemAvailableAtSeconds: Record<string, number>;
    towers: Record<TowerTier, { health: number; armor: number }>;
    /** Ancients do not regenerate health in Turbo. */
    ancientHealthRegen: number | null;
}

export type TowerTier = "tier1" | "tier2" | "tier3" | "tier4";

export type GoldReasonName =
    "HERO_KILL" | "CREEP_KILL" | "NEUTRAL_KILL" | "ROSHAN_KILL" | "BOUNTY_RUNE" | "ABILITY_GOLD";

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
    /** Hero name -> only `count` random abilities of its official pool join the board. */
    randomSubset: Record<string, { count: number; reason: string }>;
    /**
     * Talent -> the ability it belongs to, for the few talents whose link is not in Dota's data (behavior
     * talents). Used to turn them into gold when that ability is not drafted (see draft/talents.ts).
     */
    talentLinks: Record<string, { ability: string; reason: string }>;
    /** Hero name -> reason its hidden kit helpers (see build.ts) must not be added to drafted heroes. */
    noHiddenHelpers: Record<string, string>;
}

export interface AbilityOverride {
    reason: string;
    /** KV key -> replacement value, e.g. { "AbilityCooldown": "30 25 20" }. */
    values: Record<string, string | number>;
}

/** Phase durations of the draft and pre-game. */
export interface DraftTimings {
    planningSeconds: number;
    pickTimeSeconds: number;
    phaseBreakSeconds: number;
    strategySeconds: number;
    /** `null` keeps Dota's default pre-game time. */
    preGameSeconds: number | null;
}

/** Shorter timings for solo testing in Workshop Tools; never applied outside tools mode. */
export interface DevConfig extends DraftTimings {
    toolsModeTimings: boolean;
    /** Tools only: finish the draft right away with random picks (also: console command tad_skip_draft). */
    instantDraft: boolean;
}
