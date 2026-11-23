import { useSite, useVersion } from '@rspress/core/runtime';
import { Layout as DefaultLayout } from '@rspress/core/theme-original';
import './version.css';

export * from '@rspress/core/theme-original';

export function Layout() {
  const { site } = useSite();
  const version = useVersion();
  const onlyVersion = site.multiVersion.versions.length === 1;

  return (
    <DefaultLayout
      beforeNavMenu={onlyVersion && (
        <details className="pi-version-menu">
          <summary aria-label={`文档版本：${version}`}>{version}</summary>
          <div className="pi-version-menu__options">
            <span aria-current="true">{version}</span>
          </div>
        </details>
      )}
    />
  );
}
