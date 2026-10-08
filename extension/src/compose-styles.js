export const STYLES = `
.saa-split { display:inline-flex; align-items:center; height:36px; margin-left:8px; vertical-align:middle; font-family:"Google Sans",Roboto,Arial,sans-serif }
.saa-split [role=button] { display:inline-flex; align-items:center; height:36px; background:#c2e7ff; color:#001d35; cursor:pointer; user-select:none; outline:none; transition:background .15s, box-shadow .15s }
.saa-split [role=button]:hover { background:#b3dcf7; box-shadow:0 1px 2px rgba(0,0,0,.3) }
.saa-split [role=button]:focus-visible { box-shadow:0 0 0 2px #0b57d0 }
.saa-main { padding:0 14px 0 16px; border-radius:18px 0 0 18px; font-size:14px; font-weight:500; letter-spacing:.25px; gap:6px; max-width:240px }
.saa-main .saa-name { overflow:hidden; text-overflow:ellipsis; white-space:nowrap }
.saa-arrow { padding:0 10px 0 8px; border-radius:0 18px 18px 0; border-left:1px solid rgba(0,29,53,.18) }
.saa-split[aria-busy=true] [role=button] { cursor:progress; opacity:.75 }
.saa-spinner { width:14px; height:14px; border:2px solid #001d35; border-right-color:transparent; border-radius:50%; animation:saa-spin .7s linear infinite }
@keyframes saa-spin { to { transform:rotate(360deg) } }
.saa-menu { position:fixed; z-index:2147483647; min-width:280px; max-width:360px; padding:8px 0; background:#fff; border-radius:8px; box-shadow:0 2px 6px 2px rgba(60,64,67,.15), 0 1px 2px rgba(60,64,67,.3); font-family:"Google Sans",Roboto,Arial,sans-serif; color:#1f1f1f; animation:saa-in .12s ease-out }
@keyframes saa-in { from { opacity:0; transform:translateY(4px) } }
.saa-menu-title { padding:6px 16px 8px; font-size:12px; font-weight:500; color:#444746; letter-spacing:.3px }
.saa-item { display:flex; align-items:center; gap:12px; width:100%; padding:8px 16px; border:0; background:none; text-align:left; cursor:pointer; font:inherit; color:inherit; outline:none }
.saa-item:hover, .saa-item:focus { background:#f2f2f2 }
.saa-avatar { flex:none; width:32px; height:32px; border-radius:50%; display:flex; align-items:center; justify-content:center; color:#fff; font-size:14px; font-weight:500 }
.saa-text { flex:1; min-width:0 }
.saa-text b { display:block; font-size:14px; font-weight:500; overflow:hidden; text-overflow:ellipsis; white-space:nowrap }
.saa-text span { display:block; font-size:12px; color:#444746; overflow:hidden; text-overflow:ellipsis; white-space:nowrap }
.saa-check { flex:none; width:18px; color:#0b57d0 }
.saa-divider { height:1px; margin:8px 0; background:#e3e3e3 }
.saa-link { padding:8px 16px 8px 60px; font-size:14px }
.saa-snackbar { position:fixed; z-index:2147483647; left:24px; bottom:24px; display:flex; align-items:center; gap:24px; min-width:288px; max-width:560px; padding:14px 16px; border-radius:4px; background:#303030; color:#f2f2f2; font:14px/20px "Google Sans",Roboto,Arial,sans-serif; box-shadow:0 3px 5px -1px rgba(0,0,0,.2), 0 6px 10px rgba(0,0,0,.14); animation:saa-in .15s ease-out }
.saa-snackbar button { margin-left:auto; padding:0 8px; border:0; background:none; color:#a8c7fa; font:500 14px "Google Sans",Roboto,Arial,sans-serif; cursor:pointer }
`;

export const CHEVRON =
  '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7 10l5 5 5-5z"/></svg>';
export const CHECK =
  '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"/></svg>';

const AVATAR_COLORS = ["#1a73e8", "#e8710a", "#188038", "#a142f4", "#d93025", "#007b83"];

export function avatarColor(text) {
  let hash = 0;
  for (const char of text) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}
