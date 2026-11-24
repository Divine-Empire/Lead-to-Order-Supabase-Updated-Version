import { Link } from "react-router-dom";
import { ShieldAlert } from "lucide-react";

// Shown in place of a page the signed-in user has no page access for.
export default function PermissionDenied({ homeHref = null, homeLabel = "" }) {
  return (
    <div className="flex h-full flex-1 flex-col items-center justify-center p-8">
      <div className="w-full max-w-md rounded-lg border bg-card p-8 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
          <ShieldAlert className="h-8 w-8 text-destructive" aria-hidden="true" />
        </div>
        <h2 className="mb-2 text-lg font-semibold text-foreground">Permission Denied</h2>
        <p className="text-sm text-muted-foreground">
          You do not have access to this page. Ask an administrator to enable it for your account.
        </p>
        {homeHref && (
          <Link
            to={homeHref}
            className="mt-5 inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go to {homeLabel || "your first page"}
          </Link>
        )}
      </div>
    </div>
  );
}
