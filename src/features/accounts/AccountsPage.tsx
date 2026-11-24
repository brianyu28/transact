import { useParams } from 'wouter';
import { AccountDetail } from './AccountDetail';
import { AccountsOverview } from './AccountsOverview';

export function AccountsPage() {
  const { id } = useParams<{ id?: string }>();
  return id ? <AccountDetail id={id} /> : <AccountsOverview />;
}
