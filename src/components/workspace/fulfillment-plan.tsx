import { CalendarCheck, CalendarX, Factory, PackageCheck, Truck, Warehouse } from "lucide-react";
import { Mono } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";

/**
 * Where the goods come from, and whether they arrive in time.
 *
 * The segmented bar is the one graphic on the case and it earns its place:
 * each segment is a share of this order drawn from one location, so a split
 * shipment is visible before a single number is read.
 */

export interface FulfillmentSource {
  warehouseCode: string;
  location: string;
  quantity: number;
  source: string;
  readyDate: string;
}

export interface FulfillmentLine {
  sku: string;
  quantity: number;
  sources: FulfillmentSource[];
}

const SEGMENT = ["bg-accent-500", "bg-accent-300", "bg-accent-200", "bg-ink-300"];

const SOURCE_LABEL: Record<string, { label: string; icon: typeof Warehouse }> = {
  STOCK: { label: "On-hand stock", icon: Warehouse },
  INBOUND: { label: "Confirmed inbound", icon: Truck },
  FACTORY: { label: "Factory build", icon: Factory },
};

export function FulfillmentPlan({ lines }: { lines: FulfillmentLine[] }) {
  return (
    <div>
      {lines.map((line) => {
        const split = line.sources.length > 1;
        return (
          <div key={line.sku} className="px-4 py-4">
            <div className="flex flex-wrap items-center gap-2">
              <Mono className="!text-[13px] font-semibold text-ink-900">{line.sku}</Mono>
              <span className="tnum t-small text-ink-600">{line.quantity} units</span>
              <span
                className={cn(
                  "inline-flex h-5 items-center rounded px-1.5 text-[11px] font-medium",
                  split ? "bg-accent-50 text-accent-700 ring-1 ring-inset ring-accent-200" : "bg-pass-50 text-pass-700 ring-1 ring-inset ring-pass-200",
                )}
              >
                {split ? `Split across ${line.sources.length} locations` : "Single shipment"}
              </span>
            </div>

            <div className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-ink-100" role="img" aria-label={line.sources.map((s) => `${s.quantity} from ${s.location}`).join(", ")}>
              {line.sources.map((s, i) => (
                <div
                  key={`${s.warehouseCode}-${i}`}
                  className={cn(SEGMENT[i % SEGMENT.length], i > 0 && "border-l-2 border-white")}
                  style={{ width: `${(s.quantity / Math.max(1, line.quantity)) * 100}%` }}
                />
              ))}
            </div>

            <div className={cn("mt-3 grid gap-2.5", line.sources.length > 1 ? "sm:grid-cols-2" : "")}>
              {line.sources.map((s, i) => {
                const src = SOURCE_LABEL[s.source] ?? { label: s.source, icon: Warehouse };
                const Icon = src.icon;
                return (
                  <div key={`${s.warehouseCode}-${i}`} className="flex items-start gap-3 rounded-md border border-[var(--hairline)] px-3 py-2.5">
                    <span className={cn("mt-1 size-2.5 shrink-0 rounded-sm", SEGMENT[i % SEGMENT.length])} aria-hidden />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="t-heading truncate text-ink-900">{s.location}</span>
                        <span className="tnum text-[17px] font-semibold tracking-[-0.015em] text-ink-900">{s.quantity}</span>
                      </div>
                      <div className="t-small mt-0.5 flex items-center justify-between gap-2 text-ink-500">
                        <span className="flex items-center gap-1">
                          <Icon className="size-3" aria-hidden />
                          {src.label} · <Mono className="!text-[11px] text-ink-500">{s.warehouseCode}</Mono>
                        </span>
                        <span>Ready {s.readyDate}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function FulfillmentFooter({
  freightService,
  freightCost,
  estimatedDelivery,
  requiredBy,
  onTime,
}: {
  freightService: string;
  freightCost: string;
  estimatedDelivery: string | null;
  requiredBy: string | null;
  onTime: boolean | null;
}) {
  const DateIcon = onTime === false ? CalendarX : CalendarCheck;
  return (
    <div className="grid grid-cols-1 gap-px border-t border-[var(--hairline)] bg-[var(--hairline)] sm:grid-cols-3">
      <Fact icon={Truck} label="Freight" value={freightService} note={freightCost} />
      <Fact icon={PackageCheck} label="Estimated delivery" value={estimatedDelivery ?? "—"} />
      <Fact
        icon={DateIcon}
        label="Customer needs it by"
        value={requiredBy ?? "Not stated"}
        note={onTime === null ? undefined : onTime ? "On time" : "Late — approval raised"}
        tone={onTime === null ? undefined : onTime ? "pass" : "fail"}
      />
    </div>
  );
}

function Fact({
  icon: Icon,
  label,
  value,
  note,
  tone,
}: {
  icon: typeof Truck;
  label: string;
  value: string;
  note?: string;
  tone?: "pass" | "fail";
}) {
  return (
    <div className="bg-white px-4 py-2.5">
      <div className="t-small flex items-center gap-1.5 text-ink-500">
        <Icon className="size-3.5" aria-hidden />
        {label}
      </div>
      <div className="mt-0.5 flex items-baseline gap-2">
        <span className="t-heading text-ink-900">{value}</span>
        {note ? (
          <span className={cn("t-small", tone === "pass" ? "text-pass-700" : tone === "fail" ? "text-fail-700" : "text-ink-500")}>{note}</span>
        ) : null}
      </div>
    </div>
  );
}
