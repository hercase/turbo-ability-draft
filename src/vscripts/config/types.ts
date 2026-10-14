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
        solo_mid: { enabled: boolean; killsToWin: Record<"1v1" | "2v2" | "3v3", number | null> };
    };
    abilities: AbilityRules;
}

export interface DraftConfig {
    regularAbilities: number;
    ultimates: number;
    pickTimeSeconds: number;
    includeInnates: boolean | null;
    includeFacets: boolean | null;
    includeTalents: boolean | null;
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
    /** Skip abilities that Valve's own Ability Draft marks as disabled in its KV data. */
    honorValveAbilityDraftFlags: boolean;
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
