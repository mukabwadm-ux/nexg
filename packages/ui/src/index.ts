/**
 * @nexg/ui — the NexG design system (spec section 2).
 *
 * Consumed as source: both apps list this package in `transpilePackages`, so
 * there is no build step and edits are picked up by the dev server directly.
 */

// Utilities
export { cn } from './lib/cn';
export { MAP_COLOURS, loadGoogleMaps, type MapsLoad } from './lib/google-maps';
export { CAPTCHA_FIELD, captchaSiteKey, getCaptchaToken, withCaptcha } from './lib/captcha';
/* Capabilities are imported from '@nexg/ui/capabilities', not from
   here. They read environment rather than rendering anything, and a
   barrel of components is the wrong door for that — `maps` is also
   exactly the kind of generic name `optimizePackageImports` mangles
   when it rewrites a re-export into a deep import. */
export {
  ACCEPTED_MIME_TYPES,
  compressImage,
  formatBytes,
  isImage,
  isPdf,
  MAX_FILE_BYTES,
  validateFile,
  type AcceptedMimeType,
} from './lib/file';
export {
  countryFor,
  DEFAULT_PHONE_COUNTRY,
  formatAsYouType,
  fromE164,
  normaliseNationalInput,
  PHONE_COUNTRIES,
  placeholderFor,
  toE164,
  type PhoneCountry,
} from './lib/phone';

// Primitives
export { Button, buttonVariants, type ButtonProps } from './components/button';
export { Spinner, type SpinnerProps } from './components/spinner';
export { Skeleton } from './components/skeleton';

// Form controls
export {
  controlClassName,
  describedBy,
  Field,
  useFieldIds,
  type FieldProps,
} from './components/field';
export { Input, type InputProps } from './components/input';
export { PhoneInput, type PhoneInputProps } from './components/phone-input';
export { Select, type SelectOption, type SelectProps } from './components/select';
export { ChipGroup, type ChipGroupProps, type ChipOption } from './components/chip-group';
export { FileDrop, type FileDropProps } from './components/file-drop';

// Display
export { Stepper, type Step, type StepperProps } from './components/stepper';
export {
  StatusBadge,
  statusBadgeVariants,
  STATUS_LABELS,
  STATUS_TONES,
  type StatusBadgeProps,
  type StatusKey,
} from './components/status-badge';
export { Tag, tagVariants, type TagProps } from './components/tag';
export { Switch, type SwitchProps } from './components/switch';
export {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardSkeleton,
  CardTitle,
  cardVariants,
  type CardProps,
} from './components/card';
export { KpiTile, VALUE_PLACEHOLDER, type KpiTileProps } from './components/kpi-tile';
export { EmptyState, type EmptyStateProps } from './components/empty-state';

// Overlays and in-place navigation (shadcn/ui on Radix)
export {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  type DropdownMenuItemProps,
} from './components/dropdown-menu';
export {
  Popover,
  PopoverAnchor,
  PopoverClose,
  PopoverContent,
  PopoverTrigger,
} from './components/popover';
export { Tabs, TabsContent, TabsList, TabsTrigger } from './components/tabs';
export { Progress, type ProgressProps } from './components/progress';
export {
  DateRangePicker,
  RangeCalendar,
  type DateRangePickerProps,
  type RangeCalendarProps,
} from './components/date-range-picker';
/* Plain helpers, callable from server components as well. */
export {
  addDays,
  DEFAULT_RANGE_PRESETS,
  formatDay,
  formatRange,
  todayInNairobi,
  type DateRange,
  type DateRangePreset,
} from './lib/date-range';

// Composite
export { DataTable, type ColumnDef, type DataTableProps } from './components/data-table';
export { TableViewport, type TableViewportProps } from './components/table-viewport';
export { DetailPanel, DetailRow, type DetailPanelProps } from './components/detail-panel';
export {
  Toast,
  ToastProvider,
  useToast,
  type ToastOptions,
  type ToastProps,
  type ToastTone,
} from './components/toast';
