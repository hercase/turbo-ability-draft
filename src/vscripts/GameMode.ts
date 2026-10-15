import { reloadable } from "./lib/tstl-utils";
import { config, getDraftTimings } from "./config";
import { registerDevCommands } from "./dev/commands";
import { runDevProbes } from "./dev/probes";
import { HeroBuilder } from "./draft/build";
import { registerGoldTalents } from "./draft/talents";
import { Draft, getMaxDraftSeconds } from "./draft/draft";
import { registerAbilityReorder } from "./reorder";
import { registerShopRules } from "./shop";
import { applyTurboBuildings, applyTurboItemTimings, applyTurboRules } from "./turbo";

// Extra hero selection time after the longest possible draft, so Dota never randoms heroes itself.
const heroSelectionMarginSeconds = 30;

declare global {
    interface CDOTAGameRules {
        Addon: GameMode;
    }
}

@reloadable
export class GameMode {
    private readonly draft = new Draft(() => this.OnDraftFinished());
    private readonly heroBuilder = new HeroBuilder(
        playerId => this.draft.getPlayer(playerId),
        entry => this.draft.getAbilityHero(entry),
    );

    private OnDraftFinished(): void {
        print("Draft finished.");
    }

    /**
     * Heroes that already exist at pre-game never spawn again: tools bots get theirs before the draft,
     * and a player may have picked through Dota's own UI. Build (or replace) them here.
     */
    private RebuildExistingHeroes(): void {
        for (const hero of HeroList.GetAllHeroes()) {
            if (hero.IsRealHero() && !hero.IsTempestDouble()) this.heroBuilder.onHeroSpawned(hero);
        }
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public static Precache(this: void, context: CScriptPrecacheContext) {}

    public static Activate(this: void) {
        // When the addon activates, create a new instance of this GameMode class.
        GameRules.Addon = new GameMode();
    }

    constructor() {
        this.configure();

        // Register event listeners for dota engine events
        ListenToGameEvent("game_rules_state_change", () => this.OnStateChange(), undefined);
        ListenToGameEvent("npc_spawned", event => this.OnNpcSpawned(event), undefined);
        registerAbilityReorder();
        registerShopRules();
        registerGoldTalents();
        registerDevCommands(this.draft, this.heroBuilder);
    }

    private configure(): void {
        const teamSize = config.modes.classic.teamSize;
        GameRules.SetCustomGameTeamMaxPlayers(DotaTeam.GOODGUYS, teamSize);
        GameRules.SetCustomGameTeamMaxPlayers(DotaTeam.BADGUYS, teamSize);

        // The draft runs during Dota's hero selection, on our own HeroSelection screen.
        GameRules.SetShowcaseTime(0);
        GameRules.SetHeroSelectionTime(getMaxDraftSeconds(teamSize * 2) + heroSelectionMarginSeconds);
        const timings = getDraftTimings();
        GameRules.SetStrategyTime(timings.strategySeconds);
        if (timings.preGameSeconds !== null) GameRules.SetPreGameTime(timings.preGameSeconds);
        GameRules.GetGameModeEntity().SetSelectionGoldPenaltyEnabled(false);
        // Tools bots only, for solo testing: the released mode has no bots (docs/DESIGN.md).
        if (IsInToolsMode()) {
            GameRules.GetGameModeEntity().SetBotThinkingEnabled(true);
        }

        applyTurboRules();
    }

    public OnStateChange(): void {
        const state = GameRules.State_Get();

        // Add 4 bots to lobby in tools, two per team, so the draft and the match can be tested alone
        if (IsInToolsMode() && state == GameState.CUSTOM_GAME_SETUP) {
            for (let i = 0; i < 4; i++) {
                Tutorial.AddBot("npc_dota_hero_lina", "", "hard", i % 2 === 0);
            }
        }

        if (state === GameState.CUSTOM_GAME_SETUP) {
            // Automatically skip setup in tools
            if (IsInToolsMode()) {
                Timers.CreateTimer(3, () => {
                    GameRules.FinishCustomGameSetup();
                });
            }
        }

        if (state === GameState.HERO_SELECTION) {
            this.draft.start();
        }

        if (state === GameState.GAME_IN_PROGRESS) {
            applyTurboItemTimings();
        }

        // Start game once pregame hits
        if (state === GameState.PRE_GAME) {
            applyTurboBuildings();
            Timers.CreateTimer(0.5, () => this.RebuildExistingHeroes());
            Timers.CreateTimer(0.2, () => this.StartGame());
        }
    }

    private OnNpcSpawned(event: NpcSpawnedEvent): void {
        const unit = EntIndexToHScript(event.entindex) as CDOTA_BaseNPC | undefined;
        if (unit !== undefined && unit.IsRealHero()) {
            this.heroBuilder.onHeroSpawned(unit as CDOTA_BaseNPC_Hero);
        }
    }

    private StartGame(): void {
        print("Game starting!");

        runDevProbes();
    }

    // Called on script_reload
    public Reload() {
        print("Script reloaded!");

        // Do some stuff here
    }
}
