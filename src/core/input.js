// Pointer input: tap vs 1-finger camera yaw drag (10 px threshold) + WebAudio unlock per §1, brief #117 (owner: core).

const DRAG_THRESHOLD_PX = 10;
const ORBIT_SENSITIVITY = 0.0072;

export function createInput(ctx) {
  const canvas = ctx.renderer?.domElement;
  let activePointerId = null;
  let startX = 0;
  let startY = 0;
  let lastX = 0;
  let lastY = 0;
  let dragging = false;
  let audioUnlocked = false;

  function unlockAudioOnce() {
    if (!audioUnlocked && ctx.audio?.unlock) {
      audioUnlocked = true;
      ctx.audio.unlock();
    } else if (ctx.audio?.unlock) {
      ctx.audio.unlock();
    }
  }

  function onPointerDown(e) {
    unlockAudioOnce();
    if (e.target !== canvas) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (activePointerId !== null) return;

    activePointerId = e.pointerId;
    startX = e.clientX;
    startY = e.clientY;
    lastX = e.clientX;
    lastY = e.clientY;
    dragging = false;

    try {
      canvas.setPointerCapture?.(e.pointerId);
    } catch (_) {
      // Synthetic CDP mouse events may not have an active pointerId capture; safe to ignore.
    }
  }

  function onPointerMove(e) {
    if (activePointerId === null || e.pointerId !== activePointerId) return;
    const dxTotal = e.clientX - startX;
    const dyTotal = e.clientY - startY;

    if (!dragging && Math.hypot(dxTotal, dyTotal) > DRAG_THRESHOLD_PX) {
      dragging = true;
    }

    if (dragging) {
      const stepDx = e.clientX - lastX;
      if (ctx.state?.scene === 'world') {
        ctx.cam?.orbit?.(-stepDx * ORBIT_SENSITIVITY);
      }
    }

    lastX = e.clientX;
    lastY = e.clientY;
  }

  function onPointerUp(e) {
    if (activePointerId === null || e.pointerId !== activePointerId) return;
    const wasDragging = dragging;
    const tapX = e.clientX;
    const tapY = e.clientY;

    try {
      canvas.releasePointerCapture?.(e.pointerId);
    } catch (_) {
      // Safe no-op
    }

    activePointerId = null;
    dragging = false;

    if (!wasDragging) {
      ctx.handleCanvasTap?.(tapX, tapY);
    }
  }

  function onPointerCancel(e) {
    if (activePointerId !== null && e.pointerId === activePointerId) {
      activePointerId = null;
      dragging = false;
    }
  }

  function onGlobalPointerDown() {
    unlockAudioOnce();
  }

  if (canvas) {
    canvas.addEventListener('pointerdown', onPointerDown, { passive: true });
    canvas.addEventListener('pointermove', onPointerMove, { passive: true });
    canvas.addEventListener('pointerup', onPointerUp, { passive: true });
    canvas.addEventListener('pointercancel', onPointerCancel, { passive: true });
  }
  window.addEventListener('pointerdown', onGlobalPointerDown, { passive: true });

  function destroy() {
    if (canvas) {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerCancel);
    }
    window.removeEventListener('pointerdown', onGlobalPointerDown);
  }

  return {
    destroy,
  };
}

export default createInput;
