"use client";

import { useEffect } from "react";

type LayoutMode = "board" | "focus";

type ResultItem = {
  main: HTMLButtonElement;
  enroute: HTMLButtonElement | null;
  id: string;
};

const MODE_STORAGE_KEY = "hpd-ai-results-layout-v1";

function textOf(node: Element | null) {
  return String(node?.textContent || "").replace(/\s+/g, " ").trim();
}

function readMode(): LayoutMode {
  try {
    return window.localStorage.getItem(MODE_STORAGE_KEY) === "focus" ? "focus" : "board";
  } catch {
    return "board";
  }
}

function saveMode(mode: LayoutMode) {
  try {
    window.localStorage.setItem(MODE_STORAGE_KEY, mode);
  } catch {
    // The current page still keeps the selected layout.
  }
}

function itemsFrom(list: HTMLElement): ResultItem[] {
  const mains = Array.from(
    list.querySelectorAll<HTMLButtonElement>(
      ":scope > .hpd-ai-list-main, :scope > button:not(.hpd-ai-enroute)",
    ),
  ).filter((button) => !button.classList.contains("hpd-ai-enroute"));

  return mains.map((main) => {
    main.classList.add("hpd-ai-list-main");
    const id = textOf(main.querySelector("span strong")).toUpperCase();
    const next = main.nextElementSibling;
    let enroute =
      next instanceof HTMLButtonElement && next.classList.contains("hpd-ai-enroute")
        ? next
        : null;

    if (!enroute && id) {
      enroute = list.querySelector<HTMLButtonElement>(
        `.hpd-ai-enroute[data-enroute-for="${CSS.escape(id)}"]`,
      );
    }

    return { main, enroute, id };
  });
}

function ensureToolbar(panel: HTMLElement, list: HTMLElement) {
  let toolbar = panel.querySelector<HTMLElement>(".hpd-ai-results-board-toolbar");
  if (toolbar) return toolbar;

  toolbar = document.createElement("section");
  toolbar.className = "hpd-ai-results-board-toolbar";
  toolbar.setAttribute("aria-label", "Job result layout controls");
  toolbar.innerHTML = `
    <div class="hpd-ai-results-board-title">
      <span>Priority board</span>
      <strong data-board-count>0 jobs</strong>
    </div>
    <div class="hpd-ai-results-layout-switch" role="group" aria-label="Result layout">
      <button type="button" data-layout="board">Cards</button>
      <button type="button" data-layout="focus">Focus</button>
    </div>
    <div class="hpd-ai-results-pager">
      <button type="button" data-page="previous" aria-label="Previous jobs">‹</button>
      <span data-page-label>1 / 1</span>
      <button type="button" data-page="next" aria-label="Next jobs">›</button>
    </div>
  `;
  panel.insertBefore(toolbar, list);
  return toolbar;
}

export default function MapResultsBoardEnhancer() {
  useEffect(() => {
    let mode: LayoutMode = readMode();
    let page = 0;
    let signature = "";
    let scheduled = false;
    let destroyed = false;

    const apply = () => {
      if (destroyed) return;

      const panel = document.querySelector<HTMLElement>(".hpd-ai-results-panel");
      const center = document.querySelector<HTMLElement>(".hpd-ai-center");
      const list = panel?.querySelector<HTMLElement>(".hpd-ai-result-list");

      if (!panel || !center || !list) {
        document
          .querySelector<HTMLElement>(".hpd-ai-center.hpd-ai-results-board-active")
          ?.classList.remove("hpd-ai-results-board-active");
        return;
      }

      center.classList.add("hpd-ai-results-board-active");
      panel.classList.add("hpd-ai-results-board-panel");
      list.classList.add("hpd-ai-results-board-list");
      list.dataset.layout = mode;

      const items = itemsFrom(list);
      const nextSignature = items.map((item) => item.id).join("|");
      if (nextSignature !== signature) {
        signature = nextSignature;
        page = 0;
      }

      const perPage = mode === "focus" ? 1 : window.innerWidth <= 720 ? 2 : 4;
      const totalPages = Math.max(1, Math.ceil(items.length / perPage));
      page = Math.min(Math.max(0, page), totalPages - 1);
      const first = page * perPage;
      const last = first + perPage;

      items.forEach((item, index) => {
        const visible = index >= first && index < last;
        item.main.hidden = !visible;
        if (item.enroute) item.enroute.hidden = !visible;

        if (!visible) return;

        const slot = index - first;
        const column = mode === "focus" || window.innerWidth <= 720 ? 1 : (slot % 2) + 1;
        const row = mode === "focus" ? 1 : window.innerWidth <= 720 ? slot + 1 : Math.floor(slot / 2) + 1;

        item.main.style.gridColumn = String(column);
        item.main.style.gridRow = String(row);
        item.main.dataset.boardSlot = String(slot + 1);

        if (item.enroute) {
          item.enroute.style.gridColumn = String(column);
          item.enroute.style.gridRow = String(row);
          item.enroute.dataset.boardSlot = String(slot + 1);
        }
      });

      const toolbar = ensureToolbar(panel, list);
      const count = toolbar.querySelector<HTMLElement>("[data-board-count]");
      const pageLabel = toolbar.querySelector<HTMLElement>("[data-page-label]");
      const previous = toolbar.querySelector<HTMLButtonElement>('[data-page="previous"]');
      const next = toolbar.querySelector<HTMLButtonElement>('[data-page="next"]');
      const boardButton = toolbar.querySelector<HTMLButtonElement>('[data-layout="board"]');
      const focusButton = toolbar.querySelector<HTMLButtonElement>('[data-layout="focus"]');

      if (count) count.textContent = `${items.length} job${items.length === 1 ? "" : "s"}`;
      if (pageLabel) pageLabel.textContent = `${page + 1} / ${totalPages}`;
      if (previous) previous.disabled = page <= 0;
      if (next) next.disabled = page >= totalPages - 1;
      boardButton?.classList.toggle("active", mode === "board");
      focusButton?.classList.toggle("active", mode === "focus");

      if (previous) {
        previous.onclick = () => {
          page = Math.max(0, page - 1);
          apply();
        };
      }
      if (next) {
        next.onclick = () => {
          page = Math.min(totalPages - 1, page + 1);
          apply();
        };
      }
      if (boardButton) {
        boardButton.onclick = () => {
          mode = "board";
          page = 0;
          saveMode(mode);
          apply();
        };
      }
      if (focusButton) {
        focusButton.onclick = () => {
          mode = "focus";
          page = 0;
          saveMode(mode);
          apply();
        };
      }
    };

    const schedule = () => {
      if (scheduled || destroyed) return;
      scheduled = true;
      window.requestAnimationFrame(() => {
        scheduled = false;
        apply();
      });
    };

    schedule();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    const timer = window.setInterval(schedule, 700);
    window.addEventListener("resize", schedule);

    return () => {
      destroyed = true;
      observer.disconnect();
      window.clearInterval(timer);
      window.removeEventListener("resize", schedule);
      document
        .querySelector<HTMLElement>(".hpd-ai-center.hpd-ai-results-board-active")
        ?.classList.remove("hpd-ai-results-board-active");
    };
  }, []);

  return null;
}
