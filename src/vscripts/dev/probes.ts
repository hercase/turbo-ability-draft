// Console probes for the "Unverified assumptions" in docs/DESIGN.md.
// They only run in tools mode and only print; remove each probe once its assumption is settled.
import { config } from "../config";
import { buildAbilityPool, getAllHeroNames, getDraftableHeroes, pickRandom } from "../draft/pool";

/** Can we list every hero at runtime, and does a random board look like the official one? */
function probeDraftPool(): void {
    const allHeroes = getAllHeroNames();
    const draftable = getDraftableHeroes();
    print(`[probe] heroes by ID: ${allHeroes.length}, with an Ability Draft pool: ${draftable.length}`);
    print(`[probe] heroes without a pool: ${allHeroes.filter(hero => !draftable.includes(hero)).join(", ")}`);

    const heroes = pickRandom(draftable, 10 + config.draft.extraPoolHeroes);
    const pool = buildAbilityPool(heroes);
    const ultimates = pool.abilities.filter(ability => ability.ultimate);
    print(
        `[probe] random board: ${heroes.length} heroes, ${pool.abilities.length - ultimates.length} regular, ` +
            `${ultimates.length} ultimates`,
    );
    for (const hero of heroes) {
        const abilities = pool.abilities
            .filter(ability => ability.hero === hero)
            .map(ability => (ability.ultimate ? `${ability.name} (ult)` : ability.name));
        print(`[probe]   ${hero}: ${abilities.join(", ")}`);
    }
}

/** Did the Turbo tower and Ancient stats apply? */
function probeTurboBuildings(): void {
    const buildings = [
        ...(Entities.FindAllByClassname("npc_dota_tower") as CDOTA_BaseNPC[]),
        ...(Entities.FindAllByClassname("npc_dota_fort") as CDOTA_BaseNPC[]),
    ];
    for (const building of buildings) {
        print(
            `[probe] ${building.GetUnitName()}: ${building.GetHealth()}/${building.GetMaxHealth()} HP, ` +
                `${building.GetPhysicalArmorValue(false)} armor, ${building.GetHealthRegen()} regen`,
        );
    }
}

export function runDevProbes(): void {
    if (!IsInToolsMode()) return;
    probeDraftPool();
    probeTurboBuildings();
}
