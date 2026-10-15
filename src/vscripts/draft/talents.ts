// Talents of a drafted hero, like Dota's official Ability Draft: a talent that upgrades one of the base
// hero's abilities the player did not draft becomes bonus gold. It uses Valve's own Ability Draft gold
// talents ("ad_special_bonus_gold_lvl<row>_<l|r>", 250 / 500 / 750 / 1250 in their "value"), read from
// Dota's data, so the talent tree shows them with Dota's own text.

import { config } from "../config";
import { fillSlotsBefore } from "./slots";

const goldTalentPrefix = "ad_special_bonus_gold_lvl";
// Talent rows by hero level; each row holds two talents (left, right) in slot order.
const talentRows = [10, 15, 20, 25];

/** Every talent ("special_bonus_*") an ability's values mention, e.g. Death Ward -> its damage talent. */
function talentsReferencedBy(ability: string): Set<string> {
    const found = new Set<string>();
    const kv = GetAbilityKeyValuesByName(ability) as Record<string, unknown> | undefined;
    const visit = (value: unknown): void => {
        if (type(value) === "table") {
            for (const [key, inner] of pairs(value as Record<string, unknown>)) {
                if (type(key) === "string" && (key as string).startsWith("special_bonus_")) found.add(key as string);
                visit(inner);
            }
        } else if (type(value) === "string" && (value as string).startsWith("special_bonus_")) {
            found.add(value as string);
        }
    };
    visit(kv);
    return found;
}

function heroKitAbilities(heroName: string): string[] {
    const kv = GetUnitKeyValuesByName(heroName) as Record<string, unknown> | undefined;
    if (kv === undefined) return [];
    const names: string[] = [];
    for (const key of Object.keys(kv)) {
        const value = kv[key];
        // Only the numbered slots ("Ability1"...): skips "AbilityTalentStart", "AbilityLayout" and the like.
        const isSlot = key.startsWith("Ability") && tonumber(key.substring("Ability".length)) !== undefined;
        if (isSlot && type(value) === "string" && !(value as string).startsWith("special_bonus_")) {
            names.push(value as string);
        }
    }
    return names;
}

/**
 * Replaces the hero's dead talents (tied to base-hero abilities it no longer has) with gold talents,
 * in the same slot so the talent tree keeps its rows. Call after the drafted abilities are in place.
 */
export function replaceDeadTalents(hero: CDOTA_BaseNPC_Hero): void {
    // Talent links come from the abilities' values, plus the config for behavior talents with none.
    const linkedTalents = (ability: string): Set<string> => {
        const talents = talentsReferencedBy(ability);
        for (const [talent, link] of Object.entries(config.abilities.talentLinks)) {
            if (link.ability === ability) talents.add(talent);
        }
        return talents;
    };
    const kitReferences = new Set<string>();
    for (const ability of heroKitAbilities(hero.GetUnitName())) {
        for (const talent of linkedTalents(ability)) kitReferences.add(talent);
    }
    const liveReferences = new Set<string>();
    for (let index = 0; index < hero.GetAbilityCount(); index++) {
        const name = hero.GetAbilityByIndex(index)?.GetAbilityName();
        if (name === undefined || name.startsWith("special_bonus_")) continue;
        for (const talent of linkedTalents(name)) liveReferences.add(talent);
    }

    // Talents in slot order; "special_bonus_attributes" (the +2 attributes) is not part of the rows.
    const talents: { index: number; name: string }[] = [];
    for (let index = 0; index < hero.GetAbilityCount(); index++) {
        const name = hero.GetAbilityByIndex(index)?.GetAbilityName();
        if (name !== undefined && name.startsWith("special_bonus_") && name !== "special_bonus_attributes") {
            talents.push({ index, name });
        }
    }

    talents.forEach((talent, position) => {
        const dead = kitReferences.has(talent.name) && !liveReferences.has(talent.name);
        const row = talentRows[Math.floor(position / 2)];
        if (!dead || row === undefined) return;

        const ability = hero.GetAbilityByIndex(talent.index);
        if (ability === undefined) return;
        hero.RemoveAbilityByHandle(ability);
        // AddAbility takes the first free slot: plug the earlier gaps so the gold talent lands in this one.
        fillSlotsBefore(hero, talent.index);
        hero.AddAbility(`${goldTalentPrefix}${row}_${position % 2 === 0 ? "l" : "r"}`);
    });
}

/**
 * Grants the gold when a gold talent is learned. Valve's Ability Draft mode pays it itself; a custom game
 * may not, so pay it unless Dota already did (checked against the gold right after learning).
 */
export function registerGoldTalents(): void {
    ListenToGameEvent(
        "dota_player_learned_ability",
        event => {
            if (!event.abilityname.startsWith(goldTalentPrefix)) return;
            const hero = PlayerResource.GetSelectedHeroEntity(event.PlayerID);
            const talent = hero?.FindAbilityByName(event.abilityname);
            if (talent === undefined) return;
            const amount = talent.GetSpecialValueFor("value");
            const before = PlayerResource.GetGold(event.PlayerID);
            Timers.CreateTimer(0.1, () => {
                const paidByDota = PlayerResource.GetGold(event.PlayerID) - before >= amount;
                print(`[talents] ${event.abilityname}: ${amount} gold, paid by Dota: ${paidByDota}`);
                if (!paidByDota) PlayerResource.ModifyGold(event.PlayerID, amount, true, ModifyGoldReason.UNSPECIFIED);
            });
        },
        undefined,
    );
}
