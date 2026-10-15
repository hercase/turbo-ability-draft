/**
 * Draft data shared by vscripts (writer) and Panorama (reader) through the "draft" net table.
 * Remember the networking rules from events.d.ts: arrays arrive as objects, booleans as 0 | 1.
 */

type DraftPhase = "waiting" | "planning" | "picking" | "break" | "done";

type DraftPickKind = "hero" | "ability";

interface DraftStateData {
    phase: DraftPhase;
    /** 1-based round number; 0 before the first round. */
    round: number;
    rounds: number;
    /** Index in `order` of the player whose turn it is (0-based); -1 outside of picks. */
    turn: number;
    /** Pick order of the current round (the next round reverses it). */
    order: PlayerID[];
    /** Game time when the current phase or pick ends. */
    endsAt: number;
}

interface DraftPoolAbilityData {
    name: string;
    hero: string;
    ultimate: boolean;
    /** Aghanim's Scepter / Shard upgrade or grant something for it (shown with Ctrl+Alt). */
    scepter: boolean;
    shard: boolean;
}

/** Client -> server: a player wants an entry (Alt+click) or suggests it (Ctrl+click) to their team. */
interface DraftRequestEventData {
    kind: DraftPickKind;
    name: string;
    suggest: boolean;
}

/** Server -> team: someone's draft request, shown on the draft screen. */
interface DraftRequestBroadcastData extends DraftRequestEventData {
    player: PlayerID;
}

interface DraftPoolData {
    heroes: string[];
    abilities: DraftPoolAbilityData[];
}

interface DraftPlayerData {
    team: DotaTeam;
    hero: string;
    /** Regular abilities first, in pick order. */
    abilities: string[];
    ultimate: string;
}

interface DraftLimitsData {
    regularAbilities: number;
    ultimates: number;
    /** 0 means no limit. */
    maxAbilitiesPerHero: number;
}

/** Abilities of a built hero that Aghanim's Scepter / Shard upgrade or grant. */
/** One thing Aghanim's Scepter / Shard does for a drafted hero. */
interface DraftUpgradeEntry {
    ability: string;
    /** "upgrade": improves an ability the hero has; "new": the item grants this ability. */
    kind: "upgrade" | "new";
}

interface DraftUpgradesData {
    scepter: DraftUpgradeEntry[];
    shard: DraftUpgradeEntry[];
    /** The hero's innates: they have their own HUD button, so the reorder mode leaves them out. */
    innates: string[];
}

interface CustomNetTableDeclarations {
    draft: {
        state: DraftStateData;
        pool: DraftPoolData;
        limits: DraftLimitsData;
        /** Keyed by player ID as a string ("0", "1", ...). */
        players: Record<string, DraftPlayerData>;
        /** Keyed by player ID as a string; set when each hero is built. */
        upgrades: Record<string, DraftUpgradesData>;
    };
}
