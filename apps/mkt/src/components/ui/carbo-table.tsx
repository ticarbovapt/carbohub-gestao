import * as React from "react";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";

const CarboTable = React.forwardRef<
  HTMLTableElement,
  React.HTMLAttributes<HTMLTableElement>
>(({ className, ...props }, ref) => (
  <div className="relative w-full overflow-auto rounded-xl border border-border">
    <table
      ref={ref}
      className={cn("w-full caption-bottom text-sm", className)}
      {...props}
    />
  </div>
));
CarboTable.displayName = "CarboTable";

const CarboTableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead
    ref={ref}
    className={cn("bg-muted/50 [&_tr]:border-b", className)}
    {...props}
  />
));
CarboTableHeader.displayName = "CarboTableHeader";

const CarboTableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody
    ref={ref}
    className={cn("[&_tr:last-child]:border-0", className)}
    {...props}
  />
));
CarboTableBody.displayName = "CarboTableBody";

const CarboTableFooter = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tfoot
    ref={ref}
    className={cn(
      "border-t bg-muted/50 font-medium [&>tr]:last:border-b-0",
      className
    )}
    {...props}
  />
));
CarboTableFooter.displayName = "CarboTableFooter";

const CarboTableRow = React.forwardRef<
  HTMLTableRowElement,
  React.HTMLAttributes<HTMLTableRowElement> & { interactive?: boolean }
>(({ className, interactive, ...props }, ref) => (
  <tr
    ref={ref}
    className={cn(
      "border-b transition-colors",
      interactive && "hover:bg-secondary/50 cursor-pointer",
      "data-[state=selected]:bg-muted",
      className
    )}
    {...props}
  />
));
CarboTableRow.displayName = "CarboTableRow";

interface CarboTableHeadProps extends React.ThHTMLAttributes<HTMLTableCellElement> {
  sortable?: boolean;
  sortDirection?: "asc" | "desc" | null;
  onSort?: () => void;
}

const CarboTableHead = React.forwardRef<HTMLTableCellElement, CarboTableHeadProps>(
  ({ className, sortable, sortDirection, onSort, children, ...props }, ref) => (
    <th
      ref={ref}
      className={cn(
        "h-12 px-4 text-left align-middle font-semibold text-muted-foreground [&:has([role=checkbox])]:pr-0",
        sortable && "cursor-pointer select-none hover:text-foreground",
        className
      )}
      onClick={sortable ? onSort : undefined}
      {...props}
    >
      <div className="flex items-center gap-1">
        {children}
        {sortable && (
          <span className="ml-1">
            {sortDirection === "asc" ? (
              <ChevronUp className="h-4 w-4" />
            ) : sortDirection === "desc" ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronsUpDown className="h-3.5 w-3.5 opacity-50" />
            )}
          </span>
        )}
      </div>
    </th>
  )
);
CarboTableHead.displayName = "CarboTableHead";

const CarboTableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <td
    ref={ref}
    className={cn("p-4 align-middle [&:has([role=checkbox])]:pr-0", className)}
    {...props}
  />
));
CarboTableCell.displayName = "CarboTableCell";

const CarboTableCaption = React.forwardRef<
  HTMLTableCaptionElement,
  React.HTMLAttributes<HTMLTableCaptionElement>
>(({ className, ...props }, ref) => (
  <caption
    ref={ref}
    className={cn("mt-4 text-sm text-muted-foreground", className)}
    {...props}
  />
));
CarboTableCaption.displayName = "CarboTableCaption";

export {
  CarboTable,
  CarboTableHeader,
  CarboTableBody,
  CarboTableFooter,
  CarboTableHead,
  CarboTableRow,
  CarboTableCell,
  CarboTableCaption,
};
