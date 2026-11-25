import { ThemeContext, useI18n, useNav, useSite } from '@rspress/core/runtime';
import {
  IconMoon,
  IconSearch,
  IconSun,
  Layout as DefaultLayout,
  NavHamburger as DefaultNavHamburger,
  NavList,
  SearchButton as DefaultSearchButton,
  SvgWrapper,
  type LayoutProps,
  type SearchButtonProps,
} from '@rspress/core/theme-original';
import { useContext, useEffect, useState, type ComponentProps } from 'react';
import { DocumentSwitcher } from '../../../shared/DocumentSwitcher';
import './appearance.css';

export * from '@rspress/core/theme-original';

function AppearanceButton() {
  const { theme, setTheme } = useContext(ThemeContext);
  const [mounted, setMounted] = useState(false);
  const dark = theme === 'dark';

  // The server does not know the browser's theme preference.
  useEffect(() => setMounted(true), []);

  return (
    <button
      type="button"
      className="pi-theme-switch"
      aria-label="深色主题"
      aria-pressed={mounted ? dark : undefined}
      title="切换亮色或暗色主题"
      onClick={() => setTheme?.(dark ? 'light' : 'dark')}
    >
      <span aria-hidden="true" className="pi-theme-switch__sun">
        <SvgWrapper icon={IconSun} fill="currentColor" />
      </span>
      <span aria-hidden="true" className="pi-theme-switch__moon">
        <SvgWrapper icon={IconMoon} fill="currentColor" />
      </span>
    </button>
  );
}

export function SearchButton(props: SearchButtonProps) {
  const t = useI18n();

  return (
    <>
      <DefaultSearchButton {...props} />
      <button
        type="button"
        className="pi-search-button--mobile"
        aria-label={t('searchPlaceholderText')}
        onClick={() => props.setFocused(true)}
      >
        <span aria-hidden="true">
          <SvgWrapper icon={IconSearch} width={20} height={20} />
        </span>
      </button>
    </>
  );
}

// The shared header button replaces the default appearance controls.
export function SwitchAppearance() {
  return null;
}

export function NavHamburger(props: ComponentProps<typeof DefaultNavHamburger>) {
  const nav = useNav();
  const { site } = useSite();
  const locales = site.locales ?? site.themeConfig.locales ?? {};
  const hasMenu = nav.length > 0 || site.multiVersion.versions.length > 1 ||
    Object.keys(locales).length > 1 || Boolean(site.themeConfig.socialLinks?.length) ||
    Object.values(props).some(Boolean);
  return hasMenu ? <DefaultNavHamburger {...props} /> : null;
}

export function Layout({ beforeNavTitle, afterNavMenu, afterRightNavItems, ...props }: LayoutProps) {
  return (
    <DefaultLayout
      {...props}
      beforeNavTitle={<>{beforeNavTitle}<DocumentSwitcher current="pi" /></>}
      afterRightNavItems={<><NavList items={[{ text: '官方文档', link: 'https://docs.pi.dev/latest/' }]} />{afterRightNavItems}</>}
      afterNavMenu={<>{afterNavMenu}<AppearanceButton /></>}
    />
  );
}
