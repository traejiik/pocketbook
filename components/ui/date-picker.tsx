"use client"

import * as React from "react"
import dynamic from "next/dynamic"
import { CalendarIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { fmtDate } from "@/lib/format"
import { Skeleton } from "@/components/ui/skeleton"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

/**
 * `react-day-picker` bundles `date-fns` with it, and the pair is the largest
 * chunk in the app. The grid only renders once the popover is open, so it is
 * loaded on demand instead of riding along with every route that mounts the
 * global transaction sheet.
 */
const Calendar = dynamic(
  () => import("@/components/ui/calendar").then((m) => m.Calendar),
  { ssr: false, loading: () => <CalendarSkeleton /> },
)

/** Placeholder matching the calendar's footprint so the popover does not resize on load. */
function CalendarSkeleton() {
  return (
    <div className="w-fit bg-background p-2" aria-hidden>
      <Skeleton className="mx-auto h-7 w-32" />
      <div className="mt-4 grid grid-cols-7 gap-1">
        {Array.from({ length: 42 }, (_, i) => (
          <Skeleton key={i} className="size-7 rounded-[var(--radius-md)]" />
        ))}
      </div>
    </div>
  )
}

interface DatePickerProps {
  id?: string
  /** Calendar-only value as `YYYY-MM-DD`. */
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  "aria-invalid"?: boolean
  "aria-describedby"?: string
  "aria-labelledby"?: string
}

/** Parse a `YYYY-MM-DD` string into a local-midnight Date (no timezone shift). */
function toDate(value: string): Date | undefined {
  if (!value) return undefined
  const [y, m, d] = value.split("-").map(Number)
  if (!y || !m || !d) return undefined
  return new Date(y, m - 1, d)
}

/** Format a Date back to `YYYY-MM-DD` using local parts (matches @db.Date writes). */
function toValue(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

export function DatePicker({
  id,
  value,
  onChange,
  placeholder = "Pick a date",
  className,
  ...aria
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false)
  const selected = toDate(value)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        id={id}
        type="button"
        {...aria}
        className={cn(
          "flex h-9 w-full items-center gap-2 rounded-[10px] border border-input bg-transparent px-3 text-base sm:text-[13.5px] transition-colors outline-hidden focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/60 aria-invalid:border-destructive dark:bg-input/30",
          className,
        )}
      >
        <CalendarIcon className="size-4 shrink-0 text-muted-foreground" />
        <span className={cn("truncate", !selected && "text-muted-foreground")}>
          {selected ? fmtDate(selected) : placeholder}
        </span>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected}
          onSelect={(date) => {
            if (date) {
              onChange(toValue(date))
              setOpen(false)
            }
          }}
          autoFocus
        />
      </PopoverContent>
    </Popover>
  )
}
