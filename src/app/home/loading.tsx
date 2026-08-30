import { Skeleton } from "@/components/ui/skeleton";

export default function HomeLoading() {
  return (
    <div className="mx-auto w-full max-w-[880px] px-[clamp(20px,5vw,40px)] py-16" aria-hidden>
      <Skeleton className="h-11 w-52" />
      <Skeleton className="mt-[clamp(28px,5vh,48px)] h-3 w-32" />
      <Skeleton className="mt-[18px] h-40 w-full rounded-lg" />
      <Skeleton className="mt-[clamp(40px,7vh,72px)] h-3 w-32" />
      <Skeleton className="mt-[18px] h-32 w-full rounded-lg" />
    </div>
  );
}
