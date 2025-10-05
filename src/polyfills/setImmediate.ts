// Polyfill for setImmediate
if (typeof (window as any).setImmediate === 'undefined') {
  (window as any).setImmediate = function(callback: (...args: any[]) => void, ...args: any[]) {
    return window.setTimeout(callback, 0, ...args);
  };
}

// Also polyfill clearImmediate for consistency
if (typeof (window as any).clearImmediate === 'undefined') {
  (window as any).clearImmediate = function(id: number) {
    return window.clearTimeout(id);
  };
}

export {};
