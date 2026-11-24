import { Layout as DefaultLayout, type LayoutProps } from '@rspress/core/theme-original';
import { DocumentSwitcher } from '../../../shared/DocumentSwitcher';

export * from '@rspress/core/theme-original';

export function Layout({ beforeNavTitle, ...props }: LayoutProps) {
  return <DefaultLayout {...props} beforeNavTitle={<>{beforeNavTitle}<DocumentSwitcher current="omp" /></>} />;
}
