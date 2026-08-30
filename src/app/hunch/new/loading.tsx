import { Skeleton } from "@/components/ui/skeleton";

export default function NewHunchLoading() {
  return (
    <div aria-hidden>
      <Skeleton className="h-12 w-80" />
      <Skeleton className="mt-[26px] h-40 w-full rounded-lg" />
      <Skeleton className="mt-5 h-11 w-44" />
    </div>
  );
}
