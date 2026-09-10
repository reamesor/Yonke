type WordmarkProps = {
  size?: "nav" | "hero";
  className?: string;
};

export function Wordmark({ size = "nav", className = "" }: WordmarkProps) {
  return (
    <span className={`hero-mark ${size === "nav" ? "hero-mark--nav" : ""} ${className}`} aria-label="Yonke">
      YONKE
    </span>
  );
}
