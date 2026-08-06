import appMetadata from '../../app.json';

export const APP_VERSION = appMetadata.version;
export const BUILD_NUMBER = String(appMetadata.buildNumber);
export const APP_VERSION_LABEL = `${APP_VERSION} (${BUILD_NUMBER})`;
