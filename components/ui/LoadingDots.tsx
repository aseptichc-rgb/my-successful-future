export default function LoadingDots() {
  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5">
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-black/40 [animation-delay:-0.3s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-black/40 [animation-delay:-0.15s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-black/40" />
    </div>
  );
}
