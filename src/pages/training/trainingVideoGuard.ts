type GuardEnvironment = {
  window: Pick<Window, 'addEventListener' | 'removeEventListener'>;
  document: Pick<Document, 'hidden' | 'addEventListener' | 'removeEventListener' | 'fullscreenElement'>;
  Observer?: typeof IntersectionObserver;
};

/** Pauses and rewinds an interrupted lesson. Never resumes automatically. */
export function attachTrainingVideoGuard(
  video: HTMLVideoElement,
  scope: HTMLElement,
  onReset: () => void,
  environment: GuardEnvironment = {
    window,
    document,
    Observer: typeof IntersectionObserver === 'undefined' ? undefined : IntersectionObserver,
  },
) {
  const win = environment.window;
  const doc = environment.document;
  let armed = false;
  let disposed = false;
  let visible = true;

  const finished = () => video.ended ||
    (Number.isFinite(video.duration) && video.duration > 0 &&
     video.currentTime >= video.duration - 0.05);

  const rewind = () => {
    try { video.currentTime = 0; } catch { /* Metadata may not be available yet. */ }
  };

  const reset = () => {
    if (disposed || !armed || finished()) return;
    armed = false;
    video.pause();
    rewind();
    onReset();
  };

  const onPlay = () => {
    armed = true;
    if (doc.hidden || !visible) reset();
  };
  const onPause = () => {
    if (finished()) { armed = false; return; }
    reset();
  };
  const onEnded = () => { armed = false; };
  const onVisibility = () => { if (doc.hidden) reset(); };
  const onOutsideInteraction = (event: Event) => {
    const path = event.composedPath?.() || [];
    if (path.includes(scope) || path.includes(video)) return;
    if (event.target && scope.contains(event.target as Node)) return;
    reset();
  };

  video.addEventListener('play', onPlay);
  video.addEventListener('pause', onPause);
  video.addEventListener('ended', onEnded);
  doc.addEventListener('visibilitychange', onVisibility);
  doc.addEventListener('pointerdown', onOutsideInteraction, true);
  doc.addEventListener('focusin', onOutsideInteraction, true);
  win.addEventListener('blur', reset);
  win.addEventListener('pagehide', reset);

  const observer = environment.Observer ? new environment.Observer(entries => {
    const entry = entries.find(item => item.target === video);
    if (!entry) return;
    const fullscreen = doc.fullscreenElement?.contains(video) ||
      (video as HTMLVideoElement & {webkitDisplayingFullscreen?: boolean}).webkitDisplayingFullscreen;
    visible = !!fullscreen || (entry.isIntersecting && entry.intersectionRatio >= 0.25);
    if (!visible) reset();
  }, {threshold: [0, 0.25]}) : undefined;
  observer?.observe(video);

  return () => {
    if (disposed) return;
    disposed = true;
    observer?.disconnect();
    video.removeEventListener('play', onPlay);
    video.removeEventListener('pause', onPause);
    video.removeEventListener('ended', onEnded);
    doc.removeEventListener('visibilitychange', onVisibility);
    doc.removeEventListener('pointerdown', onOutsideInteraction, true);
    doc.removeEventListener('focusin', onOutsideInteraction, true);
    win.removeEventListener('blur', reset);
    win.removeEventListener('pagehide', reset);
    if (armed && !finished()) { armed = false; video.pause(); rewind(); }
  };
}
