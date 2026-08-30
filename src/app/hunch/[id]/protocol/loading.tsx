import { Skeleton } from "@/components/ui/skeleton";

export default function ProtocolLoading() {
  return (
    <div aria-hidden>
      <Skeleton className="h-12 w-64" />
      <Skeleton className="mt-[26px] h-24 w-full rounded-lg" />
      <Skeleton className="mt-5 h-48 w-full rounded-xl" />
    </div>
  );
}
