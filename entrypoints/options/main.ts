import { DEFAULT_SETTINGS, EFFORTS, type Settings } from '@/lib/settings';
import { getSavedSettings, saveSettings } from '@/lib/settings-store';

const form = document.querySelector<HTMLFormElement>('#settings')!;
const status = document.querySelector<HTMLElement>('#status')!;
const field = (name: keyof Settings) => form.elements.namedItem(name) as HTMLInputElement;

form.querySelector('select')!.append(...EFFORTS.map((effort) => new Option(effort, effort)));

// Show only saved values. Showing the build's development keys would make Save persist them,
// and a saved key outlives the build it came from.
const settings = await getSavedSettings();
for (const [name, value] of Object.entries(settings)) field(name as keyof Settings).value = String(value);
if (__DEV_OPENROUTER_KEY__) field('apiKey').placeholder = 'Using the development key from OPENROUTER_TEST_API_KEY';
if (__DEV_KAGI_KEY__) field('kagiApiKey').placeholder = 'Using the development key from KAGI_TEST_API_KEY';

document.querySelector('#reset-prompt')!.addEventListener('click', () => {
  field('systemPrompt').value = DEFAULT_SETTINGS.systemPrompt;
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(form)) as Record<keyof Settings, string>;
  await saveSettings({
    ...data,
    apiKey: data.apiKey.trim(),
    kagiApiKey: data.kagiApiKey.trim(),
    model: data.model.trim(),
    effort: data.effort as Settings['effort'],
    snippetCount: Number(data.snippetCount),
    extractCount: Number(data.extractCount),
    budgetMs: Number(data.budgetMs),
    maxSearchQueries: Number(data.maxSearchQueries),
    searchResultCount: Number(data.searchResultCount),
    searchExtractCount: Number(data.searchExtractCount),
  });
  status.textContent = 'Saved';
  setTimeout(() => (status.textContent = ''), 1500);
});
