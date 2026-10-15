/**
 * This file contains types for the events you want to send between the UI (Panorama)
 * and the server (VScripts).
 *
 * IMPORTANT:
 *
 * The dota engine will change the type of event data slightly when it is sent, so on the
 * Panorama side your event handlers will have to handle NetworkedData<EventType>, changes are:
 *   - Booleans are turned to 0 | 1
 *   - Arrays are automatically translated to objects when sending them as event. You have
 *     to change them back into arrays yourself.
 */

// To declare an event for use, add it to this table with the type of its data
interface CustomGameEventDeclarations {
    /** Client -> server: the local player picks a hero or an ability on their turn. */
    draft_pick: DraftPickEventData;
    /** Client -> server, tools only: finish the draft now with random picks ("Skip draft" button). */
    dev_skip_draft: Record<string, never>;
    /** Client -> server: Alt+click (want) or Ctrl+click (suggest) on the draft board. */
    draft_request: DraftRequestEventData;
    /** Server -> team: a teammate's draft request. */
    draft_request_broadcast: DraftRequestBroadcastData;
    /** Client -> server: the local hero's new ability order (F8 reorder mode). */
    ability_reorder: AbilityReorderEventData;
}

interface AbilityReorderEventData {
    /** Hero ability slots being reordered (0-5: Q, W, E, D, F, R), in bar order. */
    slots: number[];
    /** Ability wanted in each of those slots, same order. The server computes the swaps. */
    abilities: string[];
}

interface DraftPickEventData {
    kind: DraftPickKind;
    name: string;
}
