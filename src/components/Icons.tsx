// Small stroke icon set drawn for Afaire. Inline SVG keeps them themable via currentColor and CSP-safe.
type IconProps = { className?: string };
function Svg({ className = "size-5", children }: IconProps & { children: React.ReactNode }) {
  return <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className}>{children}</svg>;
}
export const TodayIcon = (p: IconProps) => <Svg {...p}><rect x="3.5" y="5" width="17" height="15" rx="3" /><path d="M3.5 9.5h17M8 3v4M16 3v4" /><rect x="8" y="12.5" width="4" height="4" rx="1" fill="currentColor" /></Svg>;
export const WeekIcon = (p: IconProps) => <Svg {...p}><rect x="3.5" y="4.5" width="17" height="15" rx="3" /><path d="M3.5 9h17M9.2 9v10.5M14.8 9v10.5" /></Svg>;
export const HabitIcon = (p: IconProps) => <Svg {...p}><path d="m17 2.5 3 3-3 3" /><path d="M4 11.5v-1a5 5 0 0 1 5-5h11" /><path d="m7 21.5-3-3 3-3" /><path d="M20 12.5v1a5 5 0 0 1-5 5H4" /></Svg>;
export const InboxIcon = (p: IconProps) => <Svg {...p}><path d="M3.5 13.5 6 5.5h12l2.5 8" /><path d="M3.5 13.5V18a1.5 1.5 0 0 0 1.5 1.5h14a1.5 1.5 0 0 0 1.5-1.5v-4.5h-5a3.5 3.5 0 0 1-7 0z" /></Svg>;
export const ReviewIcon = (p: IconProps) => <Svg {...p}><path d="M3.5 19.5h17" /><path d="m4.5 15 4.5-4.5 3.5 3.5 7-7" /><path d="M15 7h4.5v4.5" /></Svg>;
export const SettingsIcon = (p: IconProps) => <Svg {...p}><path d="M4 7h9M17 7h3M4 17h3M11 17h9" /><circle cx="15" cy="7" r="2" /><circle cx="9" cy="17" r="2" /></Svg>;
export const SunIcon = (p: IconProps) => <Svg {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" /></Svg>;
export const MoonIcon = (p: IconProps) => <Svg {...p}><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" /></Svg>;
export const DeviceIcon = (p: IconProps) => <Svg {...p}><rect x="3" y="4.5" width="18" height="12" rx="2" /><path d="M8.5 20h7M12 16.5V20" /></Svg>;
export const DownloadIcon = (p: IconProps) => <Svg {...p}><path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14" /></Svg>;
export const ShareIcon = (p: IconProps) => <Svg {...p}><path d="M12 15V3.5M8 7.5l4-4 4 4" /><path d="M7 11H5.5v9h13v-9H17" /></Svg>;
export const CloseIcon = (p: IconProps) => <Svg {...p}><path d="M6 6l12 12M18 6 6 18" /></Svg>;
export const ChevronLeftIcon = (p: IconProps) => <Svg {...p}><path d="m14.5 6-6 6 6 6" /></Svg>;
export const ChevronRightIcon = (p: IconProps) => <Svg {...p}><path d="m9.5 6 6 6-6 6" /></Svg>;
export const RefreshIcon = (p: IconProps) => <Svg {...p}><path d="M20 11a8 8 0 0 0-14.5-4.5L4 8M4 4v4h4M4 13a8 8 0 0 0 14.5 4.5L20 16M20 20v-4h-4" /></Svg>;
export const SparkIcon = (p: IconProps) => <Svg {...p}><path d="M12 3.5c.6 4.3 2.2 5.9 6.5 6.5-4.3.6-5.9 2.2-6.5 6.5-.6-4.3-2.2-5.9-6.5-6.5 4.3-.6 5.9-2.2 6.5-6.5z" /><path d="M18.5 16.5c.2 1.5.8 2.1 2.3 2.3-1.5.2-2.1.8-2.3 2.3-.2-1.5-.8-2.1-2.3-2.3 1.5-.2 2.1-.8 2.3-2.3z" /></Svg>;
export const CheckIcon = (p: IconProps) => <Svg {...p}><path d="m5 12.5 4.5 4.5L19 7.5" /></Svg>;
export const OfflineIcon = (p: IconProps) => <Svg {...p}><path d="M3 3l18 18M8.5 16a5 5 0 0 1 7 0M5 12.5a10 10 0 0 1 4.2-2.4M19 12.5a10 10 0 0 0-2.7-1.9M2 9a15 15 0 0 1 4.3-2.7M22 9a15 15 0 0 0-11-3.9M12 19.5h.01" /></Svg>;
export const LogoutIcon = (p: IconProps) => <Svg {...p}><path d="M14 4.5h4a1.5 1.5 0 0 1 1.5 1.5v12a1.5 1.5 0 0 1-1.5 1.5h-4M10 16.5 5.5 12 10 7.5M5.5 12H15" /></Svg>;
export const MoreIcon = (p: IconProps) => <Svg {...p}><rect x="4" y="4" width="6.5" height="6.5" rx="1.5" /><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" /><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" /><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" /></Svg>;
export const PlusIcon = (p: IconProps) => <Svg {...p}><path d="M12 5v14M5 12h14" /></Svg>;
export const KeyIcon = (p: IconProps) => <Svg {...p}><circle cx="8" cy="15" r="4" /><path d="m11 12 8.5-8.5M16.5 6.5l2.5 2.5M14.5 8.5l2 2" /></Svg>;

// Impulso: the A and check share the silhouette used by the PWA icons.
export function BrandMark({ className = "size-9" }: IconProps) {
  return <span aria-hidden="true" className={`brand-mark grid shrink-0 place-items-center overflow-hidden rounded-[22%] ${className}`}>
    <svg viewBox="0 0 512 512" className="size-full" fill="currentColor"><g transform="translate(-77 -76) scale(1.3)"><path d="m107 365 112-228q13-26 37-26t37 26l112 228h-79l-70-151-70 151z" /><path d="m196 345 49 43 106-117" fill="none" stroke="#ffe27a" strokeWidth="38" strokeLinecap="round" strokeLinejoin="round" /></g></svg>
  </span>;
}
