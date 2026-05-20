import * as React from "react";
import { X } from "lucide-react";
import * as SheetPrimitive from "@radix-ui/react-dialog";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";

interface ResponsiveDrawerProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  children: React.ReactNode;
  /** Tailwind max-width clase (desktop). Por defecto max-w-xl. */
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}

const SIZE_MAP = {
  sm: "sm:max-w-md",
  md: "sm:max-w-lg",
  lg: "sm:max-w-xl",
  xl: "sm:max-w-2xl",
};

/**
 * Drawer responsivo:
 * - Desktop: panel lateral derecho.
 * - Mobile: bottom sheet con altura ~92vh.
 *
 * Usalo con <ResponsiveDrawerHeader/>, <ResponsiveDrawerBody/>, <ResponsiveDrawerFooter/>.
 */
export function ResponsiveDrawer({ open, onOpenChange, children, size = "lg", className }: ResponsiveDrawerProps) {
  const isMobile = useIsMobile();

  return (
    <SheetPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <SheetPrimitive.Portal>
        <SheetPrimitive.Overlay
          className={cn(
            "fixed inset-0 z-50 bg-black/40 backdrop-blur-[1px]",
            "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
          )}
        />
        <SheetPrimitive.Content
          className={cn(
            "fixed z-50 flex flex-col bg-background shadow-2xl",
            "transition ease-in-out data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:duration-200 data-[state=open]:duration-300",
            isMobile
              ? [
                  "inset-x-0 bottom-0 h-[92vh] rounded-t-2xl border-t",
                  "data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
                ]
              : [
                  "inset-y-0 right-0 h-full w-full border-l",
                  SIZE_MAP[size],
                  "data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right",
                ],
            className,
          )}
        >
          {isMobile && (
            <div className="mx-auto mt-2 mb-1 h-1 w-12 rounded-full bg-muted-foreground/30 shrink-0" />
          )}
          <SheetPrimitive.Title className="sr-only">Panel</SheetPrimitive.Title>
          <SheetPrimitive.Description className="sr-only">Detalle</SheetPrimitive.Description>
          {children}
          <SheetPrimitive.Close className="absolute right-3 top-3 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring">
            <X className="h-4 w-4" />
            <span className="sr-only">Cerrar</span>
          </SheetPrimitive.Close>
        </SheetPrimitive.Content>
      </SheetPrimitive.Portal>
    </SheetPrimitive.Root>
  );
}

export function ResponsiveDrawerHeader({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "sticky top-0 z-10 shrink-0 border-b bg-background/95 backdrop-blur px-5 py-4 pr-12",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function ResponsiveDrawerBody({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("flex-1 overflow-y-auto px-5 py-4", className)}>{children}</div>;
}

export function ResponsiveDrawerFooter({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "sticky bottom-0 z-10 shrink-0 border-t bg-background/95 backdrop-blur px-5 py-3",
        "flex flex-wrap items-center justify-end gap-2",
        className,
      )}
    >
      {children}
    </div>
  );
}
