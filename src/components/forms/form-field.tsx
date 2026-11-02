import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { FieldError } from "./field-error";

export function FormField({
  id,
  label,
  required,
  hint,
  errors,
  className,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  hint?: string;
  errors?: string[];
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id}>
        {label}
        {required && <span className="text-destructive" aria-hidden> *</span>}
      </Label>
      {children}
      {hint && !errors?.length && <p className="text-xs text-muted-foreground">{hint}</p>}
      <FieldError errors={errors} />
    </div>
  );
}

export function FormSection({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <fieldset className="grid gap-4 border-t pt-5 first-of-type:border-t-0 first-of-type:pt-0 sm:grid-cols-2">
      <legend className="sr-only">{title}</legend>
      <div className="sm:col-span-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      {children}
    </fieldset>
  );
}
