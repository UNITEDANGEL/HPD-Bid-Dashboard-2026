// The bids screen opens on the map with the list folded to its bar ("peek"). Tests tap the bar up to the
// whole list, the way the owner does. Does nothing if the bids screen isn't open.
export async function openBidList(page, size = "full") {
  const list = page.locator('[data-hpd-smoke="fc-bids-list"]');
  try { await list.waitFor({ timeout: 8000 }); } catch { return; }
  for (let i = 0; i < 3; i++) {
    const now = await list.getAttribute("data-size").catch(() => null);
    if (!now || now === size || (size === "half" && now === "full")) return;
    await page.locator('[data-hpd-smoke="fc-bids-collapse"]').click();
    await page.waitForTimeout(250);
  }
}
