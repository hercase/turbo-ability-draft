import { config, getDraftTimings } from "../config";
import { buildAbilityPool, DraftPool, findDraftEntry, getDraftableHeroes, pickRandom } from "./pool";

interface DraftPick {
    kind: DraftPickKind;
    name: string;
}

const draftTeams = [DotaTeam.GOODGUYS, DotaTeam.BADGUYS];
// Minimum time between two pings from the same player (anti-spam, not a game rule).
const requestCooldownSeconds = 1;

/** Total picks per player: the base hero plus every ability slot. */
export function getDraftRounds(): number {
    return 1 + config.draft.regularAbilities + config.draft.ultimates;
}

/** Upper bound of the draft's length, used as Dota's hero selection time. */
export function getMaxDraftSeconds(playerCount: number): number {
    const draft = getDraftTimings();
    const rounds = getDraftRounds();
    return (
        draft.planningSeconds + rounds * playerCount * draft.pickTimeSeconds + (rounds - 1) * draft.phaseBreakSeconds
    );
}

/**
 * Official Ability Draft flow: planning, then snake rounds where each player picks the base hero or
 * one ability per turn. Every turn lasts the full pick time; a player who does not pick gets a random
 * valid pick. State is published to the "draft" net table for the Panorama draft screen.
 */
export class Draft {
    private readonly players = new Map<PlayerID, DraftPlayerData>();
    private pool: DraftPool = { heroes: [], abilities: [] };
    private baseOrder: PlayerID[] = [];
    private pickedThisTurn = false;
    private phaseGeneration = 0;
    private state: DraftStateData = {
        phase: "waiting",
        round: 0,
        rounds: getDraftRounds(),
        turn: -1,
        order: [],
        endsAt: 0,
    };

    constructor(private readonly onFinished: (this: void) => void) {
        CustomGameEventManager.RegisterListener("draft_pick", (_, event) => {
            this.tryPick(event.PlayerID, { kind: event.kind, name: event.name });
        });
        CustomGameEventManager.RegisterListener("draft_request", (_, event) => {
            // Booleans from Panorama arrive as 0 | 1.
            this.forwardRequest(event.PlayerID, event.kind, event.name, event.suggest === 1);
        });
    }

    /** Last time each player sent a request, to keep pings from flooding the team. */
    private readonly lastRequest = new Map<PlayerID, number>();

    /**
     * Alt+click (want) or Ctrl+click (suggest) on the board, like the official draft's pings: forwarded
     * to the player's team only, if the entry is on the board and still free.
     */
    private forwardRequest(playerId: PlayerID, kind: DraftPickKind, name: string, suggest: boolean): void {
        const data = this.players.get(playerId);
        if (data === undefined || this.state.phase === "waiting" || this.state.phase === "done") return;
        const now = GameRules.GetGameTime();
        if (now - (this.lastRequest.get(playerId) ?? -10) < requestCooldownSeconds) return;

        const onBoard =
            kind === "hero" ? this.pool.heroes.includes(name) : this.pool.abilities.some(entry => entry.name === name);
        const taken = [...this.players.values()].some(
            other => other.hero === name || other.ultimate === name || other.abilities.includes(name),
        );
        if (!onBoard || taken) return;

        this.lastRequest.set(playerId, now);
        CustomGameEventManager.Send_ServerToTeam(data.team, "draft_request_broadcast", {
            player: playerId,
            kind,
            name,
            suggest,
        });
    }

    public getPlayer(playerId: PlayerID): DraftPlayerData | undefined {
        return this.players.get(playerId);
    }

    /** Pool hero that brought this ability entry to the board. */
    public getAbilityHero(entry: string): string | undefined {
        return this.pool.abilities.find(ability => ability.name === entry)?.hero ?? findDraftEntry(entry)?.hero;
    }

    /** Tools only (tad_build): sets a player's build directly, outside the draft. */
    public setPlayerBuild(playerId: PlayerID, build: DraftPlayerData): void {
        this.players.set(playerId, build);
        this.publishPlayers();
    }

    public isFinished(): boolean {
        return this.state.phase === "done";
    }

    public start(): void {
        if (this.state.phase !== "waiting") return;

        for (const team of draftTeams) {
            for (let slot = 0; slot < PlayerResource.GetPlayerCountForTeam(team); slot++) {
                const playerId = PlayerResource.GetNthPlayerIDOnTeam(team, slot + 1);
                if (!PlayerResource.IsValidPlayerID(playerId)) continue;
                this.players.set(playerId, { team, hero: "", abilities: [], ultimate: "" });
            }
        }
        this.baseOrder = this.buildBaseOrder();

        const heroes = pickRandom(getDraftableHeroes(), this.players.size + config.draft.extraPoolHeroes);
        this.pool = buildAbilityPool(heroes);
        // Drafted abilities need their original hero's particles and sounds; load them during the draft.
        for (const hero of heroes) {
            PrecacheUnitByNameAsync(hero, () => {});
        }

        CustomNetTables.SetTableValue("draft", "pool", this.pool);
        CustomNetTables.SetTableValue("draft", "limits", {
            regularAbilities: config.draft.regularAbilities,
            ultimates: config.draft.ultimates,
            maxAbilitiesPerHero: config.draft.maxAbilitiesPerHero ?? 0,
        });
        this.publishPlayers();

        // Show round 1's order during planning, so players know when they pick before it starts.
        this.state.order = [...this.baseOrder];
        this.setPhase("planning", getDraftTimings().planningSeconds, () => this.startRound(1));

        // Tools only: skip the draft for quick testing (a moment later, so the screen loads first).
        if (IsInToolsMode() && config.dev.instantDraft) Timers.CreateTimer(1, () => this.skipToEnd());
    }

    /** Players shuffled within each team, then interleaved: Radiant 1, Dire 1, Radiant 2, ... */
    private buildBaseOrder(): PlayerID[] {
        const byTeam = draftTeams.map(team => {
            const ids: PlayerID[] = [];
            for (const [playerId, data] of this.players) {
                if (data.team === team) ids.push(playerId);
            }
            return pickRandom(ids, ids.length);
        });
        const order: PlayerID[] = [];
        // reduce, not Math.max(...[]): with no players math.max() errors in Lua.
        const longest = byTeam.reduce((max, ids) => Math.max(max, ids.length), 0);
        for (let index = 0; index < longest; index++) {
            for (const ids of byTeam) {
                if (index < ids.length) order.push(ids[index]);
            }
        }
        return order;
    }

    private startRound(round: number): void {
        this.state.round = round;
        // Snake order: odd rounds use the base order, even rounds reverse it.
        this.state.order = round % 2 === 1 ? [...this.baseOrder] : [...this.baseOrder].reverse();
        this.state.turn = -1;
        this.nextTurn();
    }

    private nextTurn(): void {
        this.state.turn++;
        if (this.state.turn >= this.state.order.length) {
            this.state.turn = -1;
            if (this.state.round >= this.state.rounds) {
                this.finish();
            } else {
                const next = this.state.round + 1;
                this.setPhase("break", getDraftTimings().phaseBreakSeconds, () => this.startRound(next));
            }
            return;
        }

        const playerId = this.state.order[this.state.turn];
        this.pickedThisTurn = false;
        this.setPhase("picking", getDraftTimings().pickTimeSeconds, () => {
            if (!this.pickedThisTurn) this.pickRandomFor(playerId);
            this.nextTurn();
        });

        if (PlayerResource.IsFakeClient(playerId)) {
            this.pickRandomFor(playerId);
        }
    }

    private setPhase(phase: DraftPhase, seconds: number, then: (this: void) => void): void {
        this.state.phase = phase;
        this.state.endsAt = GameRules.GetGameTime() + seconds;
        this.publishState();
        // A phase timer only acts if no newer phase (or a skip) replaced it meanwhile.
        const generation = ++this.phaseGeneration;
        Timers.CreateTimer(seconds, () => {
            if (generation === this.phaseGeneration) then();
        });
    }

    /**
     * Ends the draft at once: every player gets random valid picks for what they still lack. Used by
     * the tools-only quick draft (`dev.instantDraft`, `tad_skip_draft`).
     */
    public skipToEnd(): void {
        if (this.state.phase === "waiting" || this.state.phase === "done") return;
        this.phaseGeneration++;
        for (const playerId of this.baseOrder) {
            for (let pick = 0; pick < this.state.rounds; pick++) this.pickRandomFor(playerId);
        }
        this.finish();
    }

    private tryPick(playerId: PlayerID, pick: DraftPick): void {
        if (this.state.phase !== "picking" || this.pickedThisTurn) return;
        if (this.state.order[this.state.turn] !== playerId) return;
        if (!this.getValidPicks(playerId).some(valid => valid.kind === pick.kind && valid.name === pick.name)) return;
        this.applyPick(playerId, pick);
    }

    private pickRandomFor(playerId: PlayerID): void {
        const [pick] = pickRandom(this.getValidPicks(playerId), 1);
        if (pick !== undefined) this.applyPick(playerId, pick);
    }

    private applyPick(playerId: PlayerID, pick: DraftPick): void {
        const data = this.players.get(playerId)!;
        if (pick.kind === "hero") {
            data.hero = pick.name;
        } else if (this.isUltimate(pick.name)) {
            data.ultimate = pick.name;
        } else {
            data.abilities.push(pick.name);
        }
        this.pickedThisTurn = true;
        this.publishPlayers();
    }

    private getValidPicks(playerId: PlayerID): DraftPick[] {
        const data = this.players.get(playerId);
        if (data === undefined) return [];

        const takenHeroes: string[] = [];
        const takenAbilities: string[] = [];
        for (const [, other] of this.players) {
            if (other.hero !== "") takenHeroes.push(other.hero);
            takenAbilities.push(...other.abilities);
            if (other.ultimate !== "") takenAbilities.push(other.ultimate);
        }

        const picks: DraftPick[] = [];
        if (data.hero === "") {
            for (const hero of this.pool.heroes) {
                if (!takenHeroes.includes(hero)) picks.push({ kind: "hero", name: hero });
            }
        }
        const needsRegular = data.abilities.length < config.draft.regularAbilities;
        const needsUltimate = data.ultimate === "" && config.draft.ultimates > 0;
        for (const ability of this.pool.abilities) {
            if (takenAbilities.includes(ability.name)) continue;
            if (this.reachedHeroLimit(data, ability.hero)) continue;
            if (ability.ultimate ? needsUltimate : needsRegular) picks.push({ kind: "ability", name: ability.name });
        }
        return picks;
    }

    /** House rule: a player may take at most `maxAbilitiesPerHero` abilities from the same hero. */
    private reachedHeroLimit(data: DraftPlayerData, hero: string): boolean {
        const limit = config.draft.maxAbilitiesPerHero;
        if (limit === null) return false;
        const owned = [...data.abilities, data.ultimate].filter(name =>
            this.pool.abilities.some(entry => entry.name === name && entry.hero === hero),
        );
        return owned.length >= limit;
    }

    private isUltimate(ability: string): boolean {
        return this.pool.abilities.some(entry => entry.name === ability && entry.ultimate);
    }

    private finish(): void {
        this.state.phase = "done";
        this.state.endsAt = GameRules.GetGameTime();
        this.publishState();

        for (const [playerId, data] of this.players) {
            PlayerResource.GetPlayer(playerId)?.SetSelectedHero(data.hero);
        }
        this.onFinished();
    }

    private publishState(): void {
        CustomNetTables.SetTableValue("draft", "state", this.state);
    }

    private publishPlayers(): void {
        const players: Record<string, DraftPlayerData> = {};
        for (const [playerId, data] of this.players) {
            players[tostring(playerId)] = data;
        }
        CustomNetTables.SetTableValue("draft", "players", players);
    }
}
