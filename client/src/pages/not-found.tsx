import { Link } from "wouter";
import { CircleDashed } from "lucide-react";
import { EmptyState } from "@/components/app-ui";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="surface mx-auto mt-6 max-w-lg">
      <EmptyState
        icon={CircleDashed}
        title="Page not found"
        description="This page doesn't exist. It may have moved, or the link is wrong."
        action={
          <Link href="/" className={buttonVariants({ variant: "outline", size: "sm" })}>
            Back to today
          </Link>
        }
      />
    </div>
  );
}
