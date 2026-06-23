import { forwardRef, useEffect, useState } from "react";
import { Input } from "@/components/ui/input";

type InputProps = React.ComponentPropsWithoutRef<typeof Input>;

interface DecimalInputProps extends Omit<InputProps, "value" | "onChange" | "type"> {
  /** Valor numérico atual (fonte da verdade para somas). */
  value: number;
  /** Recebe o número já parseado a cada digitação. */
  onValueChange: (value: number) => void;
  /** Permite casas decimais (preço). Para quantidade inteira, passar false. */
  allowDecimal?: boolean;
  min?: number;
  max?: number;
}

/**
 * Input numérico tolerante a mobile/pt-BR:
 *  - aceita vírgula OU ponto como separador decimal;
 *  - não prende o "0" na frente (campo zerado aparece vazio com placeholder);
 *  - não apaga o que foi digitado ao inserir o separador;
 *  - mantém a digitação parcial ("1," / "0.") sem resetar.
 * A fonte da verdade continua sendo um number (não quebra as somas).
 */
export const DecimalInput = forwardRef<HTMLInputElement, DecimalInputProps>(
  ({ value, onValueChange, allowDecimal = true, min, max, ...props }, ref) => {
    const [focused, setFocused] = useState(false);
    const fromValue = (v: number) => (v ? (allowDecimal ? String(v).replace(".", ",") : String(v)) : "");
    const [text, setText] = useState<string>(() => fromValue(value));

    // Reflete mudanças externas (autofill ao escolher produto, reset, edição)
    // sem atropelar o que o usuário está digitando.
    useEffect(() => {
      if (!focused) setText(fromValue(value));
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value, focused]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      let raw = e.target.value;
      if (allowDecimal) {
        // mantém dígitos e apenas o primeiro separador (vírgula ou ponto)
        raw = raw.replace(/[^0-9.,]/g, "");
        const sep = raw.search(/[.,]/);
        if (sep !== -1) {
          raw = raw.slice(0, sep + 1) + raw.slice(sep + 1).replace(/[.,]/g, "");
        }
      } else {
        raw = raw.replace(/[^0-9]/g, "");
      }
      setText(raw);

      const norm = raw.replace(",", ".");
      let n = norm === "" || norm === "." ? 0 : parseFloat(norm);
      if (isNaN(n)) n = 0;
      if (min != null) n = Math.max(min, n);
      if (max != null) n = Math.min(max, n);
      onValueChange(n);
    };

    return (
      <Input
        {...props}
        ref={ref}
        type="text"
        inputMode={allowDecimal ? "decimal" : "numeric"}
        value={text}
        onFocus={(e) => { setFocused(true); props.onFocus?.(e); }}
        onBlur={(e) => { setFocused(false); setText(fromValue(value)); props.onBlur?.(e); }}
        onChange={handleChange}
      />
    );
  },
);
DecimalInput.displayName = "DecimalInput";
