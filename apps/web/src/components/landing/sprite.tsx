/**
 * Shared SVG sprite for the landing pages: line icons (same drawings as components/icons.tsx)
 * and the four product marks. Use them with <svg><use href="#i-clock" /></svg>.
 * Rendered once per page, hidden and zero-sized.
 */
export function LandingSprite() {
  return (
    <svg width="0" height="0" style={{"position": "absolute"}} aria-hidden="true">
      <defs>
        <symbol id="i-clock" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></symbol>
        <symbol id="i-activity" viewBox="0 0 24 24"><path d="M3 12h4l3-7 4 14 3-7h4"/></symbol>
        <symbol id="i-tasks" viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="4"/><path d="m8.5 12 2.5 2.5 4.5-5"/></symbol>
        <symbol id="i-chat" viewBox="0 0 24 24"><path d="M20 11.5a7.5 7.5 0 0 1-11 6.6L4 19.5l1.4-4.6A7.5 7.5 0 1 1 20 11.5z"/></symbol>
        <symbol id="i-wallet" viewBox="0 0 24 24"><path d="M19 8V6.5A1.5 1.5 0 0 0 17.5 5H6a2 2 0 0 0 0 4h13a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H6a2 2 0 0 1-2-2V7"/></symbol>
        <symbol id="i-calendar" viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/></symbol>
        <symbol id="i-video" viewBox="0 0 24 24"><rect x="3" y="6.5" width="12.5" height="11" rx="2.5"/><path d="m15.5 10.5 5-3v9l-5-3z"/></symbol>
        <symbol id="i-globe" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.3 2.5 3.5 5.3 3.5 8.5s-1.2 6-3.5 8.5c-2.3-2.5-3.5-5.3-3.5-8.5s1.2-6 3.5-8.5z"/></symbol>
        <symbol id="i-zap" viewBox="0 0 24 24"><path d="M13 2.5 4.5 13.5H12l-1 8 8.5-11H12z"/></symbol>
        <symbol id="i-shield" viewBox="0 0 24 24"><path d="M12 3l7.5 3v5.5c0 4.5-3.2 8.2-7.5 9.5-4.3-1.3-7.5-5-7.5-9.5V6z"/><path d="m9 12 2 2 4-4"/></symbol>
        <symbol id="i-receipt" viewBox="0 0 24 24"><path d="M6 3.5h12v17l-2.5-1.5-2 1.5-1.5-1.5-1.5 1.5-2-1.5L6 20.5z"/><path d="M9 8h6M9 12h6"/></symbol>
        <symbol id="i-users" viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.3a6.5 6.5 0 0 1 3.5 5.7"/></symbol>
        <symbol id="i-arrow" viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></symbol>
        <symbol id="i-check" viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5"/></symbol>
        <symbol id="i-mic" viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/></symbol>
        <symbol id="i-share" viewBox="0 0 24 24"><rect x="3" y="4.5" width="18" height="12" rx="2"/><path d="M8 20h8M12 16.5V20M12 13V8m-2.5 2.5L12 8l2.5 2.5"/></symbol>
        <symbol id="i-chev" viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></symbol>
        {/* Product marks: shape on a marigold base */}
        <symbol id="m-workbase" viewBox="0 0 48 48"><rect width="48" height="48" rx="12" fill="#6A4CF5"/><path d="M12 28V17C12 13.4 14.5 11 17.8 11C26 11 33 17.6 36.5 28Z" fill="#fff"/><rect x="9" y="31" width="30" height="6" rx="3" fill="#F2A93B"/></symbol>
        <symbol id="m-meet" viewBox="0 0 48 48"><rect width="48" height="48" rx="12" fill="#6A4CF5"/><rect x="10.5" y="12.5" width="18.5" height="15.5" rx="4.2" fill="#fff"/><path d="M30.6 18.3 37.2 14.2a.9.9 0 0 1 1.3.8v11.5a.9.9 0 0 1-1.3.8l-6.6-4.1z" fill="#fff"/><rect x="9" y="31" width="30" height="6" rx="3" fill="#F2A93B"/></symbol>
        <symbol id="m-book" viewBox="0 0 48 48"><rect width="48" height="48" rx="12" fill="#6A4CF5"/><rect x="11.5" y="12.5" width="25" height="15.5" rx="3.6" fill="#fff"/><rect x="16.5" y="9" width="3.2" height="6.5" rx="1.6" fill="#fff"/><rect x="28.3" y="9" width="3.2" height="6.5" rx="1.6" fill="#fff"/><path d="m18.6 20.4 3.6 3.4 7-7" fill="none" stroke="#6A4CF5" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"/><rect x="9" y="31" width="30" height="6" rx="3" fill="#F2A93B"/></symbol>
        <symbol id="m-forms" viewBox="0 0 48 48"><rect width="48" height="48" rx="12" fill="#6A4CF5"/><rect x="12.5" y="8.5" width="23" height="19.5" rx="3.6" fill="#fff"/><rect x="16.3" y="12.6" width="4.4" height="4.4" rx="1.2" fill="#6A4CF5"/><rect x="23" y="13.7" width="8.8" height="2.2" rx="1.1" fill="#6A4CF5"/><rect x="16.3" y="19.6" width="4.4" height="4.4" rx="1.2" fill="none" stroke="#6A4CF5" strokeWidth="1.4"/><rect x="23" y="20.7" width="8.8" height="2.2" rx="1.1" fill="#6A4CF5"/><rect x="9" y="31" width="30" height="6" rx="3" fill="#F2A93B"/></symbol>
              <symbol id="i-link" viewBox="0 0 24 24"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></symbol>
        <symbol id="i-hand" viewBox="0 0 24 24"><path d="M8 12V6.5a1.5 1.5 0 0 1 3 0V11m0-5.5V4.5a1.5 1.5 0 0 1 3 0V11m0-5a1.5 1.5 0 0 1 3 0v6m0-2a1.5 1.5 0 0 1 3 0V14a7 7 0 0 1-7 7h-1.2a6 6 0 0 1-4.6-2.2L4.5 15.5a1.6 1.6 0 0 1 2.4-2L8 15"/></symbol>
        <symbol id="i-lock" viewBox="0 0 24 24"><rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/></symbol>
        <symbol id="i-rec" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3.5" fill="currentColor" stroke="none"/></symbol>
        <symbol id="i-signal" viewBox="0 0 24 24"><path d="M5 19v-3M10 19v-7M15 19V8M20 19V4"/></symbol>
        <symbol id="i-sparkle" viewBox="0 0 24 24"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/></symbol>
        <symbol id="i-party" viewBox="0 0 24 24"><path d="m4 20 4.5-12 7.5 7.5zM14 4l.5 2M19 9l2 .5M16.5 6.5 19 4"/></symbol>
        <symbol id="i-list" viewBox="0 0 24 24"><path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01"/></symbol>
        <symbol id="i-wave" viewBox="0 0 24 24"><path d="M3 12h2M7 8v8M11 5v14M15 9v6M19 11v2"/></symbol>
        <symbol id="i-browser" viewBox="0 0 24 24"><rect x="3" y="4.5" width="18" height="15" rx="2.5"/><path d="M3 9h18M6.5 6.8h.01M9 6.8h.01"/></symbol>
        <symbol id="i-mail" viewBox="0 0 24 24"><rect x="3" y="5.5" width="18" height="13" rx="2.5"/><path d="m3.5 7 8.5 6 8.5-6"/></symbol>
        <symbol id="i-user-plus" viewBox="0 0 24 24"><circle cx="10" cy="8" r="3.5"/><path d="M3.5 20a6.5 6.5 0 0 1 13 0M19 8v6M16 11h6"/></symbol>
        <symbol id="i-whatsapp" viewBox="0 0 24 24"><path d="M4 20l1.3-4A8 8 0 1 1 8 18.7z"/><path d="M9 9.5c.3 1.8 1.8 3.8 4 4.7l1.2-1.1 2 .8c-.2 1.2-1 1.8-2.2 1.8-3.6 0-6.8-3.2-6.8-6.8 0-1.2.6-2 1.8-2.2l.8 2z"/></symbol>
        <symbol id="i-code" viewBox="0 0 24 24"><path d="m8 8-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14"/></symbol>
        <symbol id="i-file" viewBox="0 0 24 24"><path d="M6 3.5h8l4 4v13H6z"/><path d="M14 3.5v4h4"/></symbol>
        <symbol id="i-sheet" viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="2.5"/><path d="M4 9.5h16M4 15h16M10 4v16"/></symbol>
        <symbol id="i-bell" viewBox="0 0 24 24"><path d="M6 16v-5a6 6 0 1 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/></symbol>
        <symbol id="i-phone" viewBox="0 0 24 24"><rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/></symbol>
        <symbol id="i-eye" viewBox="0 0 24 24"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/></symbol>
        <symbol id="i-keyboard" viewBox="0 0 24 24"><rect x="2.5" y="6" width="19" height="12" rx="2.5"/><path d="M6 10h.01M9.5 10h.01M13 10h.01M16.5 10h.01M7 14.5h10"/></symbol>
        <symbol id="i-camoff" viewBox="0 0 24 24"><path d="M3 3l18 18M15.5 15.5V16a1.5 1.5 0 0 1-1.5 1.5H5A2 2 0 0 1 3 15.5v-7A2 2 0 0 1 5 6.5h1.5M10 6.5h4a1.5 1.5 0 0 1 1.5 1.5v3l5-3v9"/></symbol>
        <symbol id="i-pin" viewBox="0 0 24 24"><path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.5"/></symbol>
        <symbol id="i-plus" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></symbol>
        <symbol id="i-windows" viewBox="0 0 24 24"><path d="M3.5 5.5 10.5 4.5v7h-7zM12.5 4.2 20.5 3v8.5h-8zM3.5 12.5h7v7l-7-1zM12.5 12.5h8V21l-8-1.2z"/></symbol>
        <symbol id="i-heart" viewBox="0 0 24 24"><path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.3 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z"/></symbol>
        <symbol id="i-star" viewBox="0 0 24 24"><path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z"/></symbol>
      </defs>
    </svg>
  );
}
