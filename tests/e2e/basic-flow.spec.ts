import { expect, test } from "@playwright/test";

async function waitForSocketStatus(page: import("@playwright/test").Page, expected: string) {
  await expect(page.locator('[data-testid="socket-status"]')).toContainText(expected);
}

test.describe("basic flow", () => {
  test("page loads and socket connects", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("h1")).toContainText("Kingdom Card Game");
    await expect(page.locator('[data-testid="nickname-input"]')).toBeVisible();
    await expect(page.locator('[data-testid="create-room-button"]')).toBeVisible();
    await waitForSocketStatus(page, "已连接");
  });

  test("Alice creates a room", async ({ page }) => {
    await page.goto("/");
    await waitForSocketStatus(page, "已连接");
    await page.fill('[data-testid="nickname-input"]', "Alice");
    await page.click('[data-testid="create-room-button"]');
    await expect(page.locator('[data-testid="room-id-display"]')).toBeVisible();
    await expect(page.locator('[data-testid="player-id-display"]')).toBeVisible();
    await expect(page.locator('[data-testid="member-list"]')).toContainText("Alice");
    await expect(page.locator('[data-testid="member-list"]')).toContainText("房主");
  });

  test("host can create none and standard time-control rooms", async ({ browser }) => {
    const nonePage = await browser.newPage();
    await nonePage.goto("/");
    await waitForSocketStatus(nonePage, "已连接");
    await nonePage.fill('[data-testid="nickname-input"]', "NoTimer");
    await nonePage.selectOption('[data-testid="time-control-select"]', "none");
    await nonePage.click('[data-testid="create-room-button"]');
    await expect(nonePage.locator('[data-testid="room-time-control"]')).toContainText("无限时");
    await nonePage.close();

    const standardPage = await browser.newPage();
    await standardPage.goto("/");
    await waitForSocketStatus(standardPage, "已连接");
    await standardPage.fill('[data-testid="nickname-input"]', "Standard");
    await standardPage.click('[data-testid="create-room-button"]');
    await expect(standardPage.locator('[data-testid="room-time-control"]')).toContainText(
      "标准：20s + 50s",
    );
    await standardPage.close();
  });

  test("Bob joins Alice's room", async ({ browser }) => {
    const alicePage = await browser.newPage();
    await alicePage.goto("/");
    await waitForSocketStatus(alicePage, "已连接");
    await alicePage.fill('[data-testid="nickname-input"]', "Alice");
    await alicePage.click('[data-testid="create-room-button"]');
    const roomIdText = await alicePage.locator('[data-testid="room-id-display"]').textContent();
    const roomId = roomIdText?.replace("Room: ", "").trim();
    expect(roomId).toBeTruthy();

    const bobPage = await browser.newPage();
    await bobPage.goto("/");
    await waitForSocketStatus(bobPage, "已连接");
    await bobPage.fill('[data-testid="nickname-input"]', "Bob");
    await bobPage.fill('[data-testid="room-id-input"]', roomId!);
    await bobPage.click('[data-testid="join-room-button"]');

    await expect(alicePage.locator('[data-testid="member-list"]')).toContainText("Bob");
    await expect(bobPage.locator('[data-testid="member-list"]')).toContainText("Alice");
    await alicePage.close();
    await bobPage.close();
  });

  test("Alice starts the game and both players see hand area", async ({ browser }) => {
    const alicePage = await browser.newPage();
    await alicePage.goto("/");
    await waitForSocketStatus(alicePage, "已连接");
    await alicePage.fill('[data-testid="nickname-input"]', "Alice");
    await alicePage.click('[data-testid="create-room-button"]');
    const roomIdText = await alicePage.locator('[data-testid="room-id-display"]').textContent();
    const roomId = roomIdText?.replace("Room: ", "").trim();
    expect(roomId).toBeTruthy();

    const bobPage = await browser.newPage();
    await bobPage.goto("/");
    await waitForSocketStatus(bobPage, "已连接");
    await bobPage.fill('[data-testid="nickname-input"]', "Bob");
    await bobPage.fill('[data-testid="room-id-input"]', roomId!);
    await bobPage.click('[data-testid="join-room-button"]');

    await alicePage.click('[data-testid="start-game-button"]');
    await expect(alicePage.locator('[data-testid="hand-area"]')).toBeVisible();
    await expect(bobPage.locator('[data-testid="hand-area"]')).toBeVisible();
    await expect(alicePage.locator('[data-testid="deck-count"]')).toBeVisible();
    await expect(alicePage.locator('[data-testid="game-timer"]')).toContainText(
      "限时模式：标准",
    );
    await expect(alicePage.locator('[data-testid="operation-remaining"]')).toBeVisible();
    const aliceCards = alicePage.locator('[data-testid="hand-area"] button');
    const bobCards = bobPage.locator('[data-testid="hand-area"] button');
    await expect(aliceCards).toHaveCount(8);
    await expect(bobCards).toHaveCount(8);
    await alicePage.close();
    await bobPage.close();
  });

  test("hidden info: no deck JSON exposed", async ({ browser }) => {
    const alicePage = await browser.newPage();
    await alicePage.goto("/");
    await waitForSocketStatus(alicePage, "已连接");
    await alicePage.fill('[data-testid="nickname-input"]', "Alice");
    await alicePage.click('[data-testid="create-room-button"]');
    const roomIdText = await alicePage.locator('[data-testid="room-id-display"]').textContent();
    const roomId = roomIdText?.replace("Room: ", "").trim();
    expect(roomId).toBeTruthy();

    const bobPage = await browser.newPage();
    await bobPage.goto("/");
    await waitForSocketStatus(bobPage, "已连接");
    await bobPage.fill('[data-testid="nickname-input"]', "Bob");
    await bobPage.fill('[data-testid="room-id-input"]', roomId!);
    await bobPage.click('[data-testid="join-room-button"]');
    await alicePage.click('[data-testid="start-game-button"]');
    await expect(alicePage.locator('[data-testid="hand-area"]')).toBeVisible();

    const pageContent = await alicePage.content();
    expect(pageContent).not.toContain('"deck":[');
    const bobHandSection = await alicePage.locator('[data-testid^="other-player-"]').first().textContent();
    expect(bobHandSection).toContain("手牌:");
    await alicePage.close();
    await bobPage.close();
  });

  test("minimum action flow: play card then draw", async ({ browser }) => {
    const alicePage = await browser.newPage();
    await alicePage.goto("/");
    await waitForSocketStatus(alicePage, "已连接");
    await alicePage.fill('[data-testid="nickname-input"]', "Alice");
    await alicePage.click('[data-testid="create-room-button"]');
    const roomIdText = await alicePage.locator('[data-testid="room-id-display"]').textContent();
    const roomId = roomIdText?.replace("Room: ", "").trim();
    expect(roomId).toBeTruthy();

    const bobPage = await browser.newPage();
    await bobPage.goto("/");
    await waitForSocketStatus(bobPage, "已连接");
    await bobPage.fill('[data-testid="nickname-input"]', "Bob");
    await bobPage.fill('[data-testid="room-id-input"]', roomId!);
    await bobPage.click('[data-testid="join-room-button"]');
    await alicePage.click('[data-testid="start-game-button"]');
    await expect(alicePage.locator('[data-testid="hand-area"]')).toBeVisible();
    await expect(bobPage.locator('[data-testid="hand-area"]')).toBeVisible();

    const alicePhase = await alicePage.locator('[data-testid="current-player"]').textContent();
    const aliceIsCurrent = alicePhase?.includes("你");
    const currentPage = aliceIsCurrent ? alicePage : bobPage;

    const firstCard = currentPage.locator('[data-testid="hand-area"] button').first();
    const cardText = (await firstCard.textContent()) ?? "";
    await firstCard.click();

    const colorMap: Record<string, string> = { "红": "red", "蓝": "blue", "黄": "yellow", "绿": "green", "白": "white" };
    let targetColor = "red";
    for (const [cn, en] of Object.entries(colorMap)) {
      if (cardText.startsWith(cn)) { targetColor = en; break; }
    }
    const playButton = currentPage.locator(`[data-testid="play-column-${targetColor}"]`);
    await expect(playButton).toBeVisible();
    await playButton.click();

    await expect(currentPage.locator('[data-testid="game-phase"]')).toContainText("摸牌");
    await expect(currentPage.locator('[data-testid="game-timer"]')).toHaveAttribute(
      "data-phase",
      "draw",
    );
    await expect(currentPage.locator('[data-testid="draw-deck-button"]')).toBeVisible();
    await currentPage.click('[data-testid="draw-deck-button"]');
    await expect(currentPage.locator('[data-testid="game-phase"]')).toContainText("出牌");
    await expect(currentPage.locator('[data-testid="game-timer"]')).toHaveAttribute(
      "data-phase",
      "play",
    );

    const afterCurrent = await currentPage.locator('[data-testid="current-player"]').textContent();
    expect(afterCurrent).not.toContain("你");

    await alicePage.close();
    await bobPage.close();
  });

  test("auto-reconnect after page reload restores the timer", async ({ browser }) => {
    const aliceContext = await browser.newContext();
    const bobContext = await browser.newContext();
    const page = await aliceContext.newPage();
    await page.goto("/");
    await waitForSocketStatus(page, "已连接");
    await page.fill('[data-testid="nickname-input"]', "Alice");
    await page.click('[data-testid="create-room-button"]');
    const roomId = (await page.locator('[data-testid="room-id-display"]').textContent())
      ?.replace("Room: ", "")
      .trim();

    const bobPage = await bobContext.newPage();
    await bobPage.goto("/");
    await waitForSocketStatus(bobPage, "已连接");
    await bobPage.fill('[data-testid="nickname-input"]', "Bob");
    await bobPage.fill('[data-testid="room-id-input"]', roomId!);
    await bobPage.click('[data-testid="join-room-button"]');
    await page.click('[data-testid="start-game-button"]');
    await expect(page.locator('[data-testid="hand-area"]')).toBeVisible();

    const playerIdBefore = await page.locator('[data-testid="player-id-display"]').textContent();
    const remainingBefore = Number(
      (await page.locator('[data-testid="operation-remaining"]').textContent())
        ?.match(/\d+/)?.[0],
    );

    await page.reload();
    await waitForSocketStatus(page, "已连接");
    await expect(page.locator('[data-testid="hand-area"]')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('[data-testid="player-id-display"]')).toHaveText(playerIdBefore!);
    await expect(page.locator('[data-testid="game-timer"]')).toBeVisible();
    const remainingAfter = Number(
      (await page.locator('[data-testid="operation-remaining"]').textContent())
        ?.match(/\d+/)?.[0],
    );
    expect(remainingAfter).toBeLessThanOrEqual(remainingBefore);

    await aliceContext.close();
    await bobContext.close();
  });

  test("socket reconnect restores the game without refresh or click", async ({ browser }) => {
    const aliceContext = await browser.newContext();
    const bobContext = await browser.newContext();
    const alicePage = await aliceContext.newPage();
    await alicePage.goto("/");
    await waitForSocketStatus(alicePage, "已连接");
    await alicePage.fill('[data-testid="nickname-input"]', "Alice");
    await alicePage.click('[data-testid="create-room-button"]');
    const roomId = (await alicePage.locator('[data-testid="room-id-display"]').textContent())
      ?.replace("Room: ", "")
      .trim();

    const bobPage = await bobContext.newPage();
    await bobPage.goto("/");
    await waitForSocketStatus(bobPage, "已连接");
    await bobPage.fill('[data-testid="nickname-input"]', "Bob");
    await bobPage.fill('[data-testid="room-id-input"]', roomId!);
    await bobPage.click('[data-testid="join-room-button"]');
    await alicePage.click('[data-testid="start-game-button"]');
    await expect(alicePage.locator('[data-testid="hand-area"]')).toBeVisible();

    await alicePage.evaluate(() => {
      const testWindow = window as typeof window & {
        __closeKingdomSocketTransport?: () => void;
      };
      testWindow.__closeKingdomSocketTransport?.();
    });
    await expect(alicePage.locator('[data-testid="socket-status"]')).toContainText(
      "disconnected",
    );

    await waitForSocketStatus(alicePage, "已连接");
    await expect(alicePage.locator('[data-testid="hand-area"]')).toBeVisible();
    await expect(alicePage.locator('[data-testid="game-timer"]')).toBeVisible();

    await aliceContext.close();
    await bobContext.close();
  });

  test("Bob disconnect shows offline in Alice's page", async ({ browser }) => {
    const alicePage = await browser.newPage();
    await alicePage.goto("/");
    await waitForSocketStatus(alicePage, "已连接");
    await alicePage.fill('[data-testid="nickname-input"]', "Alice");
    await alicePage.click('[data-testid="create-room-button"]');
    const roomIdText = await alicePage.locator('[data-testid="room-id-display"]').textContent();
    const roomId = roomIdText?.replace("Room: ", "").trim();

    const bobPage = await browser.newPage();
    await bobPage.goto("/");
    await waitForSocketStatus(bobPage, "已连接");
    await bobPage.fill('[data-testid="nickname-input"]', "Bob");
    await bobPage.fill('[data-testid="room-id-input"]', roomId!);
    await bobPage.click('[data-testid="join-room-button"]');
    await alicePage.click('[data-testid="start-game-button"]');
    await expect(alicePage.locator('[data-testid="hand-area"]')).toBeVisible();

    const bobPlayerIdText = await bobPage.locator('[data-testid="player-id-display"]').textContent();
    const bobPlayerId = bobPlayerIdText?.replace("Player: ", "").trim();

    // Close Bob's page (simulate disconnect)
    await bobPage.close();

    // Alice should see Bob offline
    await expect(
      alicePage.locator(`[data-testid="member-${bobPlayerId}"][data-connected="false"]`),
    ).toBeVisible({ timeout: 5000 });

    await alicePage.close();
  });
});
