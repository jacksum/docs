import { ThemeContext } from '@rspress/core/runtime';
import { IconMoon, IconSun, SvgWrapper } from '@rspress/core/theme-original';
import { useContext } from 'react';
import './appearance.css';

export * from '@rspress/core/theme-original';

export function SwitchAppearance({ onClick }: { onClick?: () => void }) {
  const { theme, setTheme } = useContext(ThemeContext);
  const dark = theme === 'dark';

  return (
    <button
      type="button"
      className="pi-theme-switch"
      aria-label="深色主题"
      aria-pressed={dark}
      title="切换亮色或暗色主题"
      onClick={() => {
        setTheme?.(dark ? 'light' : 'dark');
        onClick?.();
      }}
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
