import { storage } from '#imports';
import { DEFAULT_SETTINGS, type Settings } from './settings';

const settingsItem = storage.defineItem<Partial<Settings>>('local:settings', { fallback: {} });

/** Settings as the user saved them, without the development keys filled in. */
export async function getSavedSettings(): Promise<Settings> {
  return { ...DEFAULT_SETTINGS, ...(await settingsItem.getValue()) };
}

export async function getSettings(): Promise<Settings> {
  const settings = await getSavedSettings();
  return {
    ...settings,
    apiKey: settings.apiKey || __DEV_OPENROUTER_KEY__,
    kagiApiKey: settings.kagiApiKey || __DEV_KAGI_KEY__,
  };
}

/** Stores only values that differ from the defaults, so improved defaults reach existing users. */
export function saveSettings(settings: Settings): Promise<void> {
  const overrides = Object.fromEntries(
    Object.entries(settings).filter(([k, v]) => v !== DEFAULT_SETTINGS[k as keyof Settings]),
  );
  return settingsItem.setValue(overrides);
}
