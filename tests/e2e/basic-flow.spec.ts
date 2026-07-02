import { expect, test } from "@playwright/test";

type EngineState = {
  screen: "home" | "lobby" | "game" | "loading";
  connectionStatus: string;
  activeInput?: "createNickname" | "joinNickname" | "joinRoomId";
  createNickname: string;
  joinNickname: string;
  joinRoomId: string;
  roomId?: string;
  playerId?: string;
  phase?: "play" | "draw" | "finished";
  isMyTurn: boolean;
  selectedCardId?: string;
  handCount: number;
  roomMembers: Array<{
    nickname: string;
    isHost: boolean;
    isConnected: boolean;
  }>;
  viewedPlayerId?: string;
  buttonLabels: string[];
  domControlCount: number;
};

async function getEngineState(page: import("@playwright/test").Page): Promise<EngineState> {
  return page.evaluate(() => {
    const engineWindow = window as typeof window & {
      __kingdomEngine?: { getState: () => EngineState };
    };
    return engineWindow.__kingdomEngine!.getState();
  });
}

async function waitForEngine(
  page: import("@playwright/test").Page,
  predicate: (state: EngineState) => boolean,
): Promise<EngineState> {
  await expect
    .poll(async () => {
      const state = await getEngineState(page);
      return predicate(state);
    })
    .toBe(true);
  return getEngineState(page);
}

async function openEngine(page: import("@playwright/test").Page) {
  await page.setViewportSize({ width: 430, height: 932 });
  await page.goto("/");
  await expect(page.locator("canvas")).toBeVisible();
  return waitForEngine(page, (state) => state.connectionStatus === "connected");
}

async function createRoom(page: import("@playwright/test").Page, nickname: string) {
  await openEngine(page);
  await page.mouse.click(160, 446);
  await page.keyboard.type(nickname);
  await page.mouse.click(215, 566);
  return waitForEngine(page, (state) => state.screen === "lobby" && Boolean(state.roomId));
}

async function joinRoom(
  page: import("@playwright/test").Page,
  nickname: string,
  roomId: string,
) {
  await openEngine(page);
  await page.mouse.click(160, 698);
  await page.keyboard.type(nickname);
  await page.mouse.click(160, 768);
  await page.keyboard.type(roomId);
  await page.mouse.click(215, 834);
  return waitForEngine(
    page,
    (state) => state.screen === "lobby" && state.roomMembers.some((member) => member.nickname === nickname),
  );
}

test.describe("Phaser engine UI", () => {
  test("renders only canvas controls", async ({ page }) => {
    const state = await openEngine(page);
    await expect(page.locator("canvas")).toHaveCount(1);
    await expect(page.locator("button,input:not(.kingdom-keyboard-proxy),select,textarea")).toHaveCount(0);
    await expect(page.locator("input.kingdom-keyboard-proxy")).toHaveCount(1);
    expect(state.screen).toBe("home");
    expect(state.domControlCount).toBe(0);
    expect(state.buttonLabels).toContain("开放岗位窗口");
    expect(state.buttonLabels).toContain("进入人才交易所");
  });

  test("focuses a native keyboard proxy for canvas input fields", async ({ page }) => {
    await openEngine(page);
    await page.mouse.click(160, 446);
    await expect(page.locator("input.kingdom-keyboard-proxy")).toBeFocused();
    await page.keyboard.type("Mobile");
    const state = await getEngineState(page);
    expect(state.activeInput).toBe("createNickname");
    expect(state.createNickname).toBe("Mobile");
  });

  test("keeps the whole canvas inside varied portrait viewports", async ({ page }) => {
    for (const viewport of [
      { width: 390, height: 844 },
      { width: 360, height: 740 },
      { width: 430, height: 980 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto("/");
      const box = await page.locator("canvas").boundingBox();
      expect(box).toBeTruthy();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.y).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
      expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 1);
    }
  });

  test("players create, join, start, play, and draw inside the engine canvas", async ({ browser }) => {
    const aliceContext = await browser.newContext({ viewport: { width: 430, height: 932 } });
    const bobContext = await browser.newContext({ viewport: { width: 430, height: 932 } });
    const alicePage = await aliceContext.newPage();
    const bobPage = await bobContext.newPage();

    const aliceLobby = await createRoom(alicePage, "Alice");
    expect(aliceLobby.roomId).toBeTruthy();

    const bobLobby = await joinRoom(bobPage, "Bob", aliceLobby.roomId!);
    expect(bobLobby.roomMembers.some((member) => member.nickname === "Alice")).toBe(true);

    await waitForEngine(
      alicePage,
      (state) => state.roomMembers.some((member) => member.nickname === "Bob"),
    );
    await alicePage.mouse.click(215, 851);
    await waitForEngine(alicePage, (state) => state.screen === "game" && state.handCount === 8);
    await waitForEngine(bobPage, (state) => state.screen === "game" && state.handCount === 8);

    const aliceState = await getEngineState(alicePage);
    const currentPage = aliceState.isMyTurn ? alicePage : bobPage;
    const observedPage = aliceState.isMyTurn ? alicePage : bobPage;
    const observedState = await getEngineState(observedPage);
    const opponent = observedState.roomMembers.find((member) => member.nickname !== (observedPage === alicePage ? "Alice" : "Bob"));
    expect(opponent).toBeTruthy();
    await observedPage.mouse.click(250, 132);
    await waitForEngine(observedPage, (state) => Boolean(state.viewedPlayerId));

    await currentPage.mouse.click(70, 747);
    await waitForEngine(currentPage, (state) => Boolean(state.selectedCardId));
    await currentPage.mouse.click(271, 650);
    await waitForEngine(
      currentPage,
      (state) => state.phase === "draw" && !state.buttonLabels.includes("抽取"),
    );
    await currentPage.mouse.click(63, 625);
    await waitForEngine(currentPage, (state) => state.phase === "play" && !state.isMyTurn);

    await aliceContext.close();
    await bobContext.close();
  });

  test("reload restores a canvas-only game session", async ({ browser }) => {
    const aliceContext = await browser.newContext({ viewport: { width: 430, height: 932 } });
    const bobContext = await browser.newContext({ viewport: { width: 430, height: 932 } });
    const alicePage = await aliceContext.newPage();
    const bobPage = await bobContext.newPage();

    const aliceLobby = await createRoom(alicePage, "Alice");
    await joinRoom(bobPage, "Bob", aliceLobby.roomId!);
    await waitForEngine(alicePage, (state) => state.roomMembers.length === 2);
    await alicePage.mouse.click(215, 851);
    const before = await waitForEngine(alicePage, (state) => state.screen === "game");

    await alicePage.reload();
    await expect(alicePage.locator("canvas")).toBeVisible();
    const after = await waitForEngine(
      alicePage,
      (state) => state.screen === "game" && state.playerId === before.playerId,
    );
    expect(after.domControlCount).toBe(0);

    await aliceContext.close();
    await bobContext.close();
  });

  test("closed peer is reflected in engine state", async ({ browser }) => {
    const aliceContext = await browser.newContext({ viewport: { width: 430, height: 932 } });
    const bobContext = await browser.newContext({ viewport: { width: 430, height: 932 } });
    const alicePage = await aliceContext.newPage();
    const bobPage = await bobContext.newPage();

    const aliceLobby = await createRoom(alicePage, "Alice");
    await joinRoom(bobPage, "Bob", aliceLobby.roomId!);
    await waitForEngine(alicePage, (state) => state.roomMembers.length === 2);
    await alicePage.mouse.click(215, 851);
    await waitForEngine(alicePage, (state) => state.screen === "game");
    await bobContext.close();

    await waitForEngine(
      alicePage,
      (state) => state.roomMembers.some((member) => member.nickname === "Bob" && !member.isConnected),
    );

    await aliceContext.close();
  });
});
