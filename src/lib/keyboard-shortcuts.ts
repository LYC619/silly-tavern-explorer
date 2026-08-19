const INTERACTIVE_SHORTCUT_SCOPE = [
  'input',
  'textarea',
  'select',
  'button',
  'a[href]',
  'summary',
  '[contenteditable="true"]',
  '[role="alertdialog"]',
  '[role="button"]',
  '[role="checkbox"]',
  '[role="combobox"]',
  '[role="dialog"]',
  '[role="listbox"]',
  '[role="menu"]',
  '[role="menuitem"]',
  '[role="option"]',
  '[role="radio"]',
  '[role="slider"]',
  '[role="switch"]',
  '[role="tab"]',
].join(', ');

export function shouldIgnoreGlobalShortcut(event: KeyboardEvent): boolean {
  if (event.defaultPrevented) return true;
  const target = event.target instanceof Element ? event.target : null;
  return target ? target.closest(INTERACTIVE_SHORTCUT_SCOPE) !== null : false;
}
