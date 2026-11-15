// Sade, ince çizgili simgeler (SF Symbols havasında). Rengi çevreden alır.
const base = { width: '1em', height: '1em', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };
const mk = paths => function SvgIcon(props) { return <svg {...base} {...props}>{paths}</svg>; };

export const GearIcon = mk(<><circle cx="12" cy="12" r="3.2" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" /></>);
export const VideoIcon = mk(<><rect x="2.5" y="6" width="13" height="12" rx="3" /><path d="m15.5 10 6-3.2v10.4l-6-3.2" /></>);
export const VideoOffIcon = mk(<><path d="M3 3l18 18M15.5 15.5V18H5.5a3 3 0 0 1-3-3V9a3 3 0 0 1 2-2.8M9.5 6h3a3 3 0 0 1 3 3v1l6-3.2v10.4" /></>);
export const PhoneIcon = mk(<path d="M21.5 16.6v2.9a1.9 1.9 0 0 1-2.1 1.9A18.8 18.8 0 0 1 2.6 4.6 1.9 1.9 0 0 1 4.5 2.5h2.9a1.9 1.9 0 0 1 1.9 1.6c.1.9.4 1.8.7 2.6a1.9 1.9 0 0 1-.4 2L8.3 10a15 15 0 0 0 5.7 5.7l1.3-1.3a1.9 1.9 0 0 1 2-.4c.8.3 1.7.6 2.6.7a1.9 1.9 0 0 1 1.6 1.9Z" />);
export const HangIcon = mk(<path transform="rotate(135 12 12)" d="M21.5 16.6v2.9a1.9 1.9 0 0 1-2.1 1.9A18.8 18.8 0 0 1 2.6 4.6 1.9 1.9 0 0 1 4.5 2.5h2.9a1.9 1.9 0 0 1 1.9 1.6c.1.9.4 1.8.7 2.6a1.9 1.9 0 0 1-.4 2L8.3 10a15 15 0 0 0 5.7 5.7l1.3-1.3a1.9 1.9 0 0 1 2-.4c.8.3 1.7.6 2.6.7a1.9 1.9 0 0 1 1.6 1.9Z" />);
export const PlusIcon = mk(<path d="M12 5v14M5 12h14" />);
export const MicIcon = mk(<><rect x="9" y="2.5" width="6" height="12" rx="3" /><path d="M5 10.5a7 7 0 0 0 14 0M12 17.5v4" /></>);
export const MicOffIcon = mk(<path d="M3 3l18 18M9 9v1.5a3 3 0 0 0 5 2.2M15 9.4V5.5a3 3 0 0 0-5.9-.8M5 10.5a7 7 0 0 0 11.6 5.3M19 10.5a7 7 0 0 1-.5 2.6M12 17.5v4" />);
export const FlipIcon = mk(<><path d="M20 7h-3l-2-3H9L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2Z" /><path d="M9 13a3 3 0 0 1 5.2-2M15 13a3 3 0 0 1-5.2 2M14 9v2h2M10 17v-2H8" /></>);
export const ReplyIcon = mk(<path d="M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />);
export const PencilIcon = mk(<path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />);
export const CopyIcon = mk(<><rect x="9" y="9" width="12" height="12" rx="2.5" /><path d="M5 15H4.5A1.5 1.5 0 0 1 3 13.5v-9A1.5 1.5 0 0 1 4.5 3h9A1.5 1.5 0 0 1 15 4.5V5" /></>);
export const TrashIcon = mk(<path d="M3.5 6h17M8.5 6V4.5A1.5 1.5 0 0 1 10 3h4a1.5 1.5 0 0 1 1.5 1.5V6M18.5 6l-.8 13a2 2 0 0 1-2 2H8.3a2 2 0 0 1-2-2L5.5 6" />);
export const RetryIcon = mk(<path d="M3 12a9 9 0 0 1 15.5-6.3L21 8M21 3v5h-5M21 12a9 9 0 0 1-15.5 6.3L3 16M3 21v-5h5" />);
export const TimerIcon = mk(<><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 2M9 2.5h6" /></>);
export const PlayIcon = props => <svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" aria-hidden {...props}><path d="M8 5.5v13l10.5-6.5z" /></svg>;
export const LockIcon = mk(<><rect x="4.5" y="10.5" width="15" height="10.5" rx="2.5" /><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" /></>);
export const DownIcon = mk(<path d="M12 4v14M6 12l6 6 6-6" />);
export const UpIcon = mk(<path d="M12 20V6M6 12l6-6 6 6" />);
export const ClockIcon = mk(<><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>);
export const AlertIcon = mk(<><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.5M12 16.5v.3" /></>);
