"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      duration={2000}
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          // v5: inverted pill (foreground bg, background text), no border.
          "--normal-bg": "hsl(var(--foreground))",
          "--normal-text": "hsl(var(--background))",
          "--normal-border": "transparent",
          "--success-bg": "hsl(var(--foreground))",
          "--success-text": "hsl(var(--background))",
          "--success-border": "transparent",
          "--error-bg": "hsl(var(--destructive))",
          "--error-text": "hsl(var(--destructive-foreground))",
          "--error-border": "transparent",
          "--border-radius": "9999px",
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
