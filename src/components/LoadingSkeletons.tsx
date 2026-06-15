import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function TableSkeletonRows({ columns, rows = 6 }: { columns: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, row) => (
        <tr key={row} className="border-b">
          {Array.from({ length: columns }).map((__, col) => (
            <td key={col} className="px-3 py-3">
              <Skeleton className="h-4 w-full max-w-[160px]" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

export function MobileCardSkeletons({ rows = 4 }: { rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <Card key={i} className="rounded-[18px] p-3 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-5 w-20 rounded-full" />
          </div>
          <Skeleton className="mb-2 h-5 w-3/4" />
          <Skeleton className="mb-2 h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </Card>
      ))}
    </>
  );
}

export function KanbanSkeleton({ columns = 5 }: { columns?: number }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {Array.from({ length: columns }).map((_, col) => (
        <Card key={col} className="min-h-[180px] bg-muted/30 p-2">
          <div className="mb-3 flex items-center justify-between">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-5 w-7 rounded-full" />
          </div>
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((__, row) => (
              <div key={row} className="rounded-md border bg-card p-2">
                <Skeleton className="mb-2 h-3 w-16" />
                <Skeleton className="mb-2 h-4 w-3/4" />
                <Skeleton className="h-3 w-full" />
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}
