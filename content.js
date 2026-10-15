// Keyboard navigation for GitHub's pull request "Files changed" view.
//
//   j / k        next / previous file
//   J / K        next / previous unviewed file
//   v            toggle "Viewed" on the current file (marking jumps to the next unviewed file)
//   o            collapse / expand the current file
//   Escape       clear the highlight

(() => {
  const PR_FILES_PATH = /^\/[^/]+\/[^/]+\/pull\/\d+\/(changes|files)(\/|$)/;
  const FILE_SELECTOR = 'div[role="region"][id^="diff-"]';
  const HEADER_SELECTOR = '[class*="diffHeaderWrapper"]';
  const CURRENT_CLASS = 'ghpr-kbd-current';
  // Tolerance in px when deciding whether a file sits at the scroll anchor.
  const SLOP = 4;

  // The file we last jumped to, and the scroll position we left it at. While the
  // page hasn't scrolled since, that file stays current even if it can't reach the
  // top of the viewport (e.g. short files at the end of the page).
  const state = { id: null, scrollY: -1 };

  const isPrFilesPage = () => PR_FILES_PATH.test(location.pathname);
  const getFiles = () => [...document.querySelectorAll(FILE_SELECTOR)];
  const getHeader = (file) => file.querySelector(HEADER_SELECTOR) ?? file;

  // The headers are sticky; their `top` is where a file's top edge should land.
  function anchorTop(file) {
    return parseFloat(getComputedStyle(getHeader(file)).top) || 0;
  }

  function fileName(file) {
    const heading = document.getElementById(file.getAttribute('aria-labelledby'));
    // GitHub wraps the path in invisible LTR marks.
    return (heading?.textContent ?? '').replace(/[‎‏]/g, '').trim();
  }

  function viewedButton(file) {
    return [...getHeader(file).querySelectorAll('button[aria-pressed]')].find((b) =>
      /viewed/i.test(b.getAttribute('aria-label') ?? b.textContent),
    );
  }

  const isViewed = (file) => viewedButton(file)?.getAttribute('aria-pressed') === 'true';

  function collapseButton(file) {
    return getHeader(file)
      .querySelector('button svg.octicon-chevron-down, button svg.octicon-chevron-right')
      ?.closest('button');
  }

  // Where the viewport is relative to the files. `index` is the current file;
  // `position` is 'before' when the anchor line is above it, 'top' when it is
  // aligned with it, and 'inside' when part of the file is scrolled past.
  function locate(files) {
    if (state.id && window.scrollY === state.scrollY) {
      const index = files.findIndex((f) => f.id === state.id);
      if (index !== -1) return { index, position: 'top' };
    }
    const line = anchorTop(files[0]);
    for (let index = 0; index < files.length; index++) {
      const rect = files[index].getBoundingClientRect();
      if (rect.bottom <= line + SLOP) continue;
      if (rect.top > line + SLOP) return { index, position: 'before' };
      if (rect.top < line - SLOP) return { index, position: 'inside' };
      return { index, position: 'top' };
    }
    return { index: files.length - 1, position: 'inside' };
  }

  function highlight(file) {
    for (const el of document.querySelectorAll(`.${CURRENT_CLASS}`)) {
      if (el !== file) el.classList.remove(CURRENT_CLASS);
    }
    file?.classList.add(CURRENT_CLASS);
  }

  // Bumped to cancel an in-flight alignment (new jump, or the user taking over).
  let alignToken = 0;

  function scrollToFile(file, files) {
    // Files use `content-visibility: auto` and GitHub's estimated heights, so
    // files above the target can change size as they render. Keep re-aligning
    // until the position has been stable for a few frames.
    const token = ++alignToken;
    const started = performance.now();
    let stableFrames = 0;
    const align = () => {
      if (token !== alignToken) return;
      const before = window.scrollY;
      const delta = file.getBoundingClientRect().top - anchorTop(file);
      if (Math.abs(delta) > 1) window.scrollTo({ top: before + delta, behavior: 'instant' });
      // Near the page bottom the scroll is clamped, which also counts as settled.
      stableFrames = window.scrollY === before ? stableFrames + 1 : 0;
      state.id = file.id;
      state.scrollY = window.scrollY;
      if (stableFrames < 5 && performance.now() - started < 1500) requestAnimationFrame(align);
    };
    align();
    highlight(file);
    showHud(file, files);
  }

  const cancelAlign = () => alignToken++;
  for (const type of ['wheel', 'touchstart', 'mousedown', 'keydown']) {
    window.addEventListener(type, cancelAlign, { capture: true, passive: true });
  }

  function findFrom(files, start, step, predicate) {
    for (let i = start; i >= 0 && i < files.length; i += step) {
      if (predicate(files[i])) return files[i];
    }
    return null;
  }

  function move(step, { unviewedOnly = false } = {}) {
    const files = getFiles();
    if (!files.length) return false;
    const { index, position } = locate(files);

    let start;
    if (step > 0) start = position === 'before' ? index : index + 1;
    else start = position === 'inside' ? index : index - 1;

    const target = findFrom(files, start, step, (f) => !unviewedOnly || !isViewed(f));
    if (target) scrollToFile(target, files);
    else toast(unviewedOnly ? 'No more unviewed files' : step > 0 ? 'Last file' : 'First file');
    return true;
  }

  // Resolves once `check` returns true, or after `timeout` ms.
  function waitFor(check, timeout = 2000) {
    return new Promise((resolve) => {
      const started = performance.now();
      const tick = () => {
        if (check() || performance.now() - started > timeout) resolve();
        else requestAnimationFrame(tick);
      };
      tick();
    });
  }

  async function toggleViewed() {
    const files = getFiles();
    if (!files.length) return false;
    const file = files[locate(files).index];
    const button = viewedButton(file);
    if (!button) return true;

    const wasViewed = isViewed(file);
    button.click();
    await waitFor(() => isViewed(file) !== wasViewed);

    if (isViewed(file)) {
      const fresh = getFiles();
      const index = fresh.indexOf(file);
      const next =
        findFrom(fresh, index + 1, 1, (f) => !isViewed(f)) ??
        findFrom(fresh, 0, 1, (f) => !isViewed(f));
      if (next) scrollToFile(next, fresh);
      else {
        scrollToFile(file, fresh);
        toast('All files viewed');
      }
    } else {
      scrollToFile(file, getFiles());
    }
    return true;
  }

  async function toggleCollapsed() {
    const files = getFiles();
    if (!files.length) return false;
    const file = files[locate(files).index];
    const button = collapseButton(file);
    if (!button) return true;
    button.click();
    await new Promise(requestAnimationFrame);
    scrollToFile(file, getFiles());
    return true;
  }

  // --- HUD -------------------------------------------------------------------

  let hudTimer;

  function hudElement() {
    let hud = document.getElementById('ghpr-kbd-hud');
    if (!hud) {
      hud = document.createElement('div');
      hud.id = 'ghpr-kbd-hud';
      hud.setAttribute('role', 'status');
      document.body.append(hud);
    }
    return hud;
  }

  function toast(text) {
    const hud = hudElement();
    hud.textContent = text;
    hud.classList.add('ghpr-kbd-visible');
    clearTimeout(hudTimer);
    hudTimer = setTimeout(() => hud.classList.remove('ghpr-kbd-visible'), 1600);
  }

  function showHud(file, files) {
    const viewed = files.filter(isViewed).length;
    const mark = isViewed(file) ? '✓ ' : '';
    toast(`${files.indexOf(file) + 1}/${files.length} · ${mark}${fileName(file)} · ${viewed} viewed`);
  }

  const style = document.createElement('style');
  style.textContent = `
    /* The file region has paint containment, so an outline on it gets clipped;
       recolour the header and body borders instead. */
    .${CURRENT_CLASS} [class*="diff-file-header"],
    .${CURRENT_CLASS} > .border {
      border-color: var(--fgColor-accent, #0969da) !important;
    }
    .${CURRENT_CLASS} [class*="diff-file-header"] {
      box-shadow: inset 3px 0 0 var(--fgColor-accent, #0969da);
    }
    #ghpr-kbd-hud {
      position: fixed;
      left: 50%;
      bottom: 24px;
      z-index: 2147483647;
      max-width: min(720px, calc(100vw - 32px));
      padding: 6px 12px;
      border-radius: 6px;
      transform: translateX(-50%);
      background: var(--bgColor-emphasis, #25292e);
      color: var(--fgColor-onEmphasis, #fff);
      font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      pointer-events: none;
      opacity: 0;
      transition: opacity 150ms;
    }
    #ghpr-kbd-hud.ghpr-kbd-visible { opacity: 1; }
  `;
  document.head.append(style);

  // --- Keyboard --------------------------------------------------------------

  function isTyping(target) {
    if (!(target instanceof Element)) return false;
    return (
      target.isContentEditable ||
      /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) ||
      !!target.closest('[role="dialog"], [role="menu"], [role="listbox"], [role="combobox"]')
    );
  }

  const ACTIONS = {
    j: () => move(1),
    k: () => move(-1),
    J: () => move(1, { unviewedOnly: true }),
    K: () => move(-1, { unviewedOnly: true }),
    v: toggleViewed,
    o: toggleCollapsed,
    Escape: () => {
      if (!document.querySelector(`.${CURRENT_CLASS}`)) return false;
      highlight(null);
      state.id = null;
      return true;
    },
  };

  // Capture phase so GitHub's own handlers (e.g. file tree type-ahead) don't see
  // keys we handle.
  window.addEventListener(
    'keydown',
    (event) => {
      if (event.defaultPrevented || event.isComposing) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (!isPrFilesPage() || isTyping(event.target)) return;

      // Some input sources report Shift+J as key "j" with shiftKey set.
      const key = event.shiftKey && event.key.length === 1 ? event.key.toUpperCase() : event.key;
      const action = ACTIONS[key];
      if (!action || !document.querySelector(FILE_SELECTOR)) return;

      event.preventDefault();
      event.stopPropagation();
      // Return focus to the page so later keys aren't swallowed by e.g. the tree.
      if (document.activeElement instanceof HTMLElement && document.activeElement !== document.body) {
        document.activeElement.blur();
      }
      action();
    },
    true,
  );

  // Keep the highlight on the file under the anchor while the user scrolls.
  let scrollQueued = false;
  window.addEventListener(
    'scroll',
    () => {
      if (scrollQueued || !document.querySelector(`.${CURRENT_CLASS}`)) return;
      scrollQueued = true;
      requestAnimationFrame(() => {
        scrollQueued = false;
        if (window.scrollY === state.scrollY) return;
        const files = getFiles();
        if (files.length) highlight(files[locate(files).index]);
      });
    },
    { passive: true },
  );
})();
