import { forwardRef, useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { formatDecimalForInput, parseDecimal } from "@/lib/data";

type InputProps = React.ComponentProps<typeof Input>;

interface DecimalInputProps extends Omit<InputProps, "value" | "onChange" | "type" | "inputMode"> {
  value: number;
  onChange: (value: number) => void;
}

/**
 * Numeric input that accepts BOTH "," and "." as decimal separators.
 *
 * Why not `<Input type="number">`:
 *   * In PT-locale browsers it sometimes accepts "," but exposes it
 *     on `e.target.value` as either the parsed number with "." or as
 *     the empty string mid-typing — which makes incremental input
 *     impossible to handle cleanly.
 *   * In US-locale browsers it rejects "," outright. PT users get a
 *     silently-broken field with no feedback.
 *
 * We use `type="text"` + `inputMode="decimal"` so:
 *   * Mobile keyboards still show the numeric pad.
 *   * The browser never munges or rejects the typed character.
 *   * We control parsing via `parseDecimal()` which understands both
 *     separators.
 *
 * The internal `draft` state preserves whatever the user typed (so a
 * trailing "," from "12," doesn't get swallowed mid-entry), while the
 * exported `onChange` always reports a clean number to the parent —
 * the parent never has to know about the comma/dot distinction.
 */
export const DecimalInput = forwardRef<HTMLInputElement, DecimalInputProps>(
  function DecimalInput({ value, onChange, ...rest }, ref) {
    const [draft, setDraft] = useState<string>(() => formatDecimalForInput(value));

    // Sync the draft when the external value changes (e.g. parent form
    // reset, service selection auto-fills the price, etc.). We skip the
    // sync when the draft already parses to the same number — otherwise
    // a presentational variation like "12," (mid-typing) would be
    // clobbered every render even though it represents the same value.
    useEffect(() => {
      if (parseDecimal(draft) !== value) {
        setDraft(formatDecimalForInput(value));
      }
      // We intentionally depend only on `value` — re-running on `draft`
      // changes would create a feedback loop with setDraft.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value]);

    return (
      <Input
        {...rest}
        ref={ref}
        type="text"
        inputMode="decimal"
        value={draft}
        onChange={(e) => {
          const raw = e.target.value;
          // Allow: optional leading "-", digits, at most one separator
          // (either "," or "."), optional trailing digits. Empty string
          // is allowed so the user can clear the field.
          if (raw !== "" && !/^-?\d*[.,]?\d*$/.test(raw)) return;
          setDraft(raw);
          onChange(parseDecimal(raw));
        }}
        onBlur={(e) => {
          // Normalize the draft to the canonical PT display on blur so
          // "12." becomes "12" and "12.5" becomes "12,5". Editing the
          // field again still accepts either separator.
          setDraft(formatDecimalForInput(value));
          rest.onBlur?.(e);
        }}
      />
    );
  },
);
