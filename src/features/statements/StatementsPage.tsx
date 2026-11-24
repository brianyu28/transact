import { useParams } from 'wouter';
import { ReconcileWorkspace } from './ReconcileWorkspace';
import { StatementsList } from './StatementsList';

export function StatementsPage() {
  const { id } = useParams<{ id?: string }>();
  return id ? <ReconcileWorkspace id={id} /> : <StatementsList />;
}
