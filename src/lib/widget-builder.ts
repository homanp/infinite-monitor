import * as esbuild from "esbuild";
import * as path from "path";
import * as fs from "fs";
import {
  getWidgetFiles,
  setWidgetFiles,
  getWidget,
  upsertWidget,
} from "@/db/widgets";

// ── Config ──

const DIST_DIR = path.join(process.cwd(), "data", "widgets-dist");

const EXTERNAL_PACKAGES = [
  "react",
  "react-dom",
  "react-dom/client",
  "react/jsx-runtime",
  "react/jsx-dev-runtime",
  "recharts",
  "date-fns",
  "maplibre-gl",
  "framer-motion",
  "motion",
  "lucide-react",
  "@tanstack/react-query",
  "class-variance-authority",
  "clsx",
  "tailwind-merge",
  "@radix-ui/react-slot",
  "@radix-ui/react-separator",
  "@radix-ui/react-scroll-area",
  "@radix-ui/react-tabs",
  "@radix-ui/react-dialog",
  "@radix-ui/react-dropdown-menu",
  "@radix-ui/react-popover",
  "@radix-ui/react-tooltip",
  "@radix-ui/react-toggle",
  "@radix-ui/react-toggle-group",
  "@radix-ui/react-avatar",
  "@radix-ui/react-checkbox",
  "@radix-ui/react-radio-group",
  "@radix-ui/react-select",
  "@radix-ui/react-slider",
  "@radix-ui/react-switch",
  "@radix-ui/react-label",
  "@radix-ui/react-progress",
  "@radix-ui/react-accordion",
  "@radix-ui/react-collapsible",
  "@radix-ui/react-context-menu",
  "@radix-ui/react-hover-card",
  "@radix-ui/react-menubar",
  "@radix-ui/react-navigation-menu",
  "@radix-ui/react-alert-dialog",
  "@radix-ui/react-aspect-ratio",
  "@radix-ui/react-compose-refs",
  "@radix-ui/react-use-controllable-state",
];

const IMPORT_MAP: Record<string, string> = {
  "react": "https://esm.sh/react@18.3.1",
  "react/jsx-runtime": "https://esm.sh/react@18.3.1/jsx-runtime",
  "react/jsx-dev-runtime": "https://esm.sh/react@18.3.1/jsx-dev-runtime",
  "react-dom": "https://esm.sh/react-dom@18.3.1?external=react",
  "react-dom/client": "https://esm.sh/react-dom@18.3.1/client?external=react",
  "recharts": "https://esm.sh/recharts@2.15.0?external=react,react-dom",
  "date-fns": "https://esm.sh/date-fns@4.1.0",
  "maplibre-gl": "https://esm.sh/maplibre-gl@4.7.0",
  "framer-motion": "https://esm.sh/framer-motion@11.0.0?external=react,react-dom",
  "motion": "https://esm.sh/framer-motion@11.0.0?external=react,react-dom",
  "lucide-react": "https://esm.sh/lucide-react@0.400.0?external=react",
  "@tanstack/react-query": "https://esm.sh/@tanstack/react-query@5.0.0?external=react",
  "class-variance-authority": "https://esm.sh/class-variance-authority@0.7.1",
  "clsx": "https://esm.sh/clsx@2.1.1",
  "tailwind-merge": "https://esm.sh/tailwind-merge@2.5.2",
  "@radix-ui/react-slot": "https://esm.sh/@radix-ui/react-slot?external=react,react-dom",
  "@radix-ui/react-separator": "https://esm.sh/@radix-ui/react-separator?external=react,react-dom",
  "@radix-ui/react-scroll-area": "https://esm.sh/@radix-ui/react-scroll-area?external=react,react-dom",
  "@radix-ui/react-tabs": "https://esm.sh/@radix-ui/react-tabs?external=react,react-dom",
  "@radix-ui/react-dialog": "https://esm.sh/@radix-ui/react-dialog?external=react,react-dom",
  "@radix-ui/react-dropdown-menu": "https://esm.sh/@radix-ui/react-dropdown-menu?external=react,react-dom",
  "@radix-ui/react-popover": "https://esm.sh/@radix-ui/react-popover?external=react,react-dom",
  "@radix-ui/react-tooltip": "https://esm.sh/@radix-ui/react-tooltip?external=react,react-dom",
  "@radix-ui/react-toggle": "https://esm.sh/@radix-ui/react-toggle?external=react,react-dom",
  "@radix-ui/react-toggle-group": "https://esm.sh/@radix-ui/react-toggle-group?external=react,react-dom",
  "@radix-ui/react-avatar": "https://esm.sh/@radix-ui/react-avatar?external=react,react-dom",
  "@radix-ui/react-checkbox": "https://esm.sh/@radix-ui/react-checkbox?external=react,react-dom",
  "@radix-ui/react-radio-group": "https://esm.sh/@radix-ui/react-radio-group?external=react,react-dom",
  "@radix-ui/react-select": "https://esm.sh/@radix-ui/react-select?external=react,react-dom",
  "@radix-ui/react-slider": "https://esm.sh/@radix-ui/react-slider?external=react,react-dom",
  "@radix-ui/react-switch": "https://esm.sh/@radix-ui/react-switch?external=react,react-dom",
  "@radix-ui/react-label": "https://esm.sh/@radix-ui/react-label?external=react,react-dom",
  "@radix-ui/react-progress": "https://esm.sh/@radix-ui/react-progress?external=react,react-dom",
  "@radix-ui/react-accordion": "https://esm.sh/@radix-ui/react-accordion?external=react,react-dom",
  "@radix-ui/react-collapsible": "https://esm.sh/@radix-ui/react-collapsible?external=react,react-dom",
  "@radix-ui/react-context-menu": "https://esm.sh/@radix-ui/react-context-menu?external=react,react-dom",
  "@radix-ui/react-hover-card": "https://esm.sh/@radix-ui/react-hover-card?external=react,react-dom",
  "@radix-ui/react-menubar": "https://esm.sh/@radix-ui/react-menubar?external=react,react-dom",
  "@radix-ui/react-navigation-menu": "https://esm.sh/@radix-ui/react-navigation-menu?external=react,react-dom",
  "@radix-ui/react-alert-dialog": "https://esm.sh/@radix-ui/react-alert-dialog?external=react,react-dom",
  "@radix-ui/react-aspect-ratio": "https://esm.sh/@radix-ui/react-aspect-ratio?external=react,react-dom",
  "@radix-ui/react-compose-refs": "https://esm.sh/@radix-ui/react-compose-refs?external=react",
  "@radix-ui/react-use-controllable-state": "https://esm.sh/@radix-ui/react-use-controllable-state?external=react",
};

// ── Types ──

interface WidgetStatus {
  status: "building" | "ready" | "error";
  error?: string;
}

// ── Build state ──

const buildLocks = new Map<string, Promise<void>>();
const widgetStatuses = new Map<string, WidgetStatus & { startedAt?: number }>();

// ── Security ──

const VALID_PACKAGE_RE = /^(@[\w.-]+\/)?[\w.-]+(@[\w.^~>=<| -]+)?$/;

export function sanitizePath(relativePath: string): string {
  const normalized = relativePath.replace(/\\/g, "/");
  if (normalized.startsWith("/") || normalized.includes("..")) {
    throw new Error(`Invalid path: ${relativePath}`);
  }
  if (!normalized.startsWith("src/")) {
    throw new Error(`Path must be under src/: ${relativePath}`);
  }
  return normalized;
}

export function validatePackages(packages: string[]): void {
  for (const pkg of packages) {
    if (!VALID_PACKAGE_RE.test(pkg)) {
      throw new Error(`Invalid package name: ${pkg}`);
    }
  }
}

// ── File operations (SQLite-backed) ──

export async function writeWidgetFile(
  widgetId: string,
  relativePath: string,
  content: string,
): Promise<void> {
  const safePath = sanitizePath(relativePath);
  const files = getWidgetFiles(widgetId);
  files[safePath] = content;

  const existing = getWidget(widgetId);
  if (existing) {
    setWidgetFiles(widgetId, files);
  } else {
    upsertWidget({
      id: widgetId,
      code: safePath === "src/App.tsx" ? content : null,
      filesJson: JSON.stringify(files),
    });
  }
}

export async function readWidgetFile(
  widgetId: string,
  relativePath: string,
): Promise<string | null> {
  const safePath = sanitizePath(relativePath);
  const files = getWidgetFiles(widgetId);
  return files[safePath] ?? null;
}

export async function listWidgetFiles(widgetId: string): Promise<string[]> {
  return Object.keys(getWidgetFiles(widgetId)).sort();
}

export async function deleteWidgetFile(
  widgetId: string,
  relativePath: string,
): Promise<void> {
  const safePath = sanitizePath(relativePath);
  if (safePath === "src/App.tsx") {
    throw new Error("Cannot delete the entry point App.tsx");
  }
  const files = getWidgetFiles(widgetId);
  delete files[safePath];
  setWidgetFiles(widgetId, files);
}

// ── Dependencies (stored in files map as deps.json) ──

export async function addWidgetDependencies(
  widgetId: string,
  packages: string[],
): Promise<string[]> {
  validatePackages(packages);
  const files = getWidgetFiles(widgetId);
  let existing: string[] = [];
  try {
    if (files["deps.json"]) {
      existing = JSON.parse(files["deps.json"]);
    }
  } catch {
    // ignore
  }
  const merged = [...new Set([...existing, ...packages])];
  files["deps.json"] = JSON.stringify(merged);
  setWidgetFiles(widgetId, files);
  return merged;
}

// ── shadcn/ui base components (virtual) ──

const SHADCN_UTILS = `import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
export function cn(...inputs) { return twMerge(clsx(inputs)); }`;

const SHADCN_BUTTON = `import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "@/lib/utils";

function buttonVariants({ variant = "default", size = "default", className = "" } = {}) {
  const base = "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0";
  const variants = {
    default: "bg-primary text-primary-foreground shadow hover:bg-primary/90",
    destructive: "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
    outline: "border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground",
    secondary: "bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80",
    ghost: "hover:bg-accent hover:text-accent-foreground",
    link: "text-primary underline-offset-4 hover:underline",
  };
  const sizes = {
    default: "h-9 px-4 py-2",
    sm: "h-8 rounded-md px-3 text-xs",
    lg: "h-10 rounded-md px-8",
    icon: "h-9 w-9",
  };
  return cn(base, variants[variant] || variants.default, sizes[size] || sizes.default, className);
}

const Button = React.forwardRef(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : "button";
  return React.createElement(Comp, { className: buttonVariants({ variant, size, className }), ref, ...props });
});
Button.displayName = "Button";
export { Button, buttonVariants };`;

const SHADCN_CARD = `import * as React from "react";
import { cn } from "@/lib/utils";

const Card = React.forwardRef(({ className, ...props }, ref) =>
  React.createElement("div", { ref, className: cn("rounded-xl border bg-card text-card-foreground shadow", className), ...props }));
Card.displayName = "Card";

const CardHeader = React.forwardRef(({ className, ...props }, ref) =>
  React.createElement("div", { ref, className: cn("flex flex-col space-y-1.5 p-6", className), ...props }));
CardHeader.displayName = "CardHeader";

const CardTitle = React.forwardRef(({ className, ...props }, ref) =>
  React.createElement("div", { ref, className: cn("font-semibold leading-none tracking-tight", className), ...props }));
CardTitle.displayName = "CardTitle";

const CardDescription = React.forwardRef(({ className, ...props }, ref) =>
  React.createElement("div", { ref, className: cn("text-sm text-muted-foreground", className), ...props }));
CardDescription.displayName = "CardDescription";

const CardContent = React.forwardRef(({ className, ...props }, ref) =>
  React.createElement("div", { ref, className: cn("p-6 pt-0", className), ...props }));
CardContent.displayName = "CardContent";

const CardFooter = React.forwardRef(({ className, ...props }, ref) =>
  React.createElement("div", { ref, className: cn("flex items-center p-6 pt-0", className), ...props }));
CardFooter.displayName = "CardFooter";

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter };`;

const SHADCN_BADGE = `import * as React from "react";
import { cn } from "@/lib/utils";

function badgeVariants({ variant = "default", className = "" } = {}) {
  const base = "inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2";
  const variants = {
    default: "border-transparent bg-primary text-primary-foreground shadow hover:bg-primary/80",
    secondary: "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
    destructive: "border-transparent bg-destructive text-destructive-foreground shadow hover:bg-destructive/80",
    outline: "text-foreground",
  };
  return cn(base, variants[variant] || variants.default, className);
}

function Badge({ className, variant, ...props }) {
  return React.createElement("div", { className: badgeVariants({ variant, className }), ...props });
}
export { Badge, badgeVariants };`;

const SHADCN_INPUT = `import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef(({ className, type, ...props }, ref) =>
  React.createElement("input", {
    type,
    className: cn("flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm", className),
    ref,
    ...props,
  }));
Input.displayName = "Input";
export { Input };`;

const SHADCN_TEXTAREA = `import * as React from "react";
import { cn } from "@/lib/utils";

const Textarea = React.forwardRef(({ className, ...props }, ref) =>
  React.createElement("textarea", {
    className: cn("flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm", className),
    ref,
    ...props,
  }));
Textarea.displayName = "Textarea";
export { Textarea };`;

const SHADCN_SEPARATOR = `import * as React from "react";
import * as SeparatorPrimitive from "@radix-ui/react-separator";
import { cn } from "@/lib/utils";

const Separator = React.forwardRef(({ className, orientation = "horizontal", decorative = true, ...props }, ref) =>
  React.createElement(SeparatorPrimitive.Root, {
    ref, decorative, orientation,
    className: cn("shrink-0 bg-border", orientation === "horizontal" ? "h-[1px] w-full" : "h-full w-[1px]", className),
    ...props,
  }));
Separator.displayName = SeparatorPrimitive.Root.displayName;
export { Separator };`;

const SHADCN_SKELETON = `import * as React from "react";
import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }) {
  return React.createElement("div", { className: cn("animate-pulse rounded-md bg-primary/10", className), ...props });
}
export { Skeleton };`;

const SHADCN_PROGRESS = `import * as React from "react";
import * as ProgressPrimitive from "@radix-ui/react-progress";
import { cn } from "@/lib/utils";

const Progress = React.forwardRef(({ className, value, ...props }, ref) =>
  React.createElement(ProgressPrimitive.Root, {
    ref,
    className: cn("relative h-2 w-full overflow-hidden rounded-full bg-primary/20", className),
    ...props,
  }, React.createElement(ProgressPrimitive.Indicator, {
    className: "h-full w-full flex-1 bg-primary transition-all",
    style: { transform: \`translateX(-\${100 - (value || 0)}%)\` },
  })));
Progress.displayName = ProgressPrimitive.Root.displayName;
export { Progress };`;

const SHADCN_SCROLL_AREA = `import * as React from "react";
import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area";
import { cn } from "@/lib/utils";

const ScrollArea = React.forwardRef(({ className, children, ...props }, ref) =>
  React.createElement(ScrollAreaPrimitive.Root, { ref, className: cn("relative overflow-hidden", className), ...props },
    React.createElement(ScrollAreaPrimitive.Viewport, { className: "h-full w-full rounded-[inherit]" }, children),
    React.createElement(ScrollBar, null),
    React.createElement(ScrollAreaPrimitive.Corner, null)));
ScrollArea.displayName = ScrollAreaPrimitive.Root.displayName;

const ScrollBar = React.forwardRef(({ className, orientation = "vertical", ...props }, ref) =>
  React.createElement(ScrollAreaPrimitive.ScrollAreaScrollbar, {
    ref, orientation,
    className: cn("flex touch-none select-none transition-colors",
      orientation === "vertical" && "h-full w-2.5 border-l border-l-transparent p-[1px]",
      orientation === "horizontal" && "h-2.5 flex-col border-t border-t-transparent p-[1px]",
      className),
    ...props,
  }, React.createElement(ScrollAreaPrimitive.ScrollAreaThumb, { className: "relative flex-1 rounded-full bg-border" })));
ScrollBar.displayName = ScrollAreaPrimitive.ScrollAreaScrollbar.displayName;
export { ScrollArea, ScrollBar };`;

const SHADCN_TABS = `import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";

const Tabs = TabsPrimitive.Root;

const TabsList = React.forwardRef(({ className, ...props }, ref) =>
  React.createElement(TabsPrimitive.List, {
    ref, className: cn("inline-flex h-9 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground", className), ...props }));
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = React.forwardRef(({ className, ...props }, ref) =>
  React.createElement(TabsPrimitive.Trigger, {
    ref, className: cn("inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow", className), ...props }));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = React.forwardRef(({ className, ...props }, ref) =>
  React.createElement(TabsPrimitive.Content, {
    ref, className: cn("mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2", className), ...props }));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsList, TabsTrigger, TabsContent };`;

const SHADCN_TABLE = `import * as React from "react";
import { cn } from "@/lib/utils";

const Table = React.forwardRef(({ className, ...props }, ref) =>
  React.createElement("div", { className: "relative w-full overflow-auto" },
    React.createElement("table", { ref, className: cn("w-full caption-bottom text-sm", className), ...props })));
Table.displayName = "Table";

const TableHeader = React.forwardRef(({ className, ...props }, ref) =>
  React.createElement("thead", { ref, className: cn("[&_tr]:border-b", className), ...props }));
TableHeader.displayName = "TableHeader";

const TableBody = React.forwardRef(({ className, ...props }, ref) =>
  React.createElement("tbody", { ref, className: cn("[&_tr:last-child]:border-0", className), ...props }));
TableBody.displayName = "TableBody";

const TableFooter = React.forwardRef(({ className, ...props }, ref) =>
  React.createElement("tfoot", { ref, className: cn("border-t bg-muted/50 font-medium [&>tr]:last:border-b-0", className), ...props }));
TableFooter.displayName = "TableFooter";

const TableRow = React.forwardRef(({ className, ...props }, ref) =>
  React.createElement("tr", { ref, className: cn("border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted", className), ...props }));
TableRow.displayName = "TableRow";

const TableHead = React.forwardRef(({ className, ...props }, ref) =>
  React.createElement("th", { ref, className: cn("h-10 px-2 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]", className), ...props }));
TableHead.displayName = "TableHead";

const TableCell = React.forwardRef(({ className, ...props }, ref) =>
  React.createElement("td", { ref, className: cn("p-2 align-middle [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]", className), ...props }));
TableCell.displayName = "TableCell";

const TableCaption = React.forwardRef(({ className, ...props }, ref) =>
  React.createElement("caption", { ref, className: cn("mt-4 text-sm text-muted-foreground", className), ...props }));
TableCaption.displayName = "TableCaption";

export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption };`;

const SHADCN_ALERT = `import * as React from "react";
import { cn } from "@/lib/utils";

const Alert = React.forwardRef(({ className, variant = "default", ...props }, ref) => {
  const variants = {
    default: "bg-background text-foreground",
    destructive: "border-destructive/50 text-destructive dark:border-destructive [&>svg]:text-destructive",
  };
  return React.createElement("div", {
    ref, role: "alert",
    className: cn("relative w-full rounded-lg border px-4 py-3 text-sm [&>svg+div]:translate-y-[-3px] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:text-foreground [&>svg~*]:pl-7", variants[variant] || variants.default, className),
    ...props,
  });
});
Alert.displayName = "Alert";

const AlertTitle = React.forwardRef(({ className, ...props }, ref) =>
  React.createElement("h5", { ref, className: cn("mb-1 font-medium leading-none tracking-tight", className), ...props }));
AlertTitle.displayName = "AlertTitle";

const AlertDescription = React.forwardRef(({ className, ...props }, ref) =>
  React.createElement("div", { ref, className: cn("text-sm [&_p]:leading-relaxed", className), ...props }));
AlertDescription.displayName = "AlertDescription";

export { Alert, AlertTitle, AlertDescription };`;

const SHADCN_AVATAR = `import * as React from "react";
import * as AvatarPrimitive from "@radix-ui/react-avatar";
import { cn } from "@/lib/utils";

const Avatar = React.forwardRef(({ className, ...props }, ref) =>
  React.createElement(AvatarPrimitive.Root, { ref, className: cn("relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full", className), ...props }));
Avatar.displayName = AvatarPrimitive.Root.displayName;

const AvatarImage = React.forwardRef(({ className, ...props }, ref) =>
  React.createElement(AvatarPrimitive.Image, { ref, className: cn("aspect-square h-full w-full", className), ...props }));
AvatarImage.displayName = AvatarPrimitive.Image.displayName;

const AvatarFallback = React.forwardRef(({ className, ...props }, ref) =>
  React.createElement(AvatarPrimitive.Fallback, { ref, className: cn("flex h-full w-full items-center justify-center rounded-full bg-muted", className), ...props }));
AvatarFallback.displayName = AvatarPrimitive.Fallback.displayName;

export { Avatar, AvatarImage, AvatarFallback };`;

const VIRTUAL_MODULES: Record<string, string> = {
  "@/lib/utils": SHADCN_UTILS,
  "@/components/ui/button": SHADCN_BUTTON,
  "@/components/ui/card": SHADCN_CARD,
  "@/components/ui/badge": SHADCN_BADGE,
  "@/components/ui/input": SHADCN_INPUT,
  "@/components/ui/textarea": SHADCN_TEXTAREA,
  "@/components/ui/separator": SHADCN_SEPARATOR,
  "@/components/ui/skeleton": SHADCN_SKELETON,
  "@/components/ui/progress": SHADCN_PROGRESS,
  "@/components/ui/scroll-area": SHADCN_SCROLL_AREA,
  "@/components/ui/tabs": SHADCN_TABS,
  "@/components/ui/table": SHADCN_TABLE,
  "@/components/ui/alert": SHADCN_ALERT,
  "@/components/ui/avatar": SHADCN_AVATAR,
};

// ── esbuild plugin: resolve virtual widget files + shadcn ──

function widgetPlugin(files: Record<string, string>): esbuild.Plugin {
  return {
    name: "widget-virtual-fs",
    setup(build) {
      // Resolve the entry point
      build.onResolve({ filter: /^widget-entry$/ }, () => {
        return { path: "src/main.tsx", namespace: "widget" };
      });

      // Resolve @/ imports to virtual modules (shadcn or widget files)
      build.onResolve({ filter: /^@\// }, (args) => {
        const modPath = args.path;
        if (VIRTUAL_MODULES[modPath]) {
          return { path: modPath, namespace: "virtual" };
        }
        const candidates = [modPath.replace("@/", "src/")];
        if (!modPath.match(/\.(tsx?|jsx?|css)$/)) {
          candidates.push(
            modPath.replace("@/", "src/") + ".tsx",
            modPath.replace("@/", "src/") + ".ts",
            modPath.replace("@/", "src/") + ".js",
            modPath.replace("@/", "src/") + "/index.tsx",
            modPath.replace("@/", "src/") + "/index.ts",
          );
        }
        for (const candidate of candidates) {
          if (files[candidate]) {
            return { path: candidate, namespace: "widget" };
          }
        }
        if (modPath.startsWith("@/components/ui/")) {
          return { path: modPath, namespace: "virtual-stub" };
        }
        return { path: modPath, namespace: "widget" };
      });

      // Resolve relative imports within widget files
      build.onResolve({ filter: /^\./ }, (args) => {
        if (args.namespace !== "widget" && args.namespace !== "virtual") return;

        const dir = args.importer ? path.dirname(args.importer) : "src";
        const resolved = path.posix.join(dir, args.path);
        const candidates = [resolved];
        if (!resolved.match(/\.(tsx?|jsx?|css)$/)) {
          candidates.push(
            resolved + ".tsx",
            resolved + ".ts",
            resolved + ".js",
            resolved + "/index.tsx",
            resolved + "/index.ts",
          );
        }

        for (const candidate of candidates) {
          if (files[candidate]) {
            return { path: candidate, namespace: "widget" };
          }
        }

        return { path: resolved, namespace: "widget" };
      });

      // Load virtual shadcn modules
      build.onLoad({ filter: /.*/, namespace: "virtual" }, (args) => {
        const content = VIRTUAL_MODULES[args.path];
        if (content) {
          return { contents: content, loader: "tsx" };
        }
        return { contents: "export default {};", loader: "js" };
      });

      // Stub for shadcn components we don't have inline
      build.onLoad({ filter: /.*/, namespace: "virtual-stub" }, () => {
        return { contents: "export default function Stub(props) { return null; }", loader: "jsx" };
      });

      // Load widget source files
      build.onLoad({ filter: /.*/, namespace: "widget" }, (args) => {
        const content = files[args.path];
        if (content !== undefined) {
          const ext = path.extname(args.path);
          const loaderMap: Record<string, esbuild.Loader> = {
            ".tsx": "tsx", ".ts": "ts", ".jsx": "jsx", ".js": "js", ".css": "css", ".json": "json",
          };
          return { contents: content, loader: loaderMap[ext] || "tsx" };
        }
        return { contents: `export default undefined;`, loader: "js" };
      });
    },
  };
}

// ── HTML template ──

function generateHTML(widgetId: string, extraDeps: string[]): string {
  const importMap = { ...IMPORT_MAP };

  for (const dep of extraDeps) {
    if (!importMap[dep]) {
      importMap[dep] = `https://esm.sh/${dep}?external=react,react-dom`;
    }
  }

  return `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Widget</title>
  <script src="https://cdn.tailwindcss.com"><\/script>
  <script>
    tailwind.config = {
      darkMode: 'class',
      theme: {
        extend: {
          colors: {
            border: 'hsl(var(--border))',
            input: 'hsl(var(--input))',
            ring: 'hsl(var(--ring))',
            background: 'hsl(var(--background))',
            foreground: 'hsl(var(--foreground))',
            primary: { DEFAULT: 'hsl(var(--primary))', foreground: 'hsl(var(--primary-foreground))' },
            secondary: { DEFAULT: 'hsl(var(--secondary))', foreground: 'hsl(var(--secondary-foreground))' },
            destructive: { DEFAULT: 'hsl(var(--destructive))', foreground: 'hsl(var(--destructive-foreground))' },
            muted: { DEFAULT: 'hsl(var(--muted))', foreground: 'hsl(var(--muted-foreground))' },
            accent: { DEFAULT: 'hsl(var(--accent))', foreground: 'hsl(var(--accent-foreground))' },
            popover: { DEFAULT: 'hsl(var(--popover))', foreground: 'hsl(var(--popover-foreground))' },
            card: { DEFAULT: 'hsl(var(--card))', foreground: 'hsl(var(--card-foreground))' },
          },
          borderRadius: {
            lg: 'var(--radius)',
            md: 'calc(var(--radius) - 2px)',
            sm: 'calc(var(--radius) - 4px)',
          },
        },
      },
    };
  <\/script>
  <link rel="stylesheet" href="https://esm.sh/maplibre-gl@4.7.0/dist/maplibre-gl.css" />
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    html, body {
      margin: 0; padding: 0; width: 100%; height: 100%;
      font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
      font-size: 13px; overflow: hidden; background: transparent; color: #f4f4f5;
    }
    #root { width: 100%; height: 100%; }
    ::-webkit-scrollbar { width: 4px; height: 4px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: #525252; border-radius: 2px; }
    ::-webkit-scrollbar-thumb:hover { background: #737373; }
    * { scrollbar-width: thin; scrollbar-color: #525252 transparent; }

    /* shadcn css variables */
    :root {
      --background: 0 0% 100%;
      --foreground: 240 10% 3.9%;
      --card: 0 0% 100%;
      --card-foreground: 240 10% 3.9%;
      --popover: 0 0% 100%;
      --popover-foreground: 240 10% 3.9%;
      --primary: 240 5.9% 10%;
      --primary-foreground: 0 0% 98%;
      --secondary: 240 4.8% 95.9%;
      --secondary-foreground: 240 5.9% 10%;
      --muted: 240 4.8% 95.9%;
      --muted-foreground: 240 3.8% 46.1%;
      --accent: 240 4.8% 95.9%;
      --accent-foreground: 240 5.9% 10%;
      --destructive: 0 84.2% 60.2%;
      --destructive-foreground: 0 0% 98%;
      --border: 240 5.9% 90%;
      --input: 240 5.9% 90%;
      --ring: 240 5.9% 10%;
      --radius: 0.5rem;
    }
    .dark {
      --background: 240 10% 3.9%;
      --foreground: 0 0% 98%;
      --card: 240 10% 3.9%;
      --card-foreground: 0 0% 98%;
      --popover: 240 10% 3.9%;
      --popover-foreground: 0 0% 98%;
      --primary: 0 0% 98%;
      --primary-foreground: 240 5.9% 10%;
      --secondary: 240 3.7% 15.9%;
      --secondary-foreground: 0 0% 98%;
      --muted: 240 3.7% 15.9%;
      --muted-foreground: 240 5% 64.9%;
      --accent: 240 3.7% 15.9%;
      --accent-foreground: 0 0% 98%;
      --destructive: 0 62.8% 30.6%;
      --destructive-foreground: 0 0% 98%;
      --border: 240 3.7% 15.9%;
      --input: 240 3.7% 15.9%;
      --ring: 240 4.9% 83.9%;
    }
    * { border-color: hsl(var(--border)); }
    body { background-color: hsl(var(--background)); color: hsl(var(--foreground)); }
  </style>
  <script type="importmap">
    ${JSON.stringify({ imports: importMap }, null, 2)}
  <\/script>
</head>
<body style="margin:0; background:transparent;">
  <div id="root"></div>
  <script type="module" src="./widget.js"><\/script>
</body>
</html>`;
}

// ── Build a widget with esbuild ──

const BUILD_TIMEOUT_MS = 30_000;

async function doBuild(widgetId: string): Promise<void> {
  const startTime = Date.now();
  widgetStatuses.set(widgetId, { status: "building", startedAt: startTime });

  try {
    const files = getWidgetFiles(widgetId);
    if (!files["src/App.tsx"]) {
      widgetStatuses.set(widgetId, { status: "error", error: "No src/App.tsx found" });
      console.error(`[widget-builder] No src/App.tsx for ${widgetId}`);
      return;
    }

    // Add the entry point (main.tsx) if not provided
    if (!files["src/main.tsx"]) {
      files["src/main.tsx"] = `import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";

createRoot(document.getElementById("root")).render(
  React.createElement(React.StrictMode, null, React.createElement(App, null))
);`;
    }

    // Parse extra deps
    let extraDeps: string[] = [];
    try {
      if (files["deps.json"]) {
        extraDeps = JSON.parse(files["deps.json"]);
      }
    } catch {
      // ignore
    }

    // All packages that should be external (loaded via import map)
    const allExternals = [...EXTERNAL_PACKAGES, ...extraDeps];

    const result = await esbuild.build({
      entryPoints: ["widget-entry"],
      bundle: true,
      format: "esm",
      platform: "browser",
      target: "es2020",
      jsx: "automatic",
      jsxImportSource: "react",
      external: allExternals,
      plugins: [widgetPlugin(files)],
      write: false,
      minify: true,
      sourcemap: false,
      logLevel: "silent",
    });

    if (result.errors.length > 0) {
      const errorMsg = result.errors.map((e) => e.text).join("\n");
      console.error(`[widget-builder] Build errors for ${widgetId}:`, errorMsg);
      widgetStatuses.set(widgetId, { status: "error", error: errorMsg });
      return;
    }

    const jsOutput = result.outputFiles?.[0]?.text ?? "";
    const html = generateHTML(widgetId, extraDeps);

    // Write to dist directory
    const widgetDir = path.join(DIST_DIR, widgetId);
    fs.mkdirSync(widgetDir, { recursive: true });
    fs.writeFileSync(path.join(widgetDir, "index.html"), html, "utf-8");
    fs.writeFileSync(path.join(widgetDir, "widget.js"), jsOutput, "utf-8");

    const elapsed = Date.now() - startTime;
    console.log(`[widget-builder] Widget ${widgetId} built in ${elapsed}ms`);
    widgetStatuses.set(widgetId, { status: "ready" });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[widget-builder] Build error for ${widgetId}:`, err);
    widgetStatuses.set(widgetId, { status: "error", error: errorMsg });
  }
}

// ── Public API ──

export async function buildWidget(widgetId: string): Promise<void> {
  const existing = buildLocks.get(widgetId);
  if (existing) await existing;

  const promise = doBuild(widgetId);
  buildLocks.set(widgetId, promise);
  try {
    await promise;
  } finally {
    buildLocks.delete(widgetId);
  }
}

export async function ensureWidget(widgetId: string): Promise<WidgetStatus> {
  const existing = widgetStatuses.get(widgetId);
  if (existing && existing.status === "ready") {
    // Verify output still exists on disk
    const indexPath = path.join(DIST_DIR, widgetId, "index.html");
    if (fs.existsSync(indexPath)) {
      return existing;
    }
  }

  const isStaleBuilding =
    existing?.status === "building" &&
    existing.startedAt &&
    Date.now() - existing.startedAt > BUILD_TIMEOUT_MS;

  if (existing?.status === "building" && !isStaleBuilding) {
    return existing;
  }

  // Check if already built on disk
  const indexPath = path.join(DIST_DIR, widgetId, "index.html");
  if (fs.existsSync(indexPath)) {
    const status: WidgetStatus = { status: "ready" };
    widgetStatuses.set(widgetId, status);
    return status;
  }

  const status: WidgetStatus & { startedAt: number } = { status: "building", startedAt: Date.now() };
  widgetStatuses.set(widgetId, status);
  buildWidget(widgetId).catch((err) => {
    console.error(`[widget-builder] Background build failed for ${widgetId}:`, err);
  });
  return status;
}

export async function rebuildWidget(widgetId: string): Promise<WidgetStatus> {
  const status: WidgetStatus = { status: "building" };
  widgetStatuses.set(widgetId, { ...status, startedAt: Date.now() });

  buildWidget(widgetId).catch((err) => {
    console.error(`[widget-builder] Rebuild failed for ${widgetId}:`, err);
  });

  return status;
}

export async function stopWidget(widgetId: string): Promise<void> {
  widgetStatuses.delete(widgetId);
  const widgetDir = path.join(DIST_DIR, widgetId);
  try {
    fs.rmSync(widgetDir, { recursive: true, force: true });
  } catch {
    // Directory might not exist
  }
}

export function getWidgetStatus(widgetId: string): WidgetStatus | null {
  return widgetStatuses.get(widgetId) ?? null;
}

export function getWidgetDistPath(widgetId: string, subPath?: string): string {
  if (subPath) {
    return path.join(DIST_DIR, widgetId, subPath);
  }
  return path.join(DIST_DIR, widgetId);
}
