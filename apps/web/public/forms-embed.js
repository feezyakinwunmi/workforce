/*! Workbase Forms embed. Put this where the form should appear:
 *   <div data-workbase-form="https://workbase-forms.vercel.app/f/abcd2345"></div>
 *   <script src="https://workbase-forms.vercel.app/forms-embed.js" async></script>
 * Optional: data-theme="dark" | "auto" (default light).
 * The form grows and shrinks to fit, so there is never a scroll bar inside it.
 */
(function () {
  "use strict";
  var frames = [];

  function setup(el) {
    if (el.getAttribute("data-workbase-ready")) return;
    var url = el.getAttribute("data-workbase-form") || "";
    var u;
    try {
      u = new URL(url, document.baseURI);
    } catch (e) {
      return;
    }
    if (!/^https?:$/.test(u.protocol)) return;
    el.setAttribute("data-workbase-ready", "1");
    u.searchParams.set("embed", "1");
    var theme = el.getAttribute("data-theme");
    if (theme === "dark" || theme === "auto") u.searchParams.set("theme", theme);
    var f = document.createElement("iframe");
    f.src = u.toString();
    f.title = el.getAttribute("data-title") || "Form";
    f.setAttribute("allow", "payment");
    f.style.cssText = "display:block;width:100%;border:0;min-height:420px;height:420px;background:transparent;overflow:hidden";
    f.setAttribute("scrolling", "no");
    el.innerHTML = "";
    el.appendChild(f);
    frames.push({ frame: f, origin: u.origin });
  }

  function scan() {
    var list = document.querySelectorAll("[data-workbase-form]");
    for (var i = 0; i < list.length; i++) setup(list[i]);
  }

  window.addEventListener("message", function (e) {
    var d = e.data;
    if (!d || d.type !== "workbase-form") return;
    for (var i = 0; i < frames.length; i++) {
      var x = frames[i];
      if (x.frame.contentWindow !== e.source || x.origin !== e.origin) continue;
      if (typeof d.height === "number" && d.height > 0 && d.height < 20000) {
        x.frame.style.height = Math.ceil(d.height) + "px";
        x.frame.style.minHeight = "0";
      }
      if (d.scroll) {
        var top = x.frame.getBoundingClientRect().top;
        if (top < 0 || top > window.innerHeight) x.frame.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", scan);
  else scan();
  // Page builders (Elementor, Wix…) sometimes add the box later.
  setTimeout(scan, 1500);
})();
