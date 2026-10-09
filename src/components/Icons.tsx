// Small stroke icon set drawn for Afaire. Inline SVG keeps them themable via currentColor and CSP-safe.
type IconProps = { className?: string };
function Svg({ className = "size-5", children }: IconProps & { children: React.ReactNode }) {
  return <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className}>{children}</svg>;
}
export const TodayIcon = (p: IconProps) => <Svg {...p}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></Svg>;
export const WeekIcon = (p: IconProps) => <Svg {...p}><rect x="3.5" y="5" width="17" height="15" rx="3" /><path d="M3.5 9.5h17M8 3v4M16 3v4M8 13.5h.01M12 13.5h.01M16 13.5h.01M8 16.5h.01M12 16.5h.01" /></Svg>;
export const HabitIcon = (p: IconProps) => <Svg {...p}><path d="M20 12a8 8 0 1 1-2.34-5.66" /><path d="M20 4v4h-4" /><path d="m8.5 12 2.5 2.5 4.5-5" /></Svg>;
export const InboxIcon = (p: IconProps) => <Svg {...p}><path d="M3.5 13.5 6 5.5h12l2.5 8" /><path d="M3.5 13.5V18a1.5 1.5 0 0 0 1.5 1.5h14a1.5 1.5 0 0 0 1.5-1.5v-4.5h-5a3.5 3.5 0 0 1-7 0z" /></Svg>;
export const ReviewIcon = (p: IconProps) => <Svg {...p}><path d="M4 19.5h16" /><path d="M7 16V11M12 16V6.5M17 16v-3" /></Svg>;
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
export const KeyIcon = (p: IconProps) => <Svg {...p}><circle cx="8" cy="15" r="4" /><path d="m11 12 8.5-8.5M16.5 6.5l2.5 2.5M14.5 8.5l2 2" /></Svg>;

export function BrandMark({ className = "size-9" }: IconProps) {
  return <span aria-hidden="true" className={`grid shrink-0 place-items-center rounded-[30%] bg-sage text-white ${className}`}>
    <svg viewBox="140 117 280 280" className="size-[62%]" fill="currentColor"><path d="M174 218c6-48 37-76 84-76 61 0 86 33 86 88v130h-42v-22c-16 19-37 29-65 29-43 0-73-27-73-64 0-46 40-70 108-70h29v-7c0-31-15-46-43-46-26 0-41 13-45 38zm127 51h-25c-42 0-68 11-68 32 0 19 13 31 36 31 32 0 57-21 57-54z" /><circle cx="380" cy="346" r="20" /></svg>
  </span>;
}
