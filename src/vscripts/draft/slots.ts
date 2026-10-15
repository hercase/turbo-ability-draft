/** First ability slot with nothing in it (AddAbility puts new abilities there). */
export function firstFreeSlot(hero: CDOTA_BaseNPC_Hero): number {
    let index = 0;
    while (hero.GetAbilityByIndex(index) !== undefined) index++;
    return index;
}

/**
 * Plugs every free slot before `slot` with hidden placeholders, so the next AddAbility lands on it.
 * Bounded: stops if Dota refuses a placeholder instead of looping forever.
 */
export function fillSlotsBefore(hero: CDOTA_BaseNPC_Hero, slot: number): void {
    for (let attempts = 0; attempts < slot && firstFreeSlot(hero) < slot; attempts++) {
        if ((hero.AddAbility("generic_hidden") as CDOTABaseAbility | undefined) === undefined) return;
    }
}
