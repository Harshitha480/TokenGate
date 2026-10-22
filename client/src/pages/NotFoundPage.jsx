import { Page, PageHeader } from '../components/shell/AppShell.jsx';
import { LinkButton } from '../components/ui/Button.jsx';

export function NotFoundPage() {
  return (
    <Page>
      <PageHeader title="Page not found" subtitle="There is nothing at this address." />
      <div>
        <LinkButton to="/" variant="primary">
          Go to the overview
        </LinkButton>
      </div>
    </Page>
  );
}
