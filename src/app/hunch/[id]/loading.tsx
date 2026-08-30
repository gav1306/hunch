import { Skeleton } from "@/components/ui/skeleton";

export default function HunchLoading() {
  return (
    <div aria-hidden>
      <Skeleton className="h-12 w-72" />
      <Skeleton className="mt-4 h-11 w-40" />
      <Skeleton className="mt-[26px] h-56 w-full rounded-lg" />
    </div>
  );
}
