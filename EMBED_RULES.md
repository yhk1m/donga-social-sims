# 결과물 HTML 규칙 (사용자 지정, 반드시 준수)

You MUST follow these rules when generating HTML:

1. Structure
- Plain HTML/CSS/JS only. Wrap content in a unique wrapper div (e.g. <div class="my-content">). Avoid external CDN (use only when unavoidable, with reason as a comment)
- Forbidden: <iframe src="external-url">, <object>, <embed>, <meta http-equiv="refresh">, <form action="external-url">, postMessage
- Storage: localStorage/sessionStorage personal data forbidden (keys like email/name/phone/password/token/login/userid/etc., or email/phone/SSN-formatted values). Non-personal (game state, UI state) allowed; add a one-line comment above each setItem explaining purpose

2. CSS
- All styles scoped to wrapper via unique class names
- Forbidden: tag selectors, !important, [class*=...], *{}, :root{}, position:fixed, z-index above 100

3. JavaScript
- Scripts and querySelector must stay inside the wrapper. Use textContent/createElement for output
- Forbidden (execution/network): eval, new Function, fetch, XMLHttpRequest, WebSocket, EventSource, sendBeacon, Worker, ServiceWorker, import(), parent.document, window.top, document.cookie, window.open, location.href/replace
- Forbidden (XSS): innerHTML, outerHTML, document.write, insertAdjacentHTML, javascript:/data:/blob: URLs, setAttribute('on*',...), iframe.srcdoc, DOMParser.parseFromString
