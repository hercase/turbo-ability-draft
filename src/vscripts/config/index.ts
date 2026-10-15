import * as rawConfig from "./game_config.json";
import { DraftTimings, GameConfig } from "./types";

// Namespace import on purpose: a default import compiles to `.default`, which is nil in Lua.
export const config = rawConfig as GameConfig;

/** Official draft timings, or the shorter `dev` ones when testing in Workshop Tools. */
export function getDraftTimings(): DraftTimings {
    if (IsInToolsMode() && config.dev.toolsModeTimings) return config.dev;
    return { ...config.draft, preGameSeconds: null };
}
