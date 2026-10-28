// What the first screen says of adding the app to the home screen (FR-APP-03; no screen, no state of the app: tested by
// itself in tests/unit). On an iPhone or an iPad, in a tab of Safari: the steps, and why the App is made only after
// (the app on the home screen keeps its own store, apart from Safari's). Where the browser offers to install it
// (beforeinstallprompt, Chrome): a button. Opened from the home screen: nothing

// an iPhone, an iPad (an iPad says it is a Mac, with a touch screen), or an iPod
/** @param {{ userAgent: string, platform: string, maxTouchPoints: number }} nav */
export const isIos = nav => /iP(hone|ad|od)/.test(nav.userAgent) || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1);
// opened from the home screen: the display mode the manifest asks for, or (Safari on an iPhone) navigator.standalone
/** @param {boolean} displayStandalone @param {unknown} navStandalone */
export const isStandalone = (displayStandalone, navStandalone) => displayStandalone || navStandalone === true;
/** @param {{ standalone: boolean, ios: boolean, offered: boolean }} o @returns {'' | 'ios' | 'button'} */
export function installHint({ standalone, ios, offered }) {
  if (standalone) return '';
  if (ios) return 'ios';
  return offered ? 'button' : '';
}
// A new version of the app taken over by its worker (FR-APP-02): the page is loaded again when nothing typed can be
// lost: nothing being read or sent, and off the desk, or the desk left (the page hidden)
/** @param {{ updated: boolean, onDesk: boolean, visible: boolean, busy: boolean }} s */
export const switchNow = s => s.updated && !s.busy && (!s.onDesk || !s.visible);
