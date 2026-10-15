// House rule (not in the official modes): Aghanim's Shard and Scepter reach the hero right away when
// bought away from a shop, instead of waiting in the stash for the courier. Toggled by
// `shop.aghanimsToHero` in the config.
import { config } from "./config";

const inventorySlots = [0, 1, 2, 3, 4, 5];
const stashSlots = [9, 10, 11, 12, 13, 14];

function findInSlots(hero: CDOTA_BaseNPC_Hero, slots: number[], itemName: string): CDOTA_Item | undefined {
    for (const slot of slots) {
        const item = hero.GetItemInSlot(slot);
        if (item !== undefined && item.GetAbilityName() === itemName) return item;
    }
    return undefined;
}

function onItemPurchased(event: DotaItemPurchasedEvent): void {
    if (event.itemname !== "item_aghanims_shard" && event.itemname !== "item_ultimate_scepter") return;
    const hero = PlayerResource.GetSelectedHeroEntity(event.PlayerID);
    if (hero === undefined) return;

    // The item lands in the stash a moment after the event.
    Timers.CreateTimer(0.1, () => {
        const item = findInSlots(hero, stashSlots, event.itemname);
        if (item === undefined) return; // Bought at a shop: it is already in the inventory.

        if (event.itemname === "item_aghanims_shard") {
            // The Shard is consumed on pickup anyway: apply its upgrade now and drop the stash copy.
            hero.RemoveItem(item);
            hero.AddNewModifier(hero, undefined, "modifier_item_aghanims_shard", {});
            return;
        }

        // The Scepter is a regular item: move it into a free inventory slot, if there is one.
        const freeSlot = inventorySlots.find(slot => hero.GetItemInSlot(slot) === undefined);
        const stashSlot = stashSlots.find(slot => hero.GetItemInSlot(slot) === item);
        if (freeSlot !== undefined && stashSlot !== undefined) hero.SwapItems(stashSlot, freeSlot);
    });
}

export function registerShopRules(): void {
    if (!config.shop.aghanimsToHero) return;
    ListenToGameEvent("dota_item_purchased", event => onItemPurchased(event), undefined);
}
