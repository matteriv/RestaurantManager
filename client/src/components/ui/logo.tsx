import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { useQuery } from "@tanstack/react-query"
import { cn } from "@/lib/utils"
import type { LogoSettings } from "@shared/schema"

const logoVariants = cva(
  "object-contain transition-opacity duration-200",
  {
    variants: {
      variant: {
        pos: "h-12",
        kitchen: "h-16", 
        delivery: "h-10",
        customer: "h-14",
        admin: "h-8",
      },
    },
    defaultVariants: {
      variant: "pos",
    },
  }
)

const fallbackVariants = cva(
  "font-semibold text-foreground select-none flex items-center justify-center",
  {
    variants: {
      variant: {
        pos: "h-12 text-lg",
        kitchen: "h-16 text-xl", 
        delivery: "h-10 text-base",
        customer: "h-14 text-lg",
        admin: "h-8 text-sm",
      },
    },
    defaultVariants: {
      variant: "pos",
    },
  }
)

export interface LogoProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof logoVariants> {
  fallback?: React.ReactNode
}

const Logo = React.forwardRef<HTMLDivElement, LogoProps>(
  ({ className, variant, fallback = "Sistema Ristorante", ...props }, ref) => {
    const { data: logoSettings, isLoading, error } = useQuery<LogoSettings>({
      queryKey: ['/api/settings/logo'],
      staleTime: 0,
      gcTime: 0,
      refetchOnMount: true,
    })

    // Always log the state
    console.log(`[Logo ${variant}] State:`, {
      isLoading,
      hasError: !!error,
      hasData: !!logoSettings,
      logoEnabled: logoSettings?.logo_enabled,
      logoUrl: logoSettings?.logo_url,
      logoName: logoSettings?.logo_name
    })

    // Show logo if we have data and it's enabled
    if (!isLoading && !error && logoSettings?.logo_enabled && logoSettings?.logo_url) {
      console.log(`[Logo ${variant}] Showing image:`, logoSettings.logo_url)
      return (
        <div 
          ref={ref} 
          className={cn("inline-flex items-center justify-center", className)} 
          {...props}
          data-testid={`logo-${variant}`}
        >
          <img
            src={logoSettings.logo_url}
            alt={logoSettings?.logo_name || "Logo ristorante"}
            className={cn(logoVariants({ variant }))}
            onError={() => console.log(`[Logo ${variant}] Image load error`)}
            data-testid={`logo-image-${variant}`}
          />
        </div>
      )
    }

    // Fallback component
    console.log(`[Logo ${variant}] Showing fallback`)
    return (
      <div
        ref={ref}
        className={cn(fallbackVariants({ variant }), className)}
        {...props}
        data-testid={`logo-fallback-${variant}`}
      >
        {isLoading ? (
          <div className={cn(logoVariants({ variant }), "animate-pulse bg-muted rounded")}>
            <span className="sr-only">Caricamento logo...</span>
          </div>
        ) : (
          fallback
        )}
      </div>
    )
  }
)
Logo.displayName = "Logo"

export { Logo, logoVariants, fallbackVariants }