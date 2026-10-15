// F8 reorder mode: players rearrange the abilities on their ability bar.
import { isInnate } from "./draft/build";

// Every hotkeyed slot: Q, W, E, D, F and R (the ultimate can move too). The same list is used by the HUD.
const reorderableSlots = [0, 1, 2, 3, 4, 5];

/**
 * A client array as a Lua list. Arrays sent from Panorama arrive as tables keyed from 0 (often as
 * strings), not as 1-based Lua lists, so sort the keys numerically.
 */
function toList<T>(data: unknown): T[] {
    if (type(data) !== "table") return [];
    const entries: [number, T][] = [];
    for (const [key, value] of pairs(data as Record<string, T>)) {
        const index = tonumber(key);
        if (index !== undefined) entries.push([index, value]);
    }
    return entries.sort((x, y) => x[0] - y[0]).map(entry => entry[1]);
}

/**
 * Applies a whole new order at once. The request is checked as a unit (reorderable slots, the same
 * abilities, nothing hidden or innate) and the server computes the swaps, so a rejected move can never
 * leave the rest of the bar half reordered.
 */
export function registerAbilityReorder(): void {
    CustomGameEventManager.RegisterListener("ability_reorder", (_, event) => {
        const hero = PlayerResource.GetSelectedHeroEntity(event.PlayerID);
        const slots = toList<number>(event.slots);
        const wanted = toList<string>(event.abilities);
        if (hero === undefined || slots.length === 0 || slots.length !== wanted.length) return;
        if (!slots.every(slot => reorderableSlots.includes(slot))) return;

        const layout: string[] = [];
        for (const slot of slots) {
            const ability = hero.GetAbilityByIndex(slot);
            if (ability === undefined || ability.IsHidden() || isInnate(ability.GetAbilityName())) return;
            layout.push(ability.GetAbilityName());
        }
        if ([...layout].sort().join() !== [...wanted].sort().join()) return;

        for (let position = 0; position < layout.length; position++) {
            if (layout[position] === wanted[position]) continue;
            const from = layout.indexOf(wanted[position], position + 1);
            if (from === -1) return;
            hero.SwapAbilities(layout[position], layout[from], true, true);
            [layout[position], layout[from]] = [layout[from], layout[position]];
        }
    });
}
