import { Layout as DefaultLayout, NavList, type LayoutProps } from '@rspress/core/theme-original';
import { DocumentSwitcher } from '../../../shared/DocumentSwitcher';
import './navigation.css';

export * from '@rspress/core/theme-original';

export function Layout({ beforeNavTitle, afterRightNavItems, ...props }: LayoutProps) {
  return (
    <DefaultLayout
      {...props}
      beforeNavTitle={<>{beforeNavTitle}<DocumentSwitcher current="omp" /></>}
      afterRightNavItems={<><NavList items={[{ text: '官方文档', link: 'https://omp.sh/docs' }]} />{afterRightNavItems}</>}
    />
  );
}
