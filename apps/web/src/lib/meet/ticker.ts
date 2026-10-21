"use client";

/**
 * setInterval that keeps its pace when the tab is in the background. Browsers slow page timers in
 * hidden tabs (down to once a minute after a while), and a person sharing their screen usually has
 * the meeting tab hidden. Timers inside a Worker aren't slowed like that.
 * Returns a stop function.
 */
export function workerTicker(ms: number, fn: () => void) {
  try {
    const url = URL.createObjectURL(new Blob(["let t;onmessage=e=>{clearInterval(t);if(e.data>0)t=setInterval(()=>postMessage(0),e.data)}"], { type: "text/javascript" }));
    const w = new Worker(url);
    URL.revokeObjectURL(url);
    w.onmessage = () => fn();
    w.postMessage(ms);
    return () => {
      w.postMessage(0);
      w.terminate();
    };
  } catch {
    const t = setInterval(fn, ms);
    return () => clearInterval(t);
  }
}
