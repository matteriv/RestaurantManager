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
    const [imageError, setImageError] = React.useState(false)
    
    const { data: logoSettings, isLoading, error } = useQuery<LogoSettings>({
      queryKey: ['/api/settings/logo'],
      staleTime: 5 * 60 * 1000, // 5 minutes
      refetchOnWindowFocus: false,
    })

    // Reset image error when logo settings change
    React.useEffect(() => {
      setImageError(false)
    }, [logoSettings?.logo_url])

    const handleImageError = React.useCallback(() => {
      setImageError(true)
    }, [])

    const shouldShowLogo = React.useMemo(() => {
      return (
        !isLoading &&
        !error &&
        logoSettings?.logo_enabled &&
        logoSettings?.logo_url &&
        !imageError
      )
    }, [isLoading, error, logoSettings?.logo_enabled, logoSettings?.logo_url, imageError])

    const altText = React.useMemo(() => {
      return logoSettings?.logo_name || "Logo ristorante"
    }, [logoSettings?.logo_name])

    if (shouldShowLogo && logoSettings?.logo_url) {
      return (
        <div 
          ref={ref} 
          className={cn("inline-flex items-center justify-center", className)} 
          {...props}
          data-testid={`logo-${variant}`}
        >
          <img
            src={logoSettings.logo_url}
            alt={altText}
            className={cn(logoVariants({ variant }))}
            onError={handleImageError}
            loading="lazy"
            decoding="async"
            data-testid={`logo-image-${variant}`}
          />
        </div>
      )
    }

    // Fallback component
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