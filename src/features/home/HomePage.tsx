import { DocumentSummary } from '@/components/DocumentSummary/DocumentSummary';
import { PlaceholderPage } from '@/components/PlaceholderPage/PlaceholderPage';

export function HomePage() {
  return (
    <>
      <DocumentSummary />
      <PlaceholderPage
        phase={4}
        summary="Current monthly, annual and custom budgets with spending pace."
      />
    </>
  );
}
