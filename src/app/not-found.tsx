import Link from "next/link";
import { PageBody } from "@/components/ui/page";
import { Panel, EmptyState, Button } from "@/components/ui/primitives";

export default function NotFound() {
  return (
    <PageBody className="max-w-2xl">
      <Panel className="mt-12">
        <EmptyState
          title="That record does not exist"
          description="The case, part number, document or quotation you asked for is not in this system. It may have been a mistyped reference."
          action={
            <div className="flex gap-2">
              <Link href="/inbox">
                <Button variant="primary">Go to the inbox</Button>
              </Link>
              <Link href="/catalog">
                <Button variant="secondary">Browse the catalog</Button>
              </Link>
            </div>
          }
        />
      </Panel>
    </PageBody>
  );
}
