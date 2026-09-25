/**
 * @nexg/ui — the NexG design system (spec section 2).
 *
 * Consumed as source: both apps list this package in `transpilePackages`, so
 * there is no build step and edits are picked up by the dev server directly.
 */

// Utilities
export { cn } from './lib/cn';
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

// Composite
export { DataTable, type ColumnDef, type DataTableProps } from './components/data-table';
export { DetailPanel, DetailRow, type DetailPanelProps } from './components/detail-panel';
export {
  Toast,
  ToastProvider,
  useToast,
  type ToastOptions,
  type ToastProps,
  type ToastTone,
} from './components/toast';
