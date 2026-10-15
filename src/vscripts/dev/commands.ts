// Console commands for testing in Workshop Tools only; never registered in a real game.
import { Draft } from "../draft/draft";

/** The hero of the player who typed the command. */
function commandHero(): CDOTA_BaseNPC_Hero | undefined {
    const player = Convars.GetCommandClient();
    return player === undefined ? undefined : PlayerResource.GetSelectedHeroEntity(player.GetPlayerID());
}

export function registerDevCommands(draft: Draft): void {
    if (!IsInToolsMode()) return;

    // "Skip draft" button on the draft screen (shown in tools only).
    CustomGameEventManager.RegisterListener("dev_skip_draft", () => draft.skipToEnd());

    // tad_skip_draft: finish the running draft now, with random picks for what is missing.
    Convars.RegisterCommand(
        "tad_skip_draft",
        () => draft.skipToEnd(),
        "Tools only: finish the draft now with random picks",
        ConVarFlags.NONE,
    );

    // tad_hero npc_dota_hero_invoker: replace your hero with another one, with its own abilities.
    Convars.RegisterCommand(
        "tad_hero",
        (_, heroName) => {
            const hero = commandHero();
            if (hero === undefined || heroName === undefined) return;
            PrecacheUnitByNameAsync(heroName, () => {
                const playerId = hero.GetPlayerOwnerID();
                const replaced = PlayerResource.ReplaceHeroWith(playerId, heroName, hero.GetGold(), 0);
                if (replaced !== undefined) UTIL_Remove(hero);
                else print(`[dev] tad_hero: could not replace your hero with ${heroName}.`);
            });
        },
        "Tools only: replace your hero, e.g. tad_hero npc_dota_hero_invoker",
        ConVarFlags.NONE,
    );

    // tad_ability earthshaker_fissure: add an ability (level 1) to your hero.
    Convars.RegisterCommand(
        "tad_ability",
        (_, abilityName) => {
            const hero = commandHero();
            if (hero === undefined || abilityName === undefined) return;
            if (hero.HasAbility(abilityName)) return;
            const ability = hero.AddAbility(abilityName);
            if (ability === undefined) print(`[dev] tad_ability: unknown ability ${abilityName}.`);
            else ability.SetLevel(1);
        },
        "Tools only: add an ability to your hero, e.g. tad_ability earthshaker_fissure",
        ConVarFlags.NONE,
    );
}
