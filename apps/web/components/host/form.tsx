/**
 * The host portal's form kit.
 *
 * Moved to `components/partner/form` when the merchant portal
 * needed the same pieces. Re-exported rather than relocated in
 * one go, because eleven host files import from here and a
 * rename across all of them is a change with no behaviour in
 * it — the kind that hides a real one in the diff.
 */
export {
  Actions,
  Area,
  ConfirmByName,
  Drawer,
  Field,
  Grid,
  Said,
  Select,
  Submit,
  Text,
  useAction,
  type Outcome,
} from '../partner/form';
