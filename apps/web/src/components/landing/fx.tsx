"use client";

/**
 * The moving parts of the public landing pages (parent site and Meet), ported from the design
 * prototypes Femi approved on 26 Nov 2026.
 *
 * The pages themselves are plain server-rendered markup (see app/home/landing.tsx and
 * app/meet/(site)/landing.tsx). This component only adds behaviour once the page is in the
 * browser, so everything is readable even if this script never runs:
 *
 *   both pages   pointer light in the hero, light under the pointer on cards, count-up numbers
 *   "home"       rotating word, product window that switches every 5 s, pop-up alerts,
 *                live bento cards (ticking clock, tasks ticking off, speaker ring, slots, total)
 *   generic      [data-lp-tabs] tabs with demos, [data-lp-cycle] moving highlight, [data-lp-timer] clocks
 *   "meet"       live call (speaker ring, rec timer, data meter, chat), feature tabs with demos,
 *                guest typing their name, confetti, network meter, join-by-code box
 *
 * All timers stop when the page unmounts, and none start when the visitor asked for less motion.
 */

import { useEffect } from "react";

type Cleanup = () => void;

export function LandingFx({ kind, meetBase = "" }: { kind: "home" | "meet" | "workbase" | "book" | "forms" | "padi"; meetBase?: string }) {
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const cleanups: Cleanup[] = [];
    const every = (ms: number, fn: () => void) => {
      const id = window.setInterval(fn, ms);
      cleanups.push(() => window.clearInterval(id));
    };
    const on = <K extends keyof HTMLElementEventMap>(el: Element | null, type: K, fn: (e: HTMLElementEventMap[K]) => void) => {
      if (!el) return;
      el.addEventListener(type, fn as EventListener);
      cleanups.push(() => el.removeEventListener(type, fn as EventListener));
    };
    const $ = <T extends Element = HTMLElement>(sel: string) => document.querySelector<T & Element>(sel) as T | null;
    const $$ = <T extends Element = HTMLElement>(sel: string) => [...document.querySelectorAll(sel)] as T[];

    /* ---------------------------------------------------------------- shared */

    // Hero light follows the pointer.
    const hero = $("#lp-hero");
    const spot = hero?.querySelector<HTMLElement>(".lp-spot");
    on(hero, "pointermove", (e) => {
      if (!hero || !spot) return;
      const r = hero.getBoundingClientRect();
      spot.style.setProperty("--mx", `${e.clientX - r.left}px`);
      spot.style.setProperty("--my", `${e.clientY - r.top}px`);
    });

    // Soft light under the pointer on every card.
    $$(".lp-fcard").forEach((c) =>
      on(c, "pointermove", (e) => {
        const r = c.getBoundingClientRect();
        c.style.setProperty("--x", `${e.clientX - r.left}px`);
        c.style.setProperty("--y", `${e.clientY - r.top}px`);
      }),
    );

    // Numbers count up the first time they scroll into view (they already show the final value).
    const counters = $$("[data-count]");
    if (!reduce && typeof IntersectionObserver !== "undefined") {
      const io = new IntersectionObserver(
        (entries) =>
          entries.forEach((e) => {
            if (!e.isIntersecting) return;
            io.unobserve(e.target);
            const el = e.target as HTMLElement;
            const end = Number(el.dataset.count);
            if (!end) return;
            const t0 = performance.now();
            const step = (t: number) => {
              const p = Math.min(1, (t - t0) / 1000);
              el.textContent = Math.round(end * (1 - Math.pow(1 - p, 3))).toLocaleString("en-NG");
              if (p < 1) requestAnimationFrame(step);
            };
            requestAnimationFrame(step);
          }),
        { threshold: 0.6 },
      );
      counters.forEach((el) => io.observe(el));
      cleanups.push(() => io.disconnect());
    }

    /* ---------------------------------------------------------------- home (rotating word, product window, bento) */
    {
      // Rotating word in the headline.
      // The box takes the width of the word on screen, so there is never a gap beside it.
      const rot = $("#lp-rot");
      const words = $$("#lp-rot > span");
      let w = 0;
      const fit = () => {
        if (rot && words[w]) rot.style.width = `${words[w].scrollWidth}px`;
      };
      fit();
      on(window as unknown as Element, "resize", fit);
      if (!reduce && words.length > 1)
        every(2400, () => {
          const prev = w;
          w = (w + 1) % words.length;
          words.forEach((el, i) => (el.dataset.s = i === w ? "in" : i === prev ? "out" : "wait"));
          fit();
        });

      // Product window: tab bar fills over 5 s, then the next product comes on.
      const stage = $("#lp-stage");
      const tabs = $$(".lp-tab");
      const screens = $$("#lp-screens > [data-s]");
      const toasts = $$(".lp-toast");
      const show = (n: number) => {
        tabs.forEach((t, i) => t.setAttribute("aria-selected", i === n ? "true" : "false"));
        screens.forEach((s, i) => {
          s.hidden = i !== n;
          if (i === n) {
            s.classList.remove("lp-screen");
            void s.offsetWidth;
            s.classList.add("lp-screen");
          }
        });
        toasts.forEach((t) => (t.dataset.on = t.dataset.t === String(n) ? "1" : "0"));
        const bar = tabs[n]?.querySelector<HTMLElement>(".lp-bar");
        if (bar) {
          bar.style.animation = "none";
          void bar.offsetWidth;
          bar.style.animation = "";
        }
      };
      tabs.forEach((t, i) => {
        on(t, "click", () => show(i));
        on(t.querySelector(".lp-bar"), "animationend", () => show((i + 1) % tabs.length));
      });
      on(stage, "mouseenter", () => stage?.classList.add("lp-paused"));
      on(stage, "mouseleave", () => stage?.classList.remove("lp-paused"));

      if (!reduce) {
        // Ticking work timer.
        const tick = $("#lp-tick");
        let secs = 3 * 3600 + 12 * 60 + 44;
        every(1000, () => {
          secs++;
          const p = (n: number) => String(n).padStart(2, "0");
          if (tick) tick.textContent = `${p(Math.floor(secs / 3600))}:${p(Math.floor(secs / 60) % 60)}:${p(secs % 60)}`;
        });

        // Tasks tick off one by one, then reset.
        const checks = $$("#lp-todo .lp-chk");
        let c = 0;
        every(1100, () => {
          if (c === checks.length) {
            checks.forEach((k) => {
              k.innerHTML = "";
              k.style.background = k.style.borderColor = "";
              const row = k.parentElement as HTMLElement;
              row.style.color = row.style.textDecoration = "";
            });
            c = 0;
            return;
          }
          const k = checks[c++];
          k.style.background = k.style.borderColor = "#6a4cf5";
          k.innerHTML = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>';
          const row = k.parentElement as HTMLElement;
          row.style.color = "#9a97b3";
          row.style.textDecoration = "line-through";
        });

        // Speaker ring moves around the little call.
        const spk = $$("#lp-callgrid .lp-spk");
        let sp = 0;
        every(1500, () => {
          sp = (sp + 1) % spk.length;
          spk.forEach((e, i) => (e.style.opacity = i === sp ? "1" : "0"));
        });

        // A booking slot gets picked.
        const slots = $$("#lp-slots .lp-slot");
        let sl = 0;
        every(1300, () => {
          sl = (sl + 1) % slots.length;
          slots.forEach((e, i) => {
            const picked = i === sl;
            e.style.background = picked ? "#6a4cf5" : "";
            e.style.color = picked ? "#fff" : "";
            e.style.fontWeight = picked ? "600" : "";
          });
        });

        // Form options toggle and the total follows.
        const opts = $$("#lp-opts .lp-opt");
        const total = $("#lp-total");
        const price = [5000, 3500];
        let state = 0;
        every(1400, () => {
          state = (state + 1) % 4;
          let sum = 0;
          opts.forEach((o, i) => {
            const picked = Boolean(state & (1 << i));
            o.style.boxShadow = picked ? "0 0 0 2px #6a4cf5" : "";
            o.style.background = picked ? "#f3f0ff" : "";
            if (picked) sum += price[i];
          });
          if (total) total.textContent = `₦${sum.toLocaleString("en-NG")}`;
        });
      }
    }

    /* ---------------------------------------------------------------- meet (call, feature tabs, network meter) */
    {
      // Join by code or link.
      const form = $<HTMLFormElement>("#lp-joinform");
      on(form, "submit", (e) => {
        e.preventDefault();
        const input = form?.querySelector("input");
        const m = input?.value.trim().toLowerCase().match(/[a-z]{3}-[a-z]{4}-[a-z]{3}/);
        if (m) window.location.href = `${meetBase}/${m[0]}`;
        else input?.focus();
      });

      if (!reduce) {
        const spk = $$("#lp-tiles .lp-spk");
        let sp = 0;
        every(1800, () => {
          sp = (sp + 1) % spk.length;
          spk.forEach((e, i) => (e.style.opacity = i === sp ? "1" : "0"));
        });
        let t = 12 * 60 + 8;
        let mb = 18.4;
        const rec = $("#lp-rec");
        const mbel = $("#lp-mb");
        every(1000, () => {
          t++;
          mb += 0.07;
          if (rec) rec.textContent = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
          if (mbel) mbel.textContent = `${mb.toFixed(1)} MB`;
        });
        const msgs = ["Can you share the new designs?", "The first option looks good", "Let's go with Thursday", "Sending the invoice now"];
        let m = 0;
        const msg = $("#lp-chatmsg");
        every(3200, () => {
          if (!msg) return;
          m = (m + 1) % msgs.length;
          msg.textContent = msgs[m];
          msg.classList.remove("lp-chat-in");
          void msg.offsetWidth;
          msg.classList.add("lp-chat-in");
        });
      }

      // Feature tabs with a demo each; auto-advance every 5 s, pause on hover.
      const feat = $("#lp-feat");
      const ftabs = $$(".lp-ftab");
      const views = $$("#lp-views > [data-v]");
      let typing = 0;
      const typeName = () => {
        const el = $("#lp-typed");
        if (!el) return;
        const name = "Kemi Johnson";
        let i = 0;
        window.clearInterval(typing);
        el.textContent = reduce ? name : "";
        if (reduce) return;
        typing = window.setInterval(() => {
          el.textContent = name.slice(0, ++i);
          if (i >= name.length) window.clearInterval(typing);
        }, 110);
      };
      cleanups.push(() => window.clearInterval(typing));

      let confettiFrame = 0;
      const confetti = () => {
        const c = $<HTMLCanvasElement>("#lp-confetti");
        if (reduce || !c) return;
        const ctx = c.getContext("2d");
        if (!ctx) return;
        const r = c.getBoundingClientRect();
        c.width = r.width;
        c.height = r.height;
        const colours = ["#f2a93b", "#6a4cf5", "#ffffff", "#7c5cff"];
        const bits = Array.from({ length: 90 }, () => ({
          x: Math.random() * c.width,
          y: -20 - Math.random() * c.height,
          v: 1.5 + Math.random() * 2.5,
          s: 4 + Math.random() * 5,
          a: Math.random() * 6,
          col: colours[Math.floor(Math.random() * 4)],
        }));
        let f = 0;
        cancelAnimationFrame(confettiFrame);
        const draw = () => {
          ctx.clearRect(0, 0, c.width, c.height);
          bits.forEach((b) => {
            b.y += b.v;
            b.a += 0.08;
            ctx.save();
            ctx.translate(b.x + Math.sin(b.a) * 8, b.y);
            ctx.rotate(b.a);
            ctx.fillStyle = b.col;
            ctx.fillRect(-b.s / 2, -b.s / 4, b.s, b.s / 2);
            ctx.restore();
          });
          if (++f < 260) confettiFrame = requestAnimationFrame(draw);
        };
        draw();
      };
      cleanups.push(() => cancelAnimationFrame(confettiFrame));

      const showF = (n: number) => {
        ftabs.forEach((b, i) => b.setAttribute("aria-selected", i === n ? "true" : "false"));
        views.forEach((v, i) => {
          v.hidden = i !== n;
          if (i === n) {
            v.classList.remove("lp-screen");
            void v.offsetWidth;
            v.classList.add("lp-screen");
          }
        });
        const p = ftabs[n]?.querySelector<HTMLElement>(".lp-prog");
        if (p) {
          p.style.animation = "none";
          void p.offsetWidth;
          p.style.animation = "";
        }
        if (n === 0) typeName();
        if (n === 4) confetti();
      };
      ftabs.forEach((b, i) => {
        on(b, "click", () => showF(i));
        on(b.querySelector(".lp-prog"), "animationend", () => showF((i + 1) % ftabs.length));
      });
      on(feat, "mouseenter", () => feat?.classList.add("lp-fpaused"));
      on(feat, "mouseleave", () => feat?.classList.remove("lp-fpaused"));
      typeName();

      // Network meter: bars move; every so often the signal drops and Meet saves data.
      const nb = $("#lp-netbars");
      if (nb) {
        nb.innerHTML = Array.from({ length: 40 }, () => '<span style="flex:1;height:70%;border-radius:3px 3px 0 0;background:#34d399;transition:all .5s"></span>').join("");
        const bars = [...nb.children] as HTMLElement[];
        let k = 0;
        let mb2 = 18.4;
        if (!reduce)
          every(900, () => {
            k++;
            const bad = k % 14 > 9;
            mb2 += bad ? 0.02 : 0.08;
            bars.forEach((b) => {
              b.style.height = `${bad ? 15 + Math.random() * 25 : 55 + Math.random() * 40}%`;
              b.style.background = bad ? "#f2a93b" : "#34d399";
            });
            const label = $("#lp-netlabel");
            const q = $("#lp-netq");
            const used = $("#lp-netmb");
            if (label) label.textContent = bad ? "Weak, saving data" : "Good";
            if (q) q.textContent = bad ? "Low (voice first)" : "HD";
            if (used) used.textContent = `${mb2.toFixed(1)} MB`;
          });
      }
    }


    /* ---------------------------------------------------------------- generic pieces (Workbase, Book, Forms) */

    // Tabs with a demo each: [data-lp-tabs] holds .lp-ftab buttons (each with a .lp-prog bar) and
    // [data-v] views. The bar fills over 5 s, then the next tab comes on; hovering pauses it.
    $$("[data-lp-tabs]").forEach((box) => {
      const btns = [...box.querySelectorAll<HTMLElement>(".lp-ftab")];
      const panes = [...box.querySelectorAll<HTMLElement>("[data-v]")];
      const pick = (n: number) => {
        btns.forEach((b, i) => b.setAttribute("aria-selected", i === n ? "true" : "false"));
        panes.forEach((v, i) => {
          v.hidden = i !== n;
          if (i === n) {
            v.classList.remove("lp-screen");
            void v.offsetWidth;
            v.classList.add("lp-screen");
          }
        });
        const p = btns[n]?.querySelector<HTMLElement>(".lp-prog");
        if (p) {
          p.style.animation = "none";
          void p.offsetWidth;
          p.style.animation = "";
        }
      };
      btns.forEach((b, i) => {
        on(b, "click", () => pick(i));
        on(b.querySelector(".lp-prog"), "animationend", () => pick((i + 1) % btns.length));
      });
      on(box, "mouseenter", () => box.classList.add("lp-fpaused"));
      on(box, "mouseleave", () => box.classList.remove("lp-fpaused"));
    });

    // Moving highlight: [data-lp-cycle="ms"] marks one child [data-c] at a time with data-on="1"
    // (Tailwind data-[on=1]:… classes style it). Used for slots, speakers, rows arriving.
    if (!reduce)
      $$("[data-lp-cycle]").forEach((box) => {
        const items = [...box.querySelectorAll<HTMLElement>("[data-c]")];
        if (items.length < 2) return;
        let n = items.findIndex((x) => x.dataset.on === "1");
        every(Number(box.dataset.lpCycle) || 1500, () => {
          n = (n + 1) % items.length;
          items.forEach((x, i) => (x.dataset.on = i === n ? "1" : "0"));
        });
      });

    // Running clocks: [data-lp-timer="seconds"] counts up once a second.
    if (!reduce)
      $$("[data-lp-timer]").forEach((el) => {
        let secs = Number(el.dataset.lpTimer) || 0;
        const p = (n: number) => String(n).padStart(2, "0");
        every(1000, () => {
          secs++;
          el.textContent = `${p(Math.floor(secs / 3600))}:${p(Math.floor(secs / 60) % 60)}:${p(secs % 60)}`;
        });
      });

    return () => cleanups.forEach((fn) => fn());
  }, [kind, meetBase]);

  return null;
}
