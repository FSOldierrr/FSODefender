import { useId } from "react";

export function Logo({
  size = 36,
  className,
}: {
  size?: number;
  className?: string;
}) {
  const gradientId = `fsod-logo-${useId().replace(/[:]/g, "")}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient
          id={gradientId}
          x1="8"
          y1="4"
          x2="40"
          y2="44"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#5EF2B2" />
          <stop offset="1" stopColor="#12A5C9" />
        </linearGradient>
      </defs>
      <path
        d="M24 3.5 41.5 9v12.7c0 10.8-7.1 19.2-17.5 22.8C13.6 40.9 6.5 32.5 6.5 21.7V9L24 3.5Z"
        fill={`url(#${gradientId})`}
      />
      <path
        d="M24 8.2 37 12.4v9.3c0 8.3-5.3 14.9-13 18-7.7-3.1-13-9.7-13-18v-9.3L24 8.2Z"
        fill="#07120F"
        fillOpacity=".86"
      />
      <path
        d="m17.2 23.7 4.7 4.7 9-9.6"
        stroke="#5EF2B2"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
