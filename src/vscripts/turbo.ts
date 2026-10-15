import { config } from "./config";
import { GoldReasonName, TowerTier } from "./config/types";

// Const enums only exist at compile time, so config names are mapped to values here.
const goldReasons: Record<GoldReasonName, ModifyGoldReason> = {
    HERO_KILL: ModifyGoldReason.HERO_KILL,
    CREEP_KILL: ModifyGoldReason.CREEP_KILL,
    NEUTRAL_KILL: ModifyGoldReason.NEUTRAL_KILL,
    ROSHAN_KILL: ModifyGoldReason.ROSHAN_KILL,
    BOUNTY_RUNE: ModifyGoldReason.BOUNTY_RUNE,
    ABILITY_GOLD: ModifyGoldReason.ABILITY_GOLD,
};

const towerTiers: TowerTier[] = ["tier1", "tier2", "tier3", "tier4"];

/** Game mode settings and filters. Call once when the addon activates. */
export function applyTurboRules(): void {
    const turbo = config.turbo;
    const mode = GameRules.GetGameModeEntity();

    if (turbo.personalCourier) {
        mode.SetFreeCourierModeEnabled(true);
        mode.SetUseTurboCouriers(true);
    }
    mode.SetLoseGoldOnDeath(turbo.loseGoldOnDeath);
    mode.SetCanSellAnywhere(turbo.sellAnywhere);
    GameRules.SetUseUniversalShopMode(turbo.universalShop);
    if (turbo.respawnTimeMultiplier !== null) {
        mode.SetRespawnTimeScale(turbo.respawnTimeMultiplier);
    }

    const xpMultiplier = turbo.xpMultiplier;
    if (xpMultiplier !== null) {
        mode.SetModifyExperienceFilter(event => {
            event.experience = event.experience * xpMultiplier;
            return true;
        }, {});
    }

    const goldMultiplier = turbo.goldMultiplier;
    if (goldMultiplier !== null) {
        const reasons = turbo.goldMultiplierReasons.map(name => goldReasons[name]);
        mode.SetModifyGoldFilter(event => {
            if (reasons.includes(event.reason_const as unknown as ModifyGoldReason)) {
                event.gold = event.gold * goldMultiplier;
            }
            return true;
        }, {});
    }
}

/** Tower and Ancient stats. Call once the map's buildings exist (pre-game). */
export function applyTurboBuildings(): void {
    const turbo = config.turbo;

    for (const tower of Entities.FindAllByClassname("npc_dota_tower") as CDOTA_BaseNPC[]) {
        // Unit names look like "npc_dota_goodguys_tower2_mid".
        const name = tower.GetUnitName();
        const tier = towerTiers.find((_, index) => name.includes(`tower${index + 1}`));
        if (tier === undefined) continue;

        const stats = turbo.towers[tier];
        tower.SetBaseMaxHealth(stats.health);
        tower.SetMaxHealth(stats.health);
        tower.SetHealth(stats.health);
        tower.SetPhysicalArmorBaseValue(stats.armor);
    }

    const ancientHealthRegen = turbo.ancientHealthRegen;
    if (ancientHealthRegen !== null) {
        for (const ancient of Entities.FindAllByClassname("npc_dota_fort") as CDOTA_BaseNPC[]) {
            ancient.SetBaseHealthRegen(ancientHealthRegen);
        }
    }
}

const shopTeams = [DotaTeam.GOODGUYS, DotaTeam.BADGUYS];

/**
 * Turbo brings some items in stock earlier (Shard at 7:30, Raindrop at 1:30). Dota has no setter for
 * an item's first stock time, so the stock is raised when the game clock reaches it. Call once when
 * the game starts.
 */
export function applyTurboItemTimings(): void {
    const pending = Object.entries(config.turbo.itemAvailableAtSeconds);
    Timers.CreateTimer(1, () => {
        const clock = GameRules.GetDOTATime(false, false);
        for (let index = pending.length - 1; index >= 0; index--) {
            const [item, seconds] = pending[index];
            if (clock < seconds) continue;
            pending.splice(index, 1);
            for (const team of shopTeams) {
                // Team stock, and per player for items with a player-specific stock (the Shard).
                if (GameRules.GetItemStockCount(team, item, -1 as PlayerID) < 1) {
                    GameRules.SetItemStockCount(1, team, item, -1 as PlayerID);
                }
                for (let slot = 1; slot <= PlayerResource.GetPlayerCountForTeam(team); slot++) {
                    const playerId = PlayerResource.GetNthPlayerIDOnTeam(team, slot);
                    if (GameRules.GetItemStockCount(team, item, playerId) < 1) {
                        GameRules.SetItemStockCount(1, team, item, playerId);
                    }
                }
                print(
                    `[turbo] ${item} in stock for team ${team}: ${GameRules.GetItemStockCount(team, item, -1 as PlayerID)}`,
                );
            }
        }
        return pending.length > 0 ? 1 : undefined;
    });
}
