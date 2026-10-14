import * as rawConfig from "./game_config.json";
import { GameConfig } from "./types";

// Namespace import on purpose: a default import compiles to `.default`, which is nil in Lua.
export const config = rawConfig as GameConfig;
