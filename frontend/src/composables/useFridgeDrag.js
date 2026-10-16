// useFridgeDrag — pointer-events drag and drop for the fridge map (HTML5 DnD is unreliable with
// touch on Android Chrome). Mouse and finger behave the same:
//   press(e, source, label) on pointerdown; it only becomes a drag after the pointer moves > 8px,
//   so a plain tap still fires its click. A drag swallows the click that follows it.
// source: { type: 'list', farmer, palletNumber } | { type: 'slot', slot }
// label:  { palletNumber, farmer } — shown on the ghost card.
// onDrop(source, target) is called with target = slot id | 'remove' | null (nowhere / cancelled).
import { ref, onBeforeUnmount } from 'vue';

const THRESHOLD = 8;

export function useFridgeDrag({ onStart, onDrop }) {
  const drag = ref(null); // { source, label, x, y, target } while a drag is active
  let pending = null; // { el, pointerId, x0, y0, source, label } between pointerdown and activation

  function targetAt(x, y) {
    const el = document.elementFromPoint(x, y)?.closest('[data-slot], [data-drop="remove"]');
    if (!el) return null;
    return el.dataset.drop === 'remove' ? 'remove' : el.dataset.slot;
  }

  function onMove(e) {
    if (!pending || e.pointerId !== pending.pointerId) return;
    if (!drag.value) {
      if (Math.hypot(e.clientX - pending.x0, e.clientY - pending.y0) <= THRESHOLD) return;
      // Capture only once it is a drag: capturing on pointerdown would retarget the click of a
      // plain tap (e.g. the slot's "פנה תא" button) to the slot itself.
      try { pending.el.setPointerCapture(e.pointerId); } catch { /* element gone */ }
      drag.value = { source: pending.source, label: pending.label, x: e.clientX, y: e.clientY, target: null };
      onStart?.(pending.source);
    }
    e.preventDefault();
    drag.value.x = e.clientX;
    drag.value.y = e.clientY;
    drag.value.target = targetAt(e.clientX, e.clientY);
  }

  // A mouse drag is followed by a click in the same task as its pointerup; a moved touch gets none.
  // So the swallower only lives until the end of this task and can never eat a later real tap.
  function swallowNextClick() {
    const kill = (ev) => { ev.stopPropagation(); ev.preventDefault(); };
    window.addEventListener('click', kill, { capture: true, once: true });
    setTimeout(() => window.removeEventListener('click', kill, { capture: true }), 0);
  }

  function finish(e, cancelled) {
    if (!pending || e.pointerId !== pending.pointerId) return;
    const d = drag.value;
    const target = d && !cancelled ? targetAt(e.clientX, e.clientY) : null;
    detach();
    pending = null;
    drag.value = null;
    if (!d) return; // a tap: let its click through
    swallowNextClick();
    onDrop(d.source, target);
  }
  const onUp = (e) => finish(e, false);
  const onCancel = (e) => finish(e, true);
  const onContextMenu = (e) => { if (drag.value) e.preventDefault(); }; // long-press menu on touch

  function attach() {
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    window.addEventListener('contextmenu', onContextMenu);
  }
  function detach() {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onCancel);
    window.removeEventListener('contextmenu', onContextMenu);
  }

  function press(e, source, label) {
    if (pending || (e.pointerType === 'mouse' && e.button !== 0)) return; // one pointer at a time, primary button
    pending = { el: e.currentTarget, pointerId: e.pointerId, x0: e.clientX, y0: e.clientY, source, label };
    attach();
  }

  onBeforeUnmount(() => { detach(); pending = null; drag.value = null; });
  return { drag, press };
}
