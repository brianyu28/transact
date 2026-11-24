import { PlaceholderPage } from '@/components/PlaceholderPage/PlaceholderPage';
import { StorageSettings } from './StorageSettings';

export function SettingsPage() {
  return (
    <>
      <StorageSettings />
      <PlaceholderPage
        phase={2}
        summary="File and device preferences, categories, tags and keyboard shortcuts."
      />
    </>
  );
}
