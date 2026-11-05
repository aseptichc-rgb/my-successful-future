import { getAppsInTossGlobals } from '@apps-in-toss/web-framework';
export function isTossHost() {
  try { return Boolean(getAppsInTossGlobals()?.deploymentId); }
  catch { return false; }
}
