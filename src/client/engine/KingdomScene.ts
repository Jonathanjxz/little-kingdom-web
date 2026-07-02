import Phaser from "phaser";
import { CARD_COLORS } from "../../game/constants";
import type { Card, CardColor, GameAction, PlayerId, RoomId } from "../../game/types";
import type { PlayerGameView, PublicPlayerView } from "../../game/view";
import type { PublicTimerView } from "../../server/rooms/room-types";
import type { GameViewPayload, PublicRoomView } from "../../server/socket/protocol";
import type { TimeControlMode } from "../../server/timer/time-control";
import {
  canDiscardSelectedCard,
  getLegalPlaceColors,
  getResolvedPlaceColor,
  getSelectedCard,
} from "../gameActions";
import { clearSession, loadSession, saveSession } from "../hooks/useSavedSession";
import { getConnectionState, socket, type SocketConnectionState } from "../socket";

type Screen = "home" | "lobby" | "game" | "loading";
type ActiveInput = "createNickname" | "joinNickname" | "joinRoomId";
type ButtonVariant = "primary" | "danger" | "neutral" | "ghost" | "track";

interface ClickTarget {
  x: number;
  y: number;
  width: number;
  height: number;
  onClick: () => void;
}

interface EngineDebugState {
  screen: Screen;
  connectionStatus: SocketConnectionState["status"];
  activeInput?: ActiveInput;
  createNickname: string;
  joinNickname: string;
  joinRoomId: string;
  roomId?: RoomId;
  playerId?: PlayerId;
  phase?: PlayerGameView["phase"];
  isMyTurn: boolean;
  selectedCardId?: Card["id"];
  handCount: number;
  roomMembers: Array<{
    nickname: string;
    isHost: boolean;
    isConnected: boolean;
  }>;
  viewedPlayerId?: PlayerId;
  buttonLabels: string[];
  domControlCount: number;
}

declare global {
  interface Window {
    __kingdomEngine?: {
      getState: () => EngineDebugState;
    };
  }
}

const GAME_WIDTH = 430;
const GAME_HEIGHT = 932;
const STORAGE_FALLBACK_NICKNAME = "候选人";

const TRACK_META: Record<CardColor, { label: string; code: string; color: number }> = {
  red: { label: "娱乐", code: "ENT", color: 0xe05b66 },
  blue: { label: "科技", code: "TEC", color: 0x4f9ed8 },
  yellow: { label: "教育", code: "EDU", color: 0xd4ae51 },
  green: { label: "医疗", code: "MED", color: 0x54b987 },
  white: { label: "创业", code: "NEW", color: 0xd3dde5 },
};

const MODE_LABELS: Record<TimeControlMode, string> = {
  none: "无限时",
  standard: "标准",
  relaxed: "宽松",
};

function cardColor(card: Card): number {
  return card.type === "wild" ? 0xf0b356 : TRACK_META[card.color].color;
}

function formatCard(card: Card): string {
  if (card.type === "wild") return "贵人 / 奇迹";
  const track = TRACK_META[card.color].label;
  return card.type === "multiplier" ? `${track}风口` : `${track} 能力 ${card.value}`;
}

function cardValue(card: Card): string {
  if (card.type === "wild") return "✦";
  return card.type === "multiplier" ? "↗" : String(card.value);
}

function cardKind(card: Card): string {
  if (card.type === "wild") return "特殊机会";
  return card.type === "multiplier" ? "风口" : "能力等级";
}

export class KingdomScene extends Phaser.Scene {
  private objects: Phaser.GameObjects.GameObject[] = [];
  private clickTargets: ClickTarget[] = [];
  private buttonLabels: string[] = [];
  private root?: Phaser.GameObjects.Container;
  private connectionState: SocketConnectionState = { status: "connecting" };
  private teardownConnection?: () => void;
  private screen: Screen = "home";
  private room?: PublicRoomView;
  private roomId?: RoomId;
  private playerId?: PlayerId;
  private view?: PlayerGameView;
  private timer?: PublicTimerView;
  private timerReceivedAt = 0;
  private selectedCardId?: Card["id"];
  private viewedPlayerId?: PlayerId;
  private renderScale = 1;
  private activeInput?: ActiveInput;
  private createNickname = "";
  private joinNickname = "";
  private joinRoomId = "";
  private timeMode: TimeControlMode = "standard";
  private error?: string;
  private pending?: string;
  private restoredSocketId?: string;
  private soundEnabled = false;

  constructor() {
    super("KingdomScene");
  }

  create() {
    const renderWidth = Number(this.game.config.width);
    const renderHeight = Number(this.game.config.height);
    this.renderScale = renderWidth / GAME_WIDTH;
    this.cameras.main.setViewport(0, 0, renderWidth, renderHeight);
    this.cameras.main.setSize(renderWidth, renderHeight);
    this.cameras.main.setZoom(1);
    this.cameras.main.setScroll(0, 0);
    this.root = this.add.container(0, 0);
    this.root.setScale(this.renderScale);
    this.input.setDefaultCursor("default");
    this.game.canvas.addEventListener("pointerup", this.handleCanvasPointerUp);
    window.addEventListener("keydown", this.handleKeyDown);
    this.teardownConnection = getConnectionState((state) => {
      this.connectionState = state;
      this.render();
    });
    socket.on("room:updated", this.handleRoomUpdated);
    socket.on("game:view", this.handleGameView);
    socket.on("connect", this.restoreSavedSession);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanup);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.cleanup);
    this.time.addEvent({
      delay: 500,
      loop: true,
      callback: () => {
        if (this.screen === "game") this.render();
      },
    });
    window.__kingdomEngine = {
      getState: () => this.getDebugState(),
    };
    if (socket.connected) this.restoreSavedSession();
    this.render();
  }

  private cleanup = () => {
    this.teardownConnection?.();
    socket.off("room:updated", this.handleRoomUpdated);
    socket.off("game:view", this.handleGameView);
    socket.off("connect", this.restoreSavedSession);
    this.game.canvas.removeEventListener("pointerup", this.handleCanvasPointerUp);
    window.removeEventListener("keydown", this.handleKeyDown);
    if (window.__kingdomEngine?.getState === this.getDebugState) {
      window.__kingdomEngine = undefined;
    }
  };

  private handleRoomUpdated = (payload: { room: PublicRoomView }) => {
    this.room = payload.room;
    this.roomId = payload.room.roomId;
    if (!this.view && payload.room.status === "waiting") {
      this.screen = "lobby";
    }
    this.render();
  };

  private handleGameView = (payload: GameViewPayload) => {
    this.view = payload.view;
    this.timer = payload.timer;
    this.timerReceivedAt = Date.now();
    this.screen = "game";
    if (this.selectedCardId && !getSelectedCard(this.view.self.hand, this.selectedCardId)) {
      this.selectedCardId = undefined;
    }
    if (this.viewedPlayerId && !this.view.players.some((player) => player.id === this.viewedPlayerId)) {
      this.viewedPlayerId = undefined;
    }
    this.render();
  };

  private restoreSavedSession = () => {
    const socketId = socket.id;
    if (!socketId || this.restoredSocketId === socketId) return;
    const saved = loadSession();
    if (!saved) return;

    this.restoredSocketId = socketId;
    this.pending = "reconnect";
    this.screen = this.view ? "game" : "loading";
    this.render();
    socket.emit("room:reconnect", saved, (ack) => {
      this.pending = undefined;
      if (!ack.ok) {
        if (ack.error?.code === "INVALID_SESSION") {
          clearSession();
          this.resetToHome();
        } else {
          this.error = `恢复会话失败：${ack.error?.code ?? "UNKNOWN_ERROR"}`;
          this.screen = "home";
        }
        this.render();
        return;
      }

      const data = ack.data!;
      this.error = undefined;
      this.room = data.room;
      this.roomId = data.room.roomId;
      this.playerId = data.playerId;
      if (data.view) {
        this.view = data.view;
        this.screen = "game";
      } else {
        this.view = undefined;
        this.screen = "lobby";
      }
      if (data.timer) {
        this.timer = data.timer;
        this.timerReceivedAt = Date.now();
      }
      saveSession({
        roomId: data.room.roomId,
        playerId: data.playerId,
        sessionToken: data.sessionToken,
      });
      this.render();
    });
  };

  private handleKeyDown = (event: KeyboardEvent) => {
    if (!this.activeInput) return;
    if (event.key === "Tab") {
      event.preventDefault();
      this.activeInput = this.activeInput === "createNickname" ? "joinNickname" : undefined;
      this.render();
      return;
    }
    if (event.key === "Escape") {
      this.activeInput = undefined;
      this.render();
      return;
    }
    if (event.key === "Enter") {
      if (this.activeInput === "createNickname") this.createRoom();
      if (this.activeInput === "joinNickname" || this.activeInput === "joinRoomId") this.joinRoom();
      return;
    }
    if (event.key === "Backspace") {
      this.setInputValue(this.activeInput, this.getInputValue(this.activeInput).slice(0, -1));
      this.render();
      return;
    }
    if (event.key.length !== 1 || event.metaKey || event.ctrlKey || event.altKey) return;

    const next = `${this.getInputValue(this.activeInput)}${event.key}`;
    const maxLength = this.activeInput === "joinRoomId" ? 22 : 14;
    if (next.length > maxLength) return;
    if (this.activeInput === "joinRoomId" && !/^[A-Za-z0-9_-]+$/.test(event.key)) return;
    this.setInputValue(this.activeInput, next);
    this.render();
  };

  private handleCanvasPointerUp = (event: PointerEvent) => {
    const rect = this.game.canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * GAME_WIDTH;
    const y = ((event.clientY - rect.top) / rect.height) * GAME_HEIGHT;
    for (let index = this.clickTargets.length - 1; index >= 0; index--) {
      const target = this.clickTargets[index]!;
      if (
        x >= target.x &&
        x <= target.x + target.width &&
        y >= target.y &&
        y <= target.y + target.height
      ) {
        target.onClick();
        return;
      }
    }
    if (this.activeInput) {
      this.activeInput = undefined;
      this.render();
    }
  };

  private getInputValue(input: ActiveInput): string {
    if (input === "createNickname") return this.createNickname;
    if (input === "joinNickname") return this.joinNickname;
    return this.joinRoomId;
  }

  private setInputValue(input: ActiveInput, value: string): void {
    if (input === "createNickname") this.createNickname = value;
    else if (input === "joinNickname") this.joinNickname = value;
    else this.joinRoomId = value;
  }

  private getDebugState(): EngineDebugState {
    return {
      screen: this.screen,
      connectionStatus: this.connectionState.status,
      activeInput: this.activeInput,
      createNickname: this.createNickname,
      joinNickname: this.joinNickname,
      joinRoomId: this.joinRoomId,
      roomId: this.roomId,
      playerId: this.playerId,
      phase: this.view?.phase,
      isMyTurn: Boolean(this.view && this.view.currentPlayerId === this.playerId),
      selectedCardId: this.selectedCardId,
      handCount: this.view?.self.hand.length ?? 0,
      roomMembers: this.room?.members.map((member) => ({
        nickname: member.nickname,
        isHost: member.isHost,
        isConnected: member.isConnected,
      })) ?? [],
      viewedPlayerId: this.viewedPlayerId,
      buttonLabels: [...this.buttonLabels],
      domControlCount: document.querySelectorAll("button,input,select,textarea").length,
    };
  }

  private render(): void {
    this.clearObjects();
    this.buttonLabels = [];
    this.drawBackground();
    if (this.screen === "loading") this.renderLoading();
    else if (this.screen === "lobby" && this.room) this.renderLobby();
    else if (this.screen === "game" && this.view) this.renderGame();
    else this.renderHome();
    if (this.error) this.drawError();
    if (this.pending) this.drawPending();
  }

  private clearObjects(): void {
    for (const object of this.objects) object.destroy();
    this.objects = [];
    this.clickTargets = [];
  }

  private track<T extends Phaser.GameObjects.GameObject>(object: T): T {
    this.objects.push(object);
    this.root?.add(object);
    return object;
  }

  private drawBackground(): void {
    const bg = this.track(this.add.graphics());
    bg.fillStyle(0x140a18, 1);
    bg.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    bg.fillStyle(0xff6b3d, 0.13);
    bg.fillCircle(345, 82, 118);
    bg.fillStyle(0x5ce6a4, 0.08);
    bg.fillCircle(54, 790, 170);
    bg.lineStyle(1, 0x38294b, 0.42);
    for (let y = 32; y < GAME_HEIGHT; y += 34) {
      bg.lineBetween(18, y, GAME_WIDTH - 18, y + 44);
    }
    bg.lineStyle(1, 0xffd166, 0.12);
    bg.strokeCircle(GAME_WIDTH / 2, 438, 240);
  }

  private renderHome(): void {
    this.text(24, 34, "THE LAST OPENING", 13, 0xffd166, { fontStyle: "bold" });
    this.text(24, 60, "最后岗位", 56, 0xfff3d0, { fontStyle: "bold" });
    this.text(27, 126, "在最后一次招聘浪潮中，押注你的职业命运。", 17, 0xd8c7ff);
    this.statusPill(272, 34, 134, this.connectionLabel(), this.connectionColor());

    this.drawEmblem(214, 214, 86, 0xff744a);
    this.text(214, 318, "组队开局", 24, 0xf5f0e8, { align: "center", fontStyle: "bold" }).setOrigin(0.5, 0);

    this.panel(20, 370, 390, 232, "创建房间");
    this.inputBox(42, 438, 346, 44, "候选人昵称", this.createNickname, "createNickname");
    this.text(42, 499, "机会窗口", 14, 0xbba6dc);
    this.modeButton(42, 523, "none");
    this.modeButton(142, 523, "standard");
    this.modeButton(242, 523, "relaxed");
    this.button(42, 558, 346, 44, "开放岗位窗口", () => this.createRoom(), "primary", !this.createNickname.trim() || Boolean(this.pending));

    this.panel(20, 622, 390, 258, "加入房间");
    this.inputBox(42, 690, 346, 44, "候选人昵称", this.joinNickname, "joinNickname");
    this.inputBox(42, 760, 346, 44, "房间编号", this.joinRoomId, "joinRoomId");
    this.button(
      42,
      826,
      346,
      44,
      "进入人才交易所",
      () => this.joinRoom(),
      "primary",
      !this.joinNickname.trim() || !this.joinRoomId.trim() || Boolean(this.pending),
    );
  }

  private renderLoading(): void {
    this.drawEmblem(GAME_WIDTH / 2, 390, 90, 0xffd166);
    this.text(GAME_WIDTH / 2, 500, "读取存档", 28, 0xf5f0e8, { align: "center", fontStyle: "bold" }).setOrigin(0.5);
    this.text(GAME_WIDTH / 2, 540, this.connectionLabel(), 16, 0xbba6dc, { align: "center" }).setOrigin(0.5);
  }

  private renderLobby(): void {
    const room = this.room!;
    const isHost = room.hostPlayerId === this.playerId;
    this.text(24, 38, "候选人集结", 38, 0xfff3d0, { fontStyle: "bold" });
    this.statusPill(272, 42, 134, this.connectionLabel(), this.connectionColor());
    this.panel(20, 108, 390, 116, "房间密令");
    this.text(42, 160, room.roomId, 34, 0xffd166, { fontStyle: "bold" });
    this.button(300, 160, 86, 34, "离开", () => this.leaveRoom(), "ghost", Boolean(this.pending));

    this.panel(20, 248, 390, 318, "候选人");
    room.members.forEach((member, index) => {
      const y = 306 + index * 58;
      this.roundRect(42, y, 346, 46, 16, member.isConnected ? 0x17112a : 0x241417, 0.96, member.isHost ? 0xffd166 : 0x654a8a, 2);
      this.drawAvatar(66, y + 23, member.isHost ? 0xffd166 : 0x7ec8ff);
      this.text(94, y + 9, member.nickname, 19, 0xf5f0e8, { fontStyle: "bold" });
      this.text(252, y + 12, member.isHost ? "队长" : "队员", 14, 0xbba6dc);
      this.text(332, y + 12, member.isConnected ? "在线" : "离线", 14, member.isConnected ? 0x7be3a4 : 0xff9a8a);
    });

    this.panel(20, 592, 390, 188, "本局情报");
    this.ruleRow(44, 648, "窗口", MODE_LABELS[room.timeControl.mode]);
    this.ruleRow(44, 690, "人数", "2-4 人");
    this.ruleRow(44, 732, "行动", "规划 / 寻机");
    if (isHost) {
      this.button(
        42,
        824,
        346,
        54,
        room.members.length < 2 ? "等待更多候选人" : "开启最后岗位",
        () => this.startGame(),
        "primary",
        room.members.length < 2 || Boolean(this.pending),
      );
    } else {
      this.text(58, 834, "等待队长开启最后岗位。", 18, 0xbba6dc);
    }
  }

  private renderGame(): void {
    const view = this.view!;
    const isMyTurn = view.currentPlayerId === this.playerId;
    const isPlay = view.phase === "play";
    const isDraw = view.phase === "draw";
    const selectedCard = getSelectedCard(view.self.hand, this.selectedCardId);
    const legalColors = getLegalPlaceColors(selectedCard, view.self.columns);
    const selectedPlaceColor = getResolvedPlaceColor(selectedCard, legalColors);
    const viewedPlayer = this.getViewedPlayer(view);

    this.drawStatusPanel(
      view,
      isMyTurn,
      isMyTurn && isDraw,
      view.players.filter((player) => player.id !== this.playerId),
    );
    this.drawColumns(view, viewedPlayer);
    this.drawMarket(view, isMyTurn && isDraw);
    this.drawHand(view, isMyTurn && isPlay, selectedCard, selectedPlaceColor);
    if (view.finalResult) this.drawFinalRanking(view);
  }

  private drawStatusPanel(
    view: PlayerGameView,
    isMyTurn: boolean,
    canDrawFromDeck: boolean,
    opponents: PublicPlayerView[],
  ): void {
    this.roundRect(16, 16, 398, 142, 22, 0x161027, 0.98, isMyTurn ? 0xffd166 : 0x654a8a, 2);
    this.text(34, 30, view.phase === "play" ? "规划转型" : view.phase === "draw" ? "寻找机会" : "结算", 26, 0xfff3d0, { fontStyle: "bold" });
    this.text(34, 62, isMyTurn ? "轮到你" : "等待回合", 14, isMyTurn ? 0x7be3a4 : 0xbba6dc);
    this.text(268, 28, `${this.remainingSeconds()}s`, 28, 0xff744a, { fontStyle: "bold" });
    this.text(314, 62, `${this.extraSeconds()}s 备时`, 13, 0xbba6dc);
    this.button(356, 26, 42, 34, this.soundEnabled ? "开" : "关", () => {
      this.soundEnabled = !this.soundEnabled;
      this.render();
    }, "ghost");

    this.roundRect(32, 84, 366, 28, 12, isMyTurn ? 0x2a1511 : 0x111b24, 0.98, isMyTurn ? 0xff744a : 0x405667, 1);
    this.text(46, 91, isMyTurn ? "你的回合" : "等待中", 13, isMyTurn ? 0xffd166 : 0xbba6dc, { fontStyle: "bold" });
    const message = isMyTurn
      ? view.phase === "play"
        ? "选一张手牌，投入赛道或市场。"
        : "从岗位池或人才市场获取机会。"
      : "观察局势，等待回合推进。";
    this.text(112, 91, message, 13, 0xf5f0e8);

    this.roundRect(32, 118, 140, 28, 12, 0x0b0914, 1, 0xff744a, 1);
    this.text(46, 125, "岗位池", 12, 0xbba6dc, { fontStyle: "bold" });
    this.text(94, 122, String(view.deckCount), 18, 0xff744a, { fontStyle: "bold" });
    if (canDrawFromDeck) {
      this.button(112, 117, 52, 30, "抽取", () => this.drawFromDeck(), "primary");
    } else {
      this.text(128, 126, "未开", 11, 0x76698f);
    }

    this.text(188, 124, "对手", 12, 0xbba6dc, { fontStyle: "bold" });
    if (opponents.length === 0) {
      this.text(226, 124, "等待", 12, 0x76698f);
      return;
    }
    opponents.slice(0, 3).forEach((player, index) => {
      const x = 226 + index * 56;
      const color = player.isConnected ? 0xbba6dc : 0xff9a8a;
      const isCurrent = player.id === view.currentPlayerId;
      const isViewed = player.id === this.viewedPlayerId;
      this.roundRect(x, 116, 48, 32, 10, isViewed ? 0x1d1731 : 0x0b0914, 1, isViewed ? 0xffd166 : color, isViewed ? 2 : 1);
      this.drawAvatar(x + 12, 132, color);
      if (isCurrent) this.dot(x + 24, 122, 4, 0x7be3a4);
      this.text(x + 25, 127, player.nickname.slice(0, 3), 10, 0xf5f0e8, { fontStyle: "bold" });
      this.clickZone(x, 116, 48, 32, () => {
        this.viewedPlayerId = player.id;
        this.render();
      });
    });
  }

  private getViewedPlayer(view: PlayerGameView): PublicPlayerView {
    return view.players.find((player) => player.id === this.viewedPlayerId) ?? view.self;
  }

  private drawMarket(view: PlayerGameView, canDraw: boolean): void {
    this.sectionTitle(36, 504, "人才市场");
    CARD_COLORS.forEach((color, index) => {
      const x = 34 + index * 74;
      const y = 542;
      const pile = view.discardPiles[color];
      const topCard = pile[pile.length - 1];
      this.roundRect(x, y, 64, 40, 10, 0x0b0914, 1, TRACK_META[color].color);
      this.text(x + 7, y + 8, topCard ? cardValue(topCard) : "空", 18, topCard ? cardColor(topCard) : 0x76698f, { fontStyle: "bold" });
      this.text(x + 36, y + 12, `${pile.length}`, 12, 0xbba6dc);
      if (canDraw && topCard) {
        this.clickZone(x, y, 64, 40, () => this.drawFromMarket(color));
      }
    });
  }

  private drawColumns(view: PlayerGameView, owner: PublicPlayerView): void {
    const isSelf = owner.id === view.self.id;
    this.sectionTitle(36, 188, isSelf ? "我的赛道" : `${owner.nickname} 的赛道`);
    if (!isSelf) {
      this.button(338, 192, 52, 28, "自己", () => {
        this.viewedPlayerId = undefined;
        this.render();
      }, "ghost");
    }
    CARD_COLORS.forEach((color, index) => {
      const x = 34;
      const y = 222 + index * 48;
      const width = 362;
      this.roundRect(x, y, width, 42, 12, 0x0b0914, 1, TRACK_META[color].color, 2);
      this.text(x + 12, y + 7, TRACK_META[color].label, 17, 0xf5f0e8, { fontStyle: "bold" });
      const cards = owner.columns[color].cards;
      if (cards.length === 0) {
        this.text(x + 94, y + 9, "空", 16, 0x76698f);
        return;
      }
      cards.slice(-8).forEach((placed, cardIndex) => {
        this.text(x + 94 + cardIndex * 30, y + 9, cardValue(placed.card), 16, cardColor(placed.card), { fontStyle: "bold" });
      });
    });
  }

  private drawHand(
    view: PlayerGameView,
    active: boolean,
    selectedCard: Card | undefined,
    selectedPlaceColor: CardColor | undefined,
  ): void {
    this.panel(16, 626, 398, 282, "手牌");
    const sorted = this.sortHand(view.self.hand);
    sorted.forEach((card, index) => {
      const x = 32 + (index % 4) * 94;
      const y = 672 + Math.floor(index / 4) * 92;
      this.drawCard(x, y, 78, 82, card, active, this.selectedCardId === card.id);
    });

    if (!active || !selectedCard) return;
    this.roundRect(32, 878, 366, 42, 14, 0x271218, 0.98, 0xff744a, 2);
    this.text(48, 890, formatCard(selectedCard), 14, 0xf5f0e8, { fontStyle: "bold" });
    const trackText = selectedCard.type === "wild"
      ? "任意赛道"
      : `${TRACK_META[selectedCard.color].label}赛道`;
    this.text(146, 890, trackText, 12, 0xbba6dc);
    this.button(
      232,
      884,
      78,
      30,
      "赛道",
      () => {
        if (selectedPlaceColor) this.placeSelectedCard(selectedPlaceColor);
      },
      "primary",
      !selectedPlaceColor,
    );
    this.button(
      316,
      884,
      72,
      30,
      "市场",
      () => this.discardSelectedCard(),
      "danger",
      !canDiscardSelectedCard(selectedCard),
    );
  }

  private drawCard(
    x: number,
    y: number,
    width: number,
    height: number,
    card: Card,
    active: boolean,
    selected: boolean,
  ): void {
    const fill = selected ? 0x2b1221 : 0x100d1c;
    this.roundRect(x, y, width, height, 12, fill, 1, selected ? 0xffd166 : cardColor(card), selected ? 3 : 2);
    this.text(x + 8, y + 8, cardKind(card), 9, 0xbba6dc);
    this.text(x + 10, y + 26, cardValue(card), 30, cardColor(card), { fontStyle: "bold" });
    this.text(x + 8, y + 62, formatCard(card), 10, 0xf5f0e8);
    if (active) {
      this.clickZone(x, y, width, height, () => {
        this.selectedCardId = this.selectedCardId === card.id ? undefined : card.id;
        this.render();
      });
    }
  }

  private drawFinalRanking(view: PlayerGameView): void {
    this.roundRect(36, 160, 358, 520, 24, 0x0b0914, 0.98, 0xffd166, 3);
    this.text(116, 206, "最终排名", 36, 0xfff3d0, { fontStyle: "bold" });
    view.finalResult?.rankings.forEach((ranking, index) => {
      this.text(74, 286 + index * 62, `${ranking.rank}. ${ranking.nickname}`, 22, ranking.isWinner ? 0xffd166 : 0xd8c7ff);
      this.text(278, 286 + index * 62, `${ranking.score}`, 24, 0xf5f0e8);
    });
  }

  private createRoom(): void {
    const nickname = this.createNickname.trim() || STORAGE_FALLBACK_NICKNAME;
    if (this.pending) return;
    this.pending = "create";
    this.error = undefined;
    this.render();
    socket.emit("room:create", { nickname, timeControlMode: this.timeMode }, (ack) => {
      this.pending = undefined;
      if (!ack.ok) {
        this.error = `${ack.error?.code ?? "ERROR"}: ${ack.error?.message ?? "创建失败"}`;
        this.render();
        return;
      }
      const data = ack.data!;
      this.room = data.room;
      this.roomId = data.room.roomId;
      this.playerId = data.playerId;
      this.view = undefined;
      this.screen = "lobby";
      saveSession({
        roomId: data.room.roomId,
        playerId: data.playerId,
        sessionToken: data.sessionToken,
      });
      this.render();
    });
  }

  private joinRoom(): void {
    const nickname = this.joinNickname.trim() || STORAGE_FALLBACK_NICKNAME;
    const roomId = this.joinRoomId.trim() as RoomId;
    if (!roomId || this.pending) return;
    this.pending = "join";
    this.error = undefined;
    this.render();
    socket.emit("room:join", { roomId, nickname }, (ack) => {
      this.pending = undefined;
      if (!ack.ok) {
        this.error = `${ack.error?.code ?? "ERROR"}: ${ack.error?.message ?? "加入失败"}`;
        this.render();
        return;
      }
      const data = ack.data!;
      this.room = data.room;
      this.roomId = data.room.roomId;
      this.playerId = data.playerId;
      this.view = undefined;
      this.screen = "lobby";
      saveSession({
        roomId: data.room.roomId,
        playerId: data.playerId,
        sessionToken: data.sessionToken,
      });
      this.render();
    });
  }

  private leaveRoom(): void {
    if (this.pending) return;
    this.pending = "leave";
    this.render();
    socket.emit("room:leave", {}, (ack) => {
      this.pending = undefined;
      if (!ack.ok) {
        this.error = `${ack.error?.code ?? "ERROR"}: ${ack.error?.message ?? "离开失败"}`;
        this.render();
        return;
      }
      clearSession();
      this.resetToHome();
      this.render();
    });
  }

  private startGame(): void {
    if (this.pending) return;
    this.pending = "start";
    this.render();
    socket.emit("game:start", {}, (ack) => {
      this.pending = undefined;
      if (!ack.ok) {
        this.error = `${ack.error?.code ?? "ERROR"}: ${ack.error?.message ?? "开始失败"}`;
      } else {
        this.room = ack.data!.room;
      }
      this.render();
    });
  }

  private placeSelectedCard(color: CardColor): void {
    if (!this.selectedCardId) return;
    this.sendAction({
      type: "PLACE_CARD",
      playerId: "" as PlayerId,
      cardId: this.selectedCardId,
      color,
    });
  }

  private discardSelectedCard(): void {
    if (!this.selectedCardId) return;
    this.sendAction({
      type: "DISCARD_CARD",
      playerId: "" as PlayerId,
      cardId: this.selectedCardId,
    });
  }

  private drawFromDeck(): void {
    this.sendAction({
      type: "DRAW_FROM_DECK",
      playerId: "" as PlayerId,
    });
  }

  private drawFromMarket(color: CardColor): void {
    this.sendAction({
      type: "DRAW_FROM_DISCARD",
      playerId: "" as PlayerId,
      color,
    });
  }

  private sendAction(action: GameAction): void {
    if (this.pending) return;
    this.pending = "action";
    this.render();
    socket.emit("game:action", { action }, (ack) => {
      this.pending = undefined;
      if (!ack.ok) {
        this.error = `${ack.error?.code ?? "ERROR"}: ${ack.error?.message ?? "行动失败"}`;
        this.render();
        return;
      }
      this.error = undefined;
      this.selectedCardId = undefined;
      this.view = ack.data!.view;
      this.timer = ack.data!.timer;
      this.timerReceivedAt = Date.now();
      this.screen = "game";
      this.render();
    });
  }

  private resetToHome(): void {
    this.room = undefined;
    this.roomId = undefined;
    this.playerId = undefined;
    this.view = undefined;
    this.timer = undefined;
    this.selectedCardId = undefined;
    this.screen = "home";
  }

  private sortHand(hand: Card[]): Card[] {
    const order: Record<CardColor, number> = { red: 0, blue: 1, yellow: 2, green: 3, white: 4 };
    return [...hand].sort((a, b) => {
      if (a.type === "wild") return b.type === "wild" ? 0 : 1;
      if (b.type === "wild") return -1;
      const colorDifference = order[a.color] - order[b.color];
      if (colorDifference !== 0) return colorDifference;
      if (a.type === "multiplier") return b.type === "multiplier" ? 0 : -1;
      if (b.type === "multiplier") return 1;
      return a.value - b.value;
    });
  }

  private remainingSeconds(): number {
    if (!this.timer?.deadlineAt) return 0;
    const now = this.timer.serverNow + (Date.now() - this.timerReceivedAt);
    return Math.max(0, Math.ceil((this.timer.deadlineAt - now) / 1000));
  }

  private extraSeconds(): number {
    if (this.timer?.extraRemainingSeconds === undefined) return 0;
    if (!this.timer.startedAt || !this.timer.baseSeconds) return this.timer.extraRemainingSeconds;
    const now = this.timer.serverNow + (Date.now() - this.timerReceivedAt);
    const used = Math.max(0, Math.ceil((now - (this.timer.startedAt + this.timer.baseSeconds * 1000)) / 1000));
    return Math.max(0, this.timer.extraRemainingSeconds - used);
  }

  private connectionLabel(): string {
    switch (this.connectionState.status) {
      case "connected":
        return "已接入人才网络";
      case "connecting":
        return "正在连接";
      case "reconnecting":
        return `重连中 ${this.connectionState.attempt}`;
      case "reconnect_failed":
        return "连接失败";
      case "disconnected":
        return "已断开";
    }
  }

  private connectionColor(): number {
    return this.connectionState.status === "connected" ? 0x7be3a4 : 0xff9a8a;
  }

  private drawError(): void {
    this.roundRect(22, 24, 386, 54, 16, 0x471914, 0.98, 0xff744a, 2);
    this.text(42, 40, this.error ?? "", 15, 0xffc4b7);
  }

  private drawPending(): void {
    this.roundRect(96, 438, 238, 50, 18, 0x0b0914, 0.96, 0xffd166, 2);
    this.text(136, 454, "同步中...", 18, 0xffd166, { fontStyle: "bold" });
  }

  private panel(x: number, y: number, width: number, height: number, title?: string): void {
    this.roundRect(x, y, width, height, 20, 0x151027, 0.94, 0x5a3f78, 2);
    if (title) this.text(x + 20, y + 18, title, 21, 0xfff3d0, { fontStyle: "bold" });
  }

  private sectionTitle(x: number, y: number, title: string): void {
    this.text(x, y, title, 24, 0xfff3d0, { fontStyle: "bold" });
  }

  private inputBox(
    x: number,
    y: number,
    width: number,
    height: number,
    label: string,
    value: string,
    field: ActiveInput,
  ): void {
    this.text(x, y - 22, label, 14, 0xbba6dc);
    this.roundRect(x, y, width, height, 14, 0x0b0914, 1, this.activeInput === field ? 0xffd166 : 0x654a8a, 2);
    this.text(x + 16, y + 12, value || "点击后输入", 16, value ? 0xf5f0e8 : 0x76698f);
    if (this.activeInput === field) {
      this.text(x + width - 24, y + 12, "▌", 16, 0xffd166);
    }
    this.clickZone(x, y, width, height, () => {
      this.activeInput = field;
      this.render();
    });
  }

  private modeButton(x: number, y: number, mode: TimeControlMode): void {
    this.button(
      x,
      y,
      90,
      34,
      MODE_LABELS[mode],
      () => {
        this.timeMode = mode;
        this.render();
      },
      this.timeMode === mode ? "primary" : "neutral",
    );
  }

  private button(
    x: number,
    y: number,
    width: number,
    height: number,
    label: string,
    onClick: () => void,
    variant: ButtonVariant = "neutral",
    disabled = false,
  ): void {
    this.buttonLabels.push(label);
    const fill = disabled
      ? 0x221a2f
      : variant === "primary"
        ? 0xffd166
        : variant === "danger"
          ? 0x9b2f44
          : variant === "ghost"
            ? 0x160f26
            : variant === "track"
              ? 0x19213b
              : 0x241a36;
    const stroke = variant === "primary" ? 0xfff3d0 : variant === "danger" ? 0xff8a9d : 0x7b5aa7;
    const textColor = disabled
      ? 0x76698f
      : variant === "primary"
        ? 0x241200
        : 0xf5f0e8;
    this.roundRect(x, y, width, height, 14, fill, 0.98, stroke, 2);
    const glint = this.track(this.add.graphics());
    glint.fillStyle(0xffffff, disabled ? 0.03 : 0.14);
    glint.fillRoundedRect(x + 5, y + 5, width - 10, Math.max(5, height * 0.24), 8);
    this.text(x + width / 2, y + height / 2 - 9, label, height < 36 ? 13 : 17, textColor, {
      align: "center",
      fontStyle: "bold",
    }).setOrigin(0.5, 0);
    if (disabled) return;
    this.clickZone(x, y, width, height, onClick);
  }

  private clickZone(
    x: number,
    y: number,
    width: number,
    height: number,
    onClick: () => void,
  ): void {
    this.clickTargets.push({ x, y, width, height, onClick });
  }

  private roundRect(
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number,
    fill: number,
    alpha: number,
    stroke: number,
    lineWidth = 1,
  ): void {
    const graphics = this.track(this.add.graphics());
    graphics.fillStyle(fill, alpha);
    graphics.fillRoundedRect(x, y, width, height, radius);
    graphics.lineStyle(lineWidth, stroke, 0.85);
    graphics.strokeRoundedRect(x, y, width, height, radius);
  }

  private statusPill(x: number, y: number, width: number, label: string, color: number): void {
    this.roundRect(x, y, width, 28, 14, 0x100d1c, 0.92, color, 1);
    this.text(x + width / 2, y + 7, label, 11, color, { align: "center", fontStyle: "bold" }).setOrigin(0.5, 0);
  }

  private drawEmblem(x: number, y: number, radius: number, color: number): void {
    const graphics = this.track(this.add.graphics());
    graphics.fillStyle(0x120d20, 0.96);
    graphics.fillCircle(x, y, radius);
    graphics.lineStyle(4, color, 0.9);
    graphics.strokeCircle(x, y, radius);
    graphics.lineStyle(2, 0xfff3d0, 0.5);
    graphics.strokeCircle(x, y, radius - 14);
    graphics.fillStyle(color, 0.95);
    graphics.fillTriangle(x, y - radius + 28, x - 24, y + 18, x + 24, y + 18);
    graphics.fillStyle(0xfff3d0, 0.95);
    graphics.fillCircle(x, y + 26, 12);
  }

  private drawAvatar(x: number, y: number, color: number): void {
    const graphics = this.track(this.add.graphics());
    graphics.fillStyle(0x0b0914, 1);
    graphics.fillCircle(x, y, 12);
    graphics.lineStyle(2, color, 0.95);
    graphics.strokeCircle(x, y, 12);
    graphics.fillStyle(color, 0.9);
    graphics.fillCircle(x, y - 3, 4);
    graphics.fillRoundedRect(x - 6, y + 3, 12, 5, 3);
  }

  private dot(x: number, y: number, radius: number, color: number): void {
    const graphics = this.track(this.add.graphics());
    graphics.fillStyle(0x0b0914, 1);
    graphics.fillCircle(x, y, radius + 2);
    graphics.fillStyle(color, 1);
    graphics.fillCircle(x, y, radius);
  }

  private ruleRow(x: number, y: number, label: string, value: string): void {
    this.roundRect(x, y, 342, 30, 12, 0x0b0914, 0.9, 0x3e2e58);
    this.text(x + 14, y + 7, label, 13, 0xbba6dc, { fontStyle: "bold" });
    this.text(x + 110, y + 6, value, 15, 0xf5f0e8, { fontStyle: "bold" });
  }

  private text(
    x: number,
    y: number,
    content: string,
    size: number,
    color: number,
    extra: Partial<Phaser.Types.GameObjects.Text.TextStyle> = {},
  ): Phaser.GameObjects.Text {
    return this.track(this.add.text(x, y, content, {
      fontFamily: "Inter, PingFang SC, Microsoft YaHei, Arial, sans-serif",
      fontSize: `${size}px`,
      color: `#${color.toString(16).padStart(6, "0")}`,
      resolution: this.renderScale,
      ...extra,
    }));
  }
}
