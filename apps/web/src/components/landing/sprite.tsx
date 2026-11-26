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
      </defs>
    </svg>
  );
}
