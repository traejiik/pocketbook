import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils"

const inputBase = "h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 text-base sm:text-[13.5px] transition-colors outline-hidden placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/60 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive dark:bg-input/30"

interface InputProps extends React.ComponentProps<"input"> {
  icon?: React.ReactNode
  suffix?: React.ReactNode
}

function Input({ className, type, icon, suffix, ...props }: InputProps) {
  if (!icon && !suffix) {
    return (
      <InputPrimitive
        type={type}
        data-slot="input"
        className={cn(inputBase, className)}
        {...props}
      />
    )
  }

  return (
    <div className="relative flex items-center">
      {icon && (
        <span className="absolute left-3 text-muted-foreground pointer-events-none">
          {icon}
        </span>
      )}
      <InputPrimitive
        type={type}
        data-slot="input"
        className={cn(inputBase, icon && 'pl-9', suffix && 'pr-12', className)}
        {...props}
      />
      {suffix && (
        <span className="absolute right-3 text-xs text-muted-foreground mono pointer-events-none">
          {suffix}
        </span>
      )}
    </div>
  )
}

export { Input }
