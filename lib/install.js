// What the first screen says of adding the app to the home screen (FR-APP-03; no screen, no state of the app: tested by
// itself in tests/unit). On an iPhone or an iPad, in a tab of Safari: the steps, and why the token is put in only after
// (the app on the home screen keeps its own store, apart from Safari's). Where the browser offers to install it
// (beforeinstallprompt, Chrome): a button. Opened from the home screen: nothing

// an iPhone, an iPad (an iPad says it is a Mac, with a touch screen), or an iPod
/** @param {{ userAgent: string, platform: string, maxTouchPoints: number }} nav */
export const isIos = nav => /iP(hone|ad|od)/.test(nav.userAgent) || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1);
/** @param {{ standalone: boolean, ios: boolean, offered: boolean }} o @returns {'' | 'ios' | 'button'} */
export function installHint({ standalone, ios, offered }) {
  if (standalone) return '';
  if (ios) return 'ios';
  return offered ? 'button' : '';
}
