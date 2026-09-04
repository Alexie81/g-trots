export type IdleTask = {
  cancel: () => void;
};

type IdleScheduler = {
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
};

/**
 * Defers non-visual work until the current render has had time to settle.
 * React Native 0.86 deprecates InteractionManager in favour of the platform
 * idle callback API, while the timer fallback keeps web and older runtimes safe.
 */
export function runWhenIdle(callback: () => void, timeout = 750): IdleTask {
  const scheduler = globalThis as typeof globalThis & IdleScheduler;
  let cancelled = false;
  const run = () => {
    if (!cancelled) callback();
  };

  if (typeof scheduler.requestIdleCallback === 'function') {
    const handle = scheduler.requestIdleCallback(run, { timeout });
    return {
      cancel: () => {
        cancelled = true;
        scheduler.cancelIdleCallback?.(handle);
      },
    };
  }

  const handle = setTimeout(run, 0);
  return {
    cancel: () => {
      cancelled = true;
      clearTimeout(handle);
    },
  };
}
