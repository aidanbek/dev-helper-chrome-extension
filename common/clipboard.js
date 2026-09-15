// Запись в буфер обмена: text/plain и опционально text/html.
(() => {
  'use strict';

  const DevHelper = globalThis.DevHelper;

  // Кладёт в буфер оба флейвора через событие copy (нужен выделенный узел)
  function copyViaEvent(text, html) {
    let ok = false;
    const onCopy = (event) => {
      event.clipboardData.setData('text/plain', text);
      if (html) event.clipboardData.setData('text/html', html);
      event.preventDefault();
      ok = true;
    };

    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:-1000px;left:-1000px;opacity:0;';
    document.body.appendChild(ta);
    ta.select();

    document.addEventListener('copy', onCopy, true);
    try {
      if (!document.execCommand('copy')) ok = false;
    } catch (e) {
      ok = false;
    }
    document.removeEventListener('copy', onCopy, true);
    ta.remove();
    return ok;
  }

  async function write(text, html) {
    if (html && navigator.clipboard && typeof ClipboardItem !== 'undefined') {
      try {
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/plain': new Blob([text], { type: 'text/plain' }),
            'text/html': new Blob([html], { type: 'text/html' })
          })
        ]);
        return true;
      } catch (e) {
        DevHelper.log('ClipboardItem не сработал, фолбэк на execCommand:', e && e.message);
      }
    }

    if (!html) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (e) {
        DevHelper.log('writeText не сработал, фолбэк на execCommand:', e && e.message);
      }
    }

    return copyViaEvent(text, html);
  }

  DevHelper.clipboard = { write };
})();
