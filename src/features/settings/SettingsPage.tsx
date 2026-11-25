import { clsx } from 'clsx';
import type { ComponentType } from 'react';
import { Link, useParams } from 'wouter';
import { AboutSettings } from './AboutSettings';
import { AccountsSettings } from './AccountsSettings';
import { CategoriesSettings } from './CategoriesSettings';
import { GeneralSettings } from './GeneralSettings';
import { KeyboardSettings } from './KeyboardSettings';
import { StorageSettings } from './StorageSettings';
import { TagsSettings } from './TagsSettings';
import styles from './SettingsPage.module.scss';

const SECTIONS: readonly { id: string; title: string; component: ComponentType }[] = [
  { id: 'general', title: 'General', component: GeneralSettings },
  { id: 'accounts', title: 'Accounts', component: AccountsSettings },
  { id: 'categories', title: 'Categories', component: CategoriesSettings },
  { id: 'tags', title: 'Tags', component: TagsSettings },
  { id: 'keyboard', title: 'Keyboard', component: KeyboardSettings },
  { id: 'storage', title: 'Storage', component: StorageSettings },
  { id: 'about', title: 'About', component: AboutSettings },
];

export function SettingsPage() {
  const { section = 'general' } = useParams<{ section?: string }>();
  const current = SECTIONS.find((s) => s.id === section) ?? SECTIONS[0];
  if (!current) return null;
  const Section = current.component;
  return (
    <div className={styles.root}>
      <nav className={styles.nav} aria-label="Settings">
        {SECTIONS.map((s) => (
          <Link
            key={s.id}
            href={`/settings/${s.id}`}
            className={clsx(styles.link, s.id === current.id && styles.active)}
            aria-current={s.id === current.id ? 'page' : undefined}
          >
            {s.title}
          </Link>
        ))}
      </nav>
      <div className={styles.content}>
        <Section />
      </div>
    </div>
  );
}
