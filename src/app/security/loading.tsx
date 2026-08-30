import { Skeleton } from "@/components/ui/skeleton";

export default function SecurityLoading() {
  return (
    <div className="mx-auto w-full max-w-[880px] px-[clamp(20px,5vw,40px)] py-16" aria-hidden>
      <Skeleton className="h-11 w-56" />
      <Skeleton className="mt-8 h-40 w-full rounded-lg" />
      <Skeleton className="mt-6 h-40 w-full rounded-lg" />
    </div>
  );
}
